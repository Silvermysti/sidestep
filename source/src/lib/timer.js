const MINUTE = 60 * 1000;

export function durationMs(mode, settings) {
  const mins = mode === 'focus' ? settings.focusMinutes : settings.breakMinutes;
  return mins * MINUTE;
}

export function getRemainingMs(t, now = Date.now()) {
  if (t.status === 'running' && t.endsAt != null) {
    return Math.max(0, t.endsAt - now);
  }
  return t.remainingMs;
}

export function totalCycles(settings) {
  if (settings?.cycles === 'continuous') return Infinity;
  const n = Number(settings?.cycles);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function startState(t, settings, now = Date.now()) {
  const dur = durationMs('focus', settings);
  return { ...t, mode: 'focus', status: 'running', endsAt: now + dur, remainingMs: dur, cycle: 1 };
}

export function pauseState(t, now = Date.now()) {
  if (t.status !== 'running') return t;
  return {
    ...t,
    status: 'paused',
    remainingMs: Math.max(0, (t.endsAt ?? now) - now),
    endsAt: null,
  };
}

export function resumeState(t, now = Date.now()) {
  if (t.status !== 'paused') return t;
  return { ...t, status: 'running', endsAt: now + t.remainingMs };
}

export function resetState(t, settings) {
  return {
    mode: 'focus',
    status: 'idle',
    endsAt: null,
    remainingMs: durationMs('focus', settings),
    cycle: 1,
  };
}

export function completeState(t, settings, now = Date.now()) {
  const cycle = t.cycle ?? 1;

  if (t.mode === 'focus') {
    const dur = durationMs('break', settings);
    return { mode: 'break', status: 'running', endsAt: now + dur, remainingMs: dur, cycle };
  }

  if (cycle < totalCycles(settings)) {
    const dur = durationMs('focus', settings);
    return { mode: 'focus', status: 'running', endsAt: now + dur, remainingMs: dur, cycle: cycle + 1 };
  }
  return resetState(t, settings);
}

export function isRunOver(t, settings) {
  return t.mode === 'break' && (t.cycle ?? 1) >= totalCycles(settings);
}

export function formatMs(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
