// The BACKGROUND service worker — the "brain".
//
// It is the only place that OWNS the timer. The popup just sends it commands
// (messages) and reads the result from storage. The background also sets a
// `chrome.alarms` alarm so it gets woken up exactly when a session ends — even
// if it has gone to sleep in the meantime (service workers sleep to save memory,
// which is why a normal setInterval countdown would NOT survive here).

import { allowances, heartbeat, progress, settings, SETTINGS_DEFAULTS, timer } from '@/lib/storage';
import { COMPANIONS, unlockedKeys } from '@/lib/companions';
import {
  activeAllowance,
  hostnameOf,
  isDistracting,
  matchingSite,
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
// The safety tick runs once a minute, so a heartbeat gap much bigger than that
// means nothing of ours ran for a while — the laptop slept or Chrome was closed.
// Anything past this counts as "we were away", and a running session is paused.
const WAKE_GAP_MS = 2 * 60 * 1000;

// XP tuning: one focused minute earns 1 XP (XP is measured in focus minutes).
// The once-a-minute tick applies it with the real elapsed awake time. Unlock
// thresholds live in companions.js.
const XP_PER_MIN = 1;

export default defineBackground(() => {
  // Settings saved by an older version may be missing keys added later (the
  // storage fallback only applies when NOTHING is saved). Top up any missing
  // keys from the defaults so the rest of the code always sees a full object.
  healSettings();

  // The service worker has just started (browser launch, extension reload, or
  // Chrome waking us for an event). Any session that ran out while we were asleep
  // is rolled forward now, and the once-a-minute safety tick is (re)armed.
  browser.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  wake();

  // A fresh browser launch — Chrome was fully quit (user closed it, or the laptop
  // shut down) and has just reopened. This fires ONLY on a real relaunch, never on
  // an OS sleep/resume that left Chrome running, and never when the service worker
  // merely wakes for an event. So it is exactly the "the browser was closed" case,
  // where we RESET a leftover session instead of pausing it (sleep still pauses,
  // handled by beat()). A dev "reload extension" does NOT fire this, so testing
  // reloads won't wipe the timer.
  browser.runtime.onStartup.addListener(() => {
    resetOnBrowserRestart();
  });

  // Commands coming from the popup.
  browser.runtime.onMessage.addListener((message) => {
    return handleCommand(message);
  });

  // The clock waking us up: a session due to finish, the safety tick, or a
  // freedom window reaching its end so we can clean it up.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TIMER_ALARM || alarm.name === TICK_ALARM) wake();
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
    stored.companion == null ||
    stored.showOnPage == null ||
    stored.theme == null;
  if (!needsFix) return;
  await settings.setValue({
    ...SETTINGS_DEFAULTS,
    ...stored,
    distractingSites: healBlockList(stored?.distractingSites),
  });
}

// Recover the block list into a real array. A plain array is used as-is. If it
// somehow got saved as an array-LIKE object (e.g. {0:'youtube.com',1:'x.com'} —
// which can happen if a reactive value was stored without unwrapping), we salvage
// the sites from it rather than throwing the user's list away. Only a truly
// unusable value falls back to the defaults. This keeps blocking working even if
// the list was saved in a bad shape, because isDistracting() ignores a non-array.
function healBlockList(v: any): string[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    const salvaged = Object.values(v).filter((x) => typeof x === 'string') as string[];
    if (salvaged.length) return salvaged;
  }
  return SETTINGS_DEFAULTS.distractingSites;
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

  // Blocked, in focus, with no pass → send them to the nudge page. It carries the
  // site they reached for (`from`) and the exact page they wanted (`orig`), so
  // "allow + go" can hand them straight back to it.
  const nudgeUrl =
    browser.runtime.getURL('/nudge.html') +
    `?from=${encodeURIComponent(host)}` +
    `&orig=${encodeURIComponent(details.url)}`;

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
      await clearAllAllowances(); // a reset is a clean slate — drop the site passes too
      break;
    default:
      return;
  }

  await timer.setValue(next);
  await syncAlarm(next);
  // Starting or resuming means we're awake right now — reset the heartbeat so the
  // next tick doesn't mistake an old baseline for a sleep.
  if (action === 'start' || action === 'resume') await heartbeat.setValue(Date.now());
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

// Wipe every freedom window and its cleanup alarm at once. Called when the timer
// is reset: a reset is a clean slate, so the temporary site passes go with it and
// the next session starts fully protected again.
async function clearAllAllowances() {
  const a = await allowances.getValue();
  const sites = Object.keys(a ?? {});
  if (!sites.length) return;
  await allowances.setValue({});
  for (const site of sites) await browser.alarms.clear(FREEDOM_PREFIX + site);
}

// Keep the alarm in sync with the timer: one alarm when running, none otherwise.
async function syncAlarm(t: any) {
  await browser.alarms.clear(TIMER_ALARM);
  if (t.status === 'running' && t.endsAt) {
    browser.alarms.create(TIMER_ALARM, { when: t.endsAt });
  }
}

// Browser was closed and reopened (or the machine was shut down and rebooted).
// Any session that was still running or paused is thrown away — the user comes
// back to a clean, fresh timer rather than a stale one from a past sitting. We
// also stamp the heartbeat to NOW so the sleep guard in beat() doesn't then read
// this launch as an away-gap and try to pause the (already reset) timer. Contrast
// with sleep, where Chrome stays alive, this never fires, and beat() pauses.
async function resetOnBrowserRestart() {
  await heartbeat.setValue(Date.now());
  const [t, s]: any = await Promise.all([timer.getValue(), settings.getValue()]);
  if (t.status === 'idle') return; // nothing to clear
  const fresh = resetState(t, s);
  await timer.setValue(fresh);
  await syncAlarm(fresh);
  await clearAllAllowances(); // same clean-slate reset — leftover passes go too
}

// A single wake-up. First the sleep guard (which may pause a session left through
// a suspend), then the roll-forward for anything genuinely due. Order matters: if
// beat() pauses, reconcile() sees a paused timer and correctly does nothing, so a
// session slept through is paused rather than burned. Used on startup and on every
// timer/tick alarm.
async function wake() {
  await beat();
  await reconcile();
}

// Heartbeat + sleep guard.
//
// Records that we're awake NOW, and compares against the last time we were awake.
// A gap bigger than WAKE_GAP_MS can only mean the machine was suspended (asleep)
// or Chrome was fully closed — none of our timers, alarms, or code run then. If a
// session was running across that gap, we PAUSE it at the time it had left when we
// last saw it (`last`), not now, so the missing time never counts against it. The
// user comes back to a paused session and resumes when they're ready.
async function beat() {
  const now = Date.now();
  const last = await heartbeat.getValue();
  await heartbeat.setValue(now);
  if (last == null) return; // first ever beat — no baseline to judge against

  const gap = now - last;
  const slept = gap > WAKE_GAP_MS;

  // XP only accrues during time we were actually awake and focusing. A
  // slept-through gap is frozen out, the same principle the timer pause below uses.
  if (!slept) return void (await applyProgress(gap));

  const t: any = await timer.getValue();
  if (t.status !== 'running') return; // idle or already paused: nothing to protect

  const paused = pauseState(t, last); // remaining as of the last awake moment
  await timer.setValue(paused);
  await syncAlarm(paused);
  notifyAway();
}

// The XP loop, run once per awake minute with the real awake time since the last
// beat. Only focusing earns XP; nothing decays it, so a companion stays unlocked
// once earned. Which animals are unlocked is derived straight from XP
// (companions.js), so crossing a threshold unlocks the next pet.
async function applyProgress(elapsedMs: number) {
  if (elapsedMs <= 0) return;

  const [p, t]: any = await Promise.all([progress.getValue(), timer.getValue()]);
  const focusing = t.status === 'running' && t.mode === 'focus';
  if (!focusing) return; // XP only grows while focusing; nothing to do otherwise

  const before = unlockedKeys(p?.xp ?? 0);
  const xp = (p?.xp ?? 0) + XP_PER_MIN * (elapsedMs / 60000);
  await progress.setValue({ xp });

  // Celebrate anything that just unlocked.
  const after = unlockedKeys(xp);
  for (const key of after) if (!before.includes(key)) notifyUnlock(key);
}

// A little fanfare when a new companion is earned.
function notifyUnlock(key: string) {
  const label = (COMPANIONS as any)[key]?.label ?? key;
  browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: `${label} unlocked!`,
    message: `You focused enough to earn the ${label}. Choose it in Settings.`,
  });
}

// Tell the user why their timer stopped, so a paused session on wake reads as
// intentional rather than a glitch.
function notifyAway() {
  browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: 'Timer paused',
    message: "You were away, so your session is paused. Resume when you're ready.",
  });
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
