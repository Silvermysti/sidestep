// The companion pets, in one place, shared by the popup (which animates the
// run/idle poses in the habitat) and the block page (which shows the sleeping
// pose). Keeping the data here means both pages agree on what "fox" or "bunny"
// means, and adding a new animal later is a single entry.
//
// Each companion:
//   label   — name shown in the settings picker
//   run     — run frames, in play order
//   sit     — idle/sitting pose, shown when no session is running
//   sleep   — pose shown resting on the block page
//   icon    — square, tight-cropped sit pose used for the picker button
//   frameMs — how long each run frame shows (its run speed)
//   width   — how wide to draw it in the popup habitat (px)
//   sleepW  — how wide to draw the sleeping pose on the block page (px)
//   grassSpeed — how fast the grass scrolls under this pet, relative to normal
//                (1 = normal, 0.95 = 5% slower). Optional; defaults to 1.
//   unlockAt — how much XP (= focused minutes) you need before this pet is
//              available. Bunny is 0 (free from the start and can never be lost);
//              fox and cat are earned, and re-lock if XP drains back below these.
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
    unlockAt: 0, // free base — always available, never re-locks
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
    unlockAt: 60, // ~1 hour of focus
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
    grassSpeed: 0.95, // cat strolls a touch slower — grass scrolls 5% slower
    unlockAt: 180, // ~3 hours of focus
  },
  pikachu: {
    label: 'Pikachu',
    run: [
      '/pikachu/Running1.png', '/pikachu/Running2.png',
      '/pikachu/Running3.png', '/pikachu/Running4.png',
    ],
    sit: '/pikachu/Sitting.png',
    sleep: '/pikachu/Sleeping.png', // naps on a pile of peaches
    icon: '/pikachu/Icon.png',
    frameMs: 119,
    width: 180, // kept small on purpose — the source art is low-res, so a smaller
    sleepW: 205, // draw reads as crisp pixel-art instead of blurry
    unlockAt: 300, // ~5 hours of focus — the top-tier reward
  },
};

// The order the picker shows them in, and the default for a fresh install / any
// saved settings that predate the companion choice.
export const COMPANION_KEYS = Object.keys(COMPANIONS);
export const DEFAULT_COMPANION = 'bunny';

// The unlock rule, in one place so the popup (which greys out locked pets) and the
// background (which unlocks/re-locks as XP moves) always agree.
//   isUnlocked  — is this pet available at the given XP?
//   unlockedKeys — every available pet, in picker order (bunny is always present).
export function isUnlocked(key, xp) {
  return (xp ?? 0) >= (COMPANIONS[key]?.unlockAt ?? 0);
}
export function unlockedKeys(xp) {
  return COMPANION_KEYS.filter((k) => isUnlocked(k, xp));
}
