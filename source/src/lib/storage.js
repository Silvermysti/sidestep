import { storage } from '#imports';

const MINUTE = 60 * 1000;

export const SETTINGS_DEFAULTS = {
  distractingSites: ['youtube.com', 'instagram.com', 'x.com', 'reddit.com'],
  focusMinutes: 25,
  breakMinutes: 5,

  cycles: 4,
  companion: 'bunny',
  showOnPage: true,
  theme: 'meadow',
};

export const settings = storage.defineItem('local:settings', {
  fallback: SETTINGS_DEFAULTS,
});

export const timer = storage.defineItem('local:timer', {
  fallback: {
    mode: 'focus',
    status: 'idle',
    endsAt: null,
    remainingMs: 25 * MINUTE,
    cycle: 1,
  },
});

export const heartbeat = storage.defineItem('local:heartbeat', {
  fallback: null,
});

export const progress = storage.defineItem('local:progress', {
  fallback: { xp: 0 },
});

export const overlay = storage.defineItem('local:overlay', {
  fallback: { x: null, y: null },
});

export const parkingLot = storage.defineItem('local:parkingLot', {
  fallback: [],
});

export const allowances = storage.defineItem('local:allowances', {
  fallback: {},
});
