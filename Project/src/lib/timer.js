// The timer RULES — pure functions with no side effects.
//
// "Pure" means: given the same inputs, they always return the same output and
// they don't touch storage, the browser, or the screen. That makes them easy to
// reason about and to test. The background script calls these to work out the
// next timer state, then saves it.
//
// Key idea (the architecture rule): we never store a ticking countdown. We store
// `endsAt` (a timestamp). "How much time is left" is always CALCULATED from it.
// That way the timer stays correct even if the background script goes to sleep.

const MINUTE = 60 * 1000;

// How long a session of the given mode should last, in milliseconds.
export function durationMs(mode, settings) {
  const mins = mode === 'focus' ? settings.focusMinutes : settings.breakMinutes;
  return mins * MINUTE;
}

// How much time is left right now, in milliseconds.
export function getRemainingMs(t, now = Date.now()) {
  if (t.status === 'running' && t.endsAt != null) {
    return Math.max(0, t.endsAt - now);
  }
  return t.remainingMs;
}

// How many rounds of (focus + break) to run. Returns Infinity for 'continuous',
// so every "are there rounds left?" test is a plain number comparison. Anything
// missing or nonsensical falls back to 1 round, which can only ever end early —
// never trap someone in a loop they didn't ask for.
export function totalCycles(settings) {
  if (settings?.cycles === 'continuous') return Infinity;
  const n = Number(settings?.cycles);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

// idle/paused -> running from the start of a fresh focus session. A run always
// begins at round 1 of focus, never inheriting a stale 'break' or a half-finished
// round from saved state.
export function startState(t, settings, now = Date.now()) {
  const dur = durationMs('focus', settings);
  return { ...t, mode: 'focus', status: 'running', endsAt: now + dur, remainingMs: dur, cycle: 1 };
}

// running -> paused, remembering exactly how much was left.
export function pauseState(t, now = Date.now()) {
  if (t.status !== 'running') return t;
  return {
    ...t,
    status: 'paused',
    remainingMs: Math.max(0, (t.endsAt ?? now) - now),
    endsAt: null,
  };
}

// paused -> running, continuing from where we left off.
export function resumeState(t, now = Date.now()) {
  if (t.status !== 'paused') return t;
  return { ...t, status: 'running', endsAt: now + t.remainingMs };
}

// back to a fresh, idle run: round 1, focus, stopped. Reset always returns to
// focus, even if an old saved state still carried mode: 'break'.
export function resetState(t, settings) {
  return {
    mode: 'focus',
    status: 'idle',
    endsAt: null,
    remainingMs: durationMs('focus', settings),
    cycle: 1,
  };
}

// a session hit zero. What comes next:
//   focus done               -> its break starts, on its own
//   break done, rounds left  -> the NEXT round's focus starts, on its own
//   break done, last round   -> the run is over: idle, back at round 1
// So the whole run flows by itself once started, and stops exactly when the
// requested number of rounds is done ('continuous' never runs out).
export function completeState(t, settings, now = Date.now()) {
  const cycle = t.cycle ?? 1;

  if (t.mode === 'focus') {
    const dur = durationMs('break', settings);
    return { mode: 'break', status: 'running', endsAt: now + dur, remainingMs: dur, cycle };
  }

  // A break just ended, which means round `cycle` is complete.
  if (cycle < totalCycles(settings)) {
    const dur = durationMs('focus', settings);
    return { mode: 'focus', status: 'running', endsAt: now + dur, remainingMs: dur, cycle: cycle + 1 };
  }
  return resetState(t, settings); // all rounds done — stop and wait
}

// Was that the last break of the last round? Used to tell "your run is finished"
// apart from "on to the next round" when we notify.
export function isRunOver(t, settings) {
  return t.mode === 'break' && (t.cycle ?? 1) >= totalCycles(settings);
}

// turn milliseconds into "MM:SS" for display.
export function formatMs(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
