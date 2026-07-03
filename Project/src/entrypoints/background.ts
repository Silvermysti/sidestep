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
  serveNextLink,
} from '@/lib/sites';
import {
  startState,
  pauseState,
  resumeState,
  resetState,
  setModeState,
  completeState,
} from '@/lib/timer';

const TIMER_ALARM = 'sidestep-timer-end';
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

  // Commands coming from the popup.
  browser.runtime.onMessage.addListener((message) => {
    return handleCommand(message);
  });

  // The clock waking us up when a session is due to finish, or a freedom window
  // reaching its end so we can clear it.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TIMER_ALARM) handleSessionEnd();
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

// Repair the saved lists in place: guarantee `topics` is an object and every
// topic maps to an array. Only writes when something was actually wrong, so we
// don't churn storage on every startup.
async function healLists() {
  const stored: any = await lists.getValue();
  if (!stored || typeof stored !== 'object') return; // fallback covers a missing value

  // A valid `topics` is a plain object (not null, not an array).
  const validTopics =
    stored.topics && typeof stored.topics === 'object' && !Array.isArray(stored.topics);
  const topics = validTopics ? stored.topics : {};
  let changed = !validTopics;

  const fixed: Record<string, any[]> = {};
  for (const [name, links] of Object.entries(topics)) {
    if (Array.isArray(links)) {
      fixed[name] = links;
    } else {
      fixed[name] = []; // a non-list topic was the crash source — reset it
      changed = true;
    }
  }
  if (Object.keys(fixed).length === 0) {
    fixed.General = []; // never leave the user with no topics at all
    changed = true;
  }

  if (changed) await lists.setValue({ ...stored, topics: fixed });
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

  // Not on the list → substitute: serve the next useful link, advance, save.
  const { link, lists: updated } = serveNextLink(l);
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
    case 'setMode':
      next = setModeState(t, s, message.mode);
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

// A session reached zero: flip focus<->break, go idle, and notify the user.
async function handleSessionEnd() {
  const [t, s] = await Promise.all([timer.getValue(), settings.getValue()]);
  const finishedMode = t.mode;
  await timer.setValue(completeState(t, s));
  await browser.alarms.clear(TIMER_ALARM);
  notify(finishedMode);
}

function notify(finishedMode: string) {
  const isFocus = finishedMode === 'focus';
  browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: isFocus ? 'Focus session complete' : 'Break over',
    message: isFocus
      ? 'Nice work. Time for a short break.'
      : 'Break done — ready to focus again?',
  });
}
