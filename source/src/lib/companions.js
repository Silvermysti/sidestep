export const COMPANIONS = {
  bunny: {
    label: 'Bunny',
    run: [
      '/bunny/Running1.png', '/bunny/Running2.png', '/bunny/Running3.png',
      '/bunny/Running4.png', '/bunny/Running5.png',
    ],
    sit: '/bunny/Sitting.png',
    sleep: '/scene/sleeping.png',
    icon: '/bunny/Icon.png',
    frameMs: 119,
    width: 190,
    sleepW: 236,
    unlockAt: 0,
  },
  fox: {
    label: 'Fox',
    run: [
      '/fox/Running1.png', '/fox/Running2.png', '/fox/Running3.png',
      '/fox/Running4.png', '/fox/Running5.png', '/fox/Running6.png',
    ],
    sit: '/fox/Sitting.png',
    sleep: '/fox/Sleeping.png',
    icon: '/fox/Icon.png',
    frameMs: 119,
    width: 260,
    sleepW: 268,
    unlockAt: 60,
  },
  cat: {
    label: 'Cat',
    run: [
      '/cat/Running1.png', '/cat/Running2.png', '/cat/Running3.png',
      '/cat/Running4.png', '/cat/Running5.png', '/cat/Running6.png',
    ],
    sit: '/cat/Sitting.png',
    sleep: '/cat/Sleeping.png',
    icon: '/cat/Icon.png',
    frameMs: 119,
    width: 270,
    sleepW: 250,
    grassSpeed: 0.95,
    unlockAt: 300,
  },
};

export const COMPANION_KEYS = Object.keys(COMPANIONS);
export const DEFAULT_COMPANION = 'bunny';

export function isUnlocked(key, xp) {
  return (xp ?? 0) >= (COMPANIONS[key]?.unlockAt ?? 0);
}
export function unlockedKeys(xp) {
  return COMPANION_KEYS.filter((k) => isUnlocked(k, xp));
}
