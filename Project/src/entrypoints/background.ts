// The BACKGROUND service worker — the "brain".
//
// It is the only place that OWNS the timer. The popup just sends it commands
// (messages) and reads the result from storage. The background also sets a
// `chrome.alarms` alarm so it gets woken up exactly when a session ends — even
// if it has gone to sleep in the meantime (service workers sleep to save memory,
// which is why a normal setInterval countdown would NOT survive here).

import { allowances, lists, settings, SETTINGS_DEFAULTS, timer } from '@/lib/storage';
import {
  activeAllowance,
  buildAllowedKeys,
  canonicalKey,
  hostnameOf,
  isDistracting,
  linkTitle,
  linkUrl,
  matchingSite,
  migrateLists,
  serveNextLink,
} from '@/lib/sites';
import {
  startState,
  pauseState,
  resumeState,
  resetState,
  completeState,
  isRunOver,
  totalCycles,
} from '@/lib/timer';

const TIMER_ALARM = 'sidestep-timer-end';
// A safety net. The exact alarm above is what SHOULD wake us at the end of a
// session, but a service worker is shut down whenever Chrome feels like it, and
// a single dropped alarm would leave the timer frozen at zero forever. So we also
// tick once a minute (the shortest period Chrome allows) and roll the timer
// forward if it has already run out. Belt and braces.
const TICK_ALARM = 'sidestep-tick';
// A timed freedom window uses an alarm named `sidestep-freedom:<site>` so it can
// clean itself up when it expires (e.g. "youtube.com: free for 15 min").
const FREEDOM_PREFIX = 'sidestep-freedom:';

export default defineBackground(() => {
  // Settings saved by an older version may be missing keys added later (the
  // storage fallback only applies when NOTHING is saved). Top up any missing
  // keys from the defaults so the rest of the code always sees a full object.
  healSettings();

  // Likewise, scrub the saved lists: a topic that somehow got stored as anything
  // other than an array would crash the navigation handler (for…of over a
  // non-list) and silently stop the redirect. Reset any bad topic to an empty
  // list so blocking can never be broken by corrupted data.
  healLists();

  // The service worker has just started (browser launch, extension reload, or
  // Chrome waking us for an event). Any session that ran out while we were asleep
  // is rolled forward now, and the once-a-minute safety tick is (re)armed.
  browser.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  reconcile();

  // Commands coming from the popup.
  browser.runtime.onMessage.addListener((message) => {
    return handleCommand(message);
  });

  // The clock waking us up: a session due to finish, the safety tick, or a
  // freedom window reaching its end so we can clean it up.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TIMER_ALARM || alarm.name === TICK_ALARM) reconcile();
    else if (alarm.name.startsWith(FREEDOM_PREFIX)) {
      expireAllowance(alarm.name.slice(FREEDOM_PREFIX.length));
    }
  });

  // The substitution engine. We watch page navigations; during a running focus
  // session, heading to one of the user's redirect sites sends the tab to our
  // nudge page, which offers their own useful link instead.
  //
  // We listen to TWO events because modern sites navigate in two different ways:
  //   onBeforeNavigate     — a real, fresh page load (typing a URL, clicking a
  //                          normal link).
  //   onHistoryStateUpdated — a single-page-app (SPA) URL change, e.g. clicking
  //                          a video on YouTube, where the page swaps content
  //                          and updates the URL without a full reload.
  browser.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) return; // top-level only, not iframes
    handleNavigation(details);
  });
  browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0) return;
    handleNavigation(details);
  });
});

// Fill in any settings keys missing from older saved data. We keep whatever the
// user has set and only add what's absent; an existing (even empty) array is
// left alone so we never clobber the user's own block list.
async function healSettings() {
  const stored: any = await settings.getValue();
  const needsFix =
    !stored ||
    !Array.isArray(stored.distractingSites) ||
    stored.focusMinutes == null ||
    stored.breakMinutes == null ||
    stored.cycles == null ||
    stored.linkOrder == null;
  if (!needsFix) return;
  await settings.setValue({
    ...SETTINGS_DEFAULTS,
    ...stored,
    distractingSites: Array.isArray(stored?.distractingSites)
      ? stored.distractingSites
      : SETTINGS_DEFAULTS.distractingSites,
  });
}

// Bring the saved lists up to date and make them safe to loop over.
//
// Two jobs. First, MIGRATE: saves from before links were bucketed by site still
// carry topic folders, so we re-file every link under the site it lives on and
// drop `topics` for good. Second, HEAL: guarantee `sites` is a plain object and
// every bucket is an array, because a bucket stored as anything else would crash
// the navigation handler (a for…of over a non-list) and silently stop the
// redirect. We only write when something actually changed, so we don't churn
// storage on every startup.
async function healLists() {
  const stored: any = await lists.getValue();
  if (!stored || typeof stored !== 'object') return; // fallback covers a missing value

  const migrated = migrateLists(stored); // null when already the new shape
  const base: any = migrated ?? stored;
  let changed = migrated != null;

  const validSites = base.sites && typeof base.sites === 'object' && !Array.isArray(base.sites);
  if (!validSites) changed = true;

  const fixed: Record<string, any[]> = {};
  for (const [key, links] of Object.entries(validSites ? base.sites : {})) {
    if (Array.isArray(links)) {
      if (links.length) fixed[key] = links; // drop buckets that are now empty
      else changed = true;
    } else {
      changed = true; // a non-list bucket was the crash source — drop it
    }
  }

  const cursors =
    base.cursors && typeof base.cursors === 'object' && !Array.isArray(base.cursors)
      ? base.cursors
      : ((changed = true), {});

  if (changed) await lists.setValue({ sites: fixed, cursors });
}

async function handleNavigation(details: any) {
  const host = hostnameOf(details.url);
  if (!host) return;

  // Only intercept during a running FOCUS session — breaks and idle are free.
  const t = await timer.getValue();
  const s = await settings.getValue();
  const blocked = isDistracting(host, s.distractingSites);
  console.log('[Sidestep] nav', { host, status: t.status, mode: t.mode, blocked });

  if (t.status !== 'running' || t.mode !== 'focus') return;
  if (!blocked) return;

  // Freedom window: if the user has granted this site a temporary pass, let it
  // through. Every OTHER blocked site stays protected.
  const a = await allowances.getValue();
  if (activeAllowance(host, a)) return;

  // It's a blocked site — but if THIS exact page/video is one the user saved as
  // useful, let it through. We test against a Set (hash lookup, ~O(1)) of the
  // canonical keys of every saved link, instead of scanning the lists each time.
  const l = await lists.getValue();
  const allowed = buildAllowedKeys(l);
  const key = canonicalKey(details.url);
  if (key && allowed.has(key)) {
    console.log('[Sidestep] allowed — on your list', key);
    return;
  }

  // Not on the list → substitute. We ask for the next link saved for THIS site,
  // so reaching for YouTube gets you your next saved YouTube video rather than
  // something unrelated. If nothing is saved for it, serveNextLink falls back to
  // whichever site has links, so the page is never a dead end.
  const { link, lists: updated } = serveNextLink(l, host);
  await lists.setValue(updated);

  const url = linkUrl(link);
  const title = linkTitle(link);
  const nudgeUrl =
    browser.runtime.getURL('/nudge.html') +
    `?from=${encodeURIComponent(host)}` +
    `&orig=${encodeURIComponent(details.url)}` + // so "allow + go" can return here
    (url ? `&to=${encodeURIComponent(url)}` : '') +
    (title ? `&title=${encodeURIComponent(title)}` : '');

  browser.tabs.update(details.tabId, { url: nudgeUrl });
}

async function handleCommand(message: any) {
  const action = message?.action;
  if (!action) return;

  // Freedom-window commands don't touch the timer, so handle them first.
  if (action === 'allowSite') return allowSite(message.host, message.minutes);
  if (action === 'revokeSite') return revokeSite(message.host);

  // The popup's countdown hit zero and it wants the handover NOW, rather than
  // waiting for an alarm. Harmless if nothing is actually due.
  if (action === 'sync') {
    await reconcile();
    return timer.getValue();
  }

  const [t, s] = await Promise.all([timer.getValue(), settings.getValue()]);
  let next = t;

  switch (action) {
    case 'start':
      next = startState(t, s);
      break;
    case 'pause':
      next = pauseState(t);
      break;
    case 'resume':
      next = resumeState(t);
      break;
    case 'reset':
      next = resetState(t, s);
      break;
    default:
      return;
  }

  await timer.setValue(next);
  await syncAlarm(next);
  return next;
}

// Grant a freedom window. `minutes` is a number, or 'forever' for no time limit.
// We key the allowance to the whole site family the host belongs to (so allowing
// after a visit to m.youtube.com covers youtube.com too), and set a self-cleanup
// alarm for timed windows.
async function allowSite(host: string, minutes: number | 'forever') {
  const cleanHost = hostnameOf(host) ?? host;
  const s = await settings.getValue();
  const site = matchingSite(cleanHost, s.distractingSites);

  const expiry = minutes === 'forever' ? 'forever' : Date.now() + minutes * 60 * 1000;
  const a = await allowances.getValue();
  await allowances.setValue({ ...a, [site]: expiry });

  await browser.alarms.clear(FREEDOM_PREFIX + site);
  if (expiry !== 'forever') {
    browser.alarms.create(FREEDOM_PREFIX + site, { when: expiry });
  }
  return { site, expiry };
}

// Turn a freedom window off (manually or because it expired).
async function revokeSite(host: string) {
  const cleanHost = hostnameOf(host) ?? host;
  const s = await settings.getValue();
  const site = matchingSite(cleanHost, s.distractingSites);
  await dropAllowance(site);
  return { site };
}

// Remove one allowance entry and its alarm. `site` here is already the stored key.
async function dropAllowance(site: string) {
  const a = await allowances.getValue();
  if (site in a) {
    const { [site]: _, ...rest } = a;
    await allowances.setValue(rest);
  }
  await browser.alarms.clear(FREEDOM_PREFIX + site);
}

// An alarm fired for a timed window — clear it (the key is the exact stored site).
async function expireAllowance(site: string) {
  await dropAllowance(site);
}

// Keep the alarm in sync with the timer: one alarm when running, none otherwise.
async function syncAlarm(t: any) {
  await browser.alarms.clear(TIMER_ALARM);
  if (t.status === 'running' && t.endsAt) {
    browser.alarms.create(TIMER_ALARM, { when: t.endsAt });
  }
}

// Bring the timer up to date with the wall clock.
//
// This is the ONLY place a session is completed, and it is safe to call at any
// moment — on a wake-up, on the safety tick, or when the popup asks. It asks one
// question: has the running session already run out? If so it rolls forward,
// exactly as if we'd been awake at the moment it ended.
//
// It rolls forward in a LOOP because we may have been asleep (or the laptop shut)
// for longer than a whole session: a 25/5 run left alone for an hour has to walk
// through several boundaries to arrive at the right place. Each step is completed
// at its true boundary time (`t.endsAt`), not "now", so the rounds land where they
// would have landed had we never slept.
async function reconcile() {
  const s = await settings.getValue();
  let t: any = await timer.getValue();
  if (t.status !== 'running' || !t.endsAt) return; // idle or paused: nothing is due

  let finished: any = null; // the last session we actually completed
  let guard = 0; // a long sleep shouldn't spin forever
  while (t.status === 'running' && t.endsAt && t.endsAt <= Date.now() && guard++ < 500) {
    finished = t;
    t = completeState(t, s, t.endsAt);
  }
  if (!finished) return; // still running, plenty of time left

  await timer.setValue(t);
  await syncAlarm(t);
  // One notification, about the session that just ended. If we caught up over
  // several missed boundaries, telling you about each one would be a pile-up.
  notify(finished, s, t);
}

// Say what actually just happened. Three different moments, three messages —
// "Break over" would be wrong for the end of the final round, and silence about
// which round you're on makes a long run feel endless.
function notify(finished: any, s: any, next: any) {
  const total = totalCycles(s);
  const rounds = total === Infinity ? '' : ` of ${total}`;

  let title: string;
  let message: string;
  if (finished.mode === 'focus') {
    title = 'Focus done — break time';
    message = `Round ${finished.cycle ?? 1}${rounds}. Go rest, ${s.breakMinutes} min on the clock.`;
  } else if (isRunOver(finished, s)) {
    title = 'All rounds complete';
    message = `That's ${total} focus ${total === 1 ? 'round' : 'rounds'} done. Nice work.`;
  } else {
    title = 'Break over — back to focus';
    message = `Round ${next.cycle}${rounds} starting now.`;
  }

  browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title,
    message,
  });
}
