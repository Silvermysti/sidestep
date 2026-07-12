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

// idle/paused -> running from the start of a fresh focus session. Focus-only, so
// we always start in focus, never inheriting a stale 'break' from saved state.
export function startState(t, settings, now = Date.now()) {
  const dur = durationMs('focus', settings);
  return { ...t, mode: 'focus', status: 'running', endsAt: now + dur, remainingMs: dur };
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

// back to a fresh, idle focus session. Sidestep is focus-only, so reset always
// returns to focus — even if an old saved state still carried mode: 'break'.
export function resetState(t, settings) {
  return { mode: 'focus', status: 'idle', endsAt: null, remainingMs: durationMs('focus', settings) };
}

// a session finished. What comes next depends on what just ended:
//   focus done  -> the break starts immediately and runs on its own
//   break done  -> back to a fresh, idle focus session, waiting for Start
// The cycle always begins at focus, so a saved 'break' can never be inherited
// as the starting mode.
export function completeState(t, settings, now = Date.now()) {
  if (t.mode === 'focus') {
    const dur = durationMs('break', settings);
    return { mode: 'break', status: 'running', endsAt: now + dur, remainingMs: dur };
  }
  return { mode: 'focus', status: 'idle', endsAt: null, remainingMs: durationMs('focus', settings) };
}

// turn milliseconds into "MM:SS" for display.
export function formatMs(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
