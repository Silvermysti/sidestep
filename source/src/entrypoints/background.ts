import { allowances, heartbeat, progress, settings, SETTINGS_DEFAULTS, timer } from '@/lib/storage';
import { COMPANIONS, unlockedKeys } from '@/lib/companions';
import { THEMES, unlockedThemeKeys } from '@/lib/themes';
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
  getRemainingMs,
  isRunOver,
  totalCycles,
} from '@/lib/timer';

const TIMER_ALARM = 'sidestep-timer-end';
const TICK_ALARM = 'sidestep-tick';
const FREEDOM_PREFIX = 'sidestep-freedom:';
const BADGE_ALARM = 'sidestep-badge';

const WAKE_GAP_MS = 2 * 60 * 1000;
const XP_PER_MIN = 1;
const XP_DECAY_PER_MIN = 0.25;

const BADGE_FOCUS = '#2F7A4A';
const BADGE_BREAK = '#B5722A';
const BADGE_PAUSED = '#6E6E6E';

export default defineBackground(() => {
  healSettings();

  browser.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  wake();

  browser.runtime.onStartup.addListener(() => {
    resetOnBrowserRestart();
  });

  browser.runtime.onMessage.addListener((message) => {
    return handleCommand(message);
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TIMER_ALARM || alarm.name === TICK_ALARM) wake();
    else if (alarm.name === BADGE_ALARM) updateBadge();
    else if (alarm.name.startsWith(FREEDOM_PREFIX)) {
      dropAllowance(alarm.name.slice(FREEDOM_PREFIX.length));
    }
  });

  browser.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) return;
    handleNavigation(details);
  });
  browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0) return;
    handleNavigation(details);
  });
});

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

  const t = await timer.getValue();
  const s = await settings.getValue();

  if (t.status !== 'running' || t.mode !== 'focus') return;
  if (!isDistracting(host, s.distractingSites)) return;

  const a = await allowances.getValue();
  if (activeAllowance(host, a)) return;

  const nudgeUrl =
    browser.runtime.getURL('/nudge.html') +
    `?from=${encodeURIComponent(host)}` +
    `&orig=${encodeURIComponent(details.url)}`;

  browser.tabs.update(details.tabId, { url: nudgeUrl });
}

async function handleCommand(message: any) {
  const action = message?.action;
  if (!action) return;

  if (action === 'allowSite') return allowSite(message.host, message.minutes);
  if (action === 'revokeSite') return revokeSite(message.host);

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
      await clearAllAllowances();
      break;
    default:
      return;
  }

  await timer.setValue(next);
  await syncAlarm(next);

  if (action === 'start' || action === 'resume') await heartbeat.setValue(Date.now());
  return next;
}

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

async function revokeSite(host: string) {
  const cleanHost = hostnameOf(host) ?? host;
  const s = await settings.getValue();
  const site = matchingSite(cleanHost, s.distractingSites);
  await dropAllowance(site);
  return { site };
}

async function dropAllowance(site: string) {
  const a = await allowances.getValue();
  if (site in a) {
    const { [site]: _, ...rest } = a;
    await allowances.setValue(rest);
  }
  await browser.alarms.clear(FREEDOM_PREFIX + site);
}

async function clearAllAllowances() {
  const a = await allowances.getValue();
  const sites = Object.keys(a ?? {});
  if (!sites.length) return;
  await allowances.setValue({});
  for (const site of sites) await browser.alarms.clear(FREEDOM_PREFIX + site);
}

async function syncAlarm(t: any) {
  await browser.alarms.clear(TIMER_ALARM);
  if (t.status === 'running' && t.endsAt) {
    browser.alarms.create(TIMER_ALARM, { when: t.endsAt });
  }
  renderBadge(t);
  await scheduleBadgeTick(t);
}

function renderBadge(t: any) {
  if (!t || t.status === 'idle') {
    browser.action.setBadgeText({ text: '' });
    return;
  }
  const mins = Math.floor(getRemainingMs(t) / 60000);
  browser.action.setBadgeText({ text: mins >= 1 ? String(mins) : '<1' });
  const color =
    t.status === 'paused' ? BADGE_PAUSED : t.mode === 'break' ? BADGE_BREAK : BADGE_FOCUS;
  browser.action.setBadgeBackgroundColor({ color });
  (browser.action as any).setBadgeTextColor?.({ color: '#ffffff' });
}

async function scheduleBadgeTick(t: any) {
  await browser.alarms.clear(BADGE_ALARM);
  if (!t || t.status !== 'running' || !t.endsAt) return;
  const rem = getRemainingMs(t);
  if (rem <= 0) return;
  browser.alarms.create(BADGE_ALARM, { when: Date.now() + (rem % 60000 || 60000) });
}

async function updateBadge() {
  const t = await timer.getValue();
  renderBadge(t);
  await scheduleBadgeTick(t);
}

async function resetOnBrowserRestart() {
  await heartbeat.setValue(Date.now());
  const [t, s]: any = await Promise.all([timer.getValue(), settings.getValue()]);
  if (t.status === 'idle') return;
  const fresh = resetState(t, s);
  await timer.setValue(fresh);
  await syncAlarm(fresh);
  await clearAllAllowances();
}

async function wake() {
  await beat();
  await reconcile();
  await updateBadge();
}

async function beat() {
  const now = Date.now();
  const last = await heartbeat.getValue();
  await heartbeat.setValue(now);
  if (last == null) return;

  const gap = now - last;
  const slept = gap > WAKE_GAP_MS;

  if (!slept) return void (await applyProgress(gap));

  const t: any = await timer.getValue();
  if (t.status !== 'running') return;

  const paused = pauseState(t, last);
  await timer.setValue(paused);
  await syncAlarm(paused);
  notifyAway();
}

async function applyProgress(elapsedMs: number) {
  if (elapsedMs <= 0) return;

  const [p, t]: any = await Promise.all([progress.getValue(), timer.getValue()]);
  const focusing = t.status === 'running' && t.mode === 'focus';
  const resting = t.status === 'running' && t.mode === 'break';
  if (resting) return;

  const mins = elapsedMs / 60000;
  const rate = focusing ? XP_PER_MIN : -XP_DECAY_PER_MIN;
  const prevXp = p?.xp ?? 0;
  const xp = Math.max(0, prevXp + rate * mins);
  await progress.setValue({ xp });

  if (xp <= prevXp) return;

  const before = unlockedKeys(prevXp);
  for (const key of unlockedKeys(xp)) {
    if (before.includes(key)) continue;
    const label = (COMPANIONS as any)[key]?.label ?? key;
    notifyUnlock(label, `You focused enough to earn the ${label}. Choose it in the Companion tab.`);
  }

  const beforeThemes = unlockedThemeKeys(prevXp);
  for (const key of unlockedThemeKeys(xp)) {
    if (beforeThemes.includes(key)) continue;
    const label = (THEMES as any)[key]?.label ?? key;
    notifyUnlock(`${label} theme`, `A new scene is yours. Pick it from the dots at the top of the popup.`);
  }
}

function notifyUnlock(label: string, message: string) {
  browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: `${label} unlocked!`,
    message,
  });
}

function notifyAway() {
  browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: 'Timer paused',
    message: "You were away, so your session is paused. Resume when you're ready.",
  });
}

async function reconcile() {
  const s = await settings.getValue();
  let t: any = await timer.getValue();
  if (t.status !== 'running' || !t.endsAt) return;

  let finished: any = null;
  let guard = 0;
  while (t.status === 'running' && t.endsAt && t.endsAt <= Date.now() && guard++ < 500) {
    finished = t;
    t = completeState(t, s, t.endsAt);
  }
  if (!finished) return;

  await timer.setValue(t);
  await syncAlarm(t);

  notify(finished, s, t);
}

let offscreenSetup: Promise<void> | null = null;

async function playChime() {
  const c: any = (globalThis as any).chrome;
  if (!c?.offscreen) return;
  try {
    const has = await c.offscreen.hasDocument?.();
    if (!has) {
      if (!offscreenSetup) {
        offscreenSetup = c.offscreen
          .createDocument({
            url: 'offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Play a short chime when a focus or break session ends.',
          })
          .catch(() => {})
          .finally(() => {
            offscreenSetup = null;
          });
      }
      await offscreenSetup;
    }
    await browser.runtime.sendMessage({ action: 'sidestep-play-ding' });
  } catch {}
}

function notify(finished: any, s: any, next: any) {
  playChime();
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
