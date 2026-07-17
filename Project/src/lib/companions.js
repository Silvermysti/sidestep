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
  },
};

// The order the picker shows them in, and the default for a fresh install / any
// saved settings that predate the companion choice.
export const COMPANION_KEYS = Object.keys(COMPANIONS);
export const DEFAULT_COMPANION = 'bunny';
