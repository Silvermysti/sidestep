// The data model — every piece of saved state is DEFINED HERE, in one place.
//
// We use WXT's `storage.defineItem`, which wraps Chrome's key-value store
// (`chrome.storage.local`). Each item gets a key and a `fallback` (the default
// value returned when nothing has been saved yet). The rest of the app imports
// these items and calls `.getValue()`, `.setValue()`, and `.watch()`.
//
// Keys are prefixed with `local:` to say "store this on this machine".
import { storage } from '#imports';

const MINUTE = 60 * 1000;

// The default settings, in one named place so both the storage fallback and the
// startup "heal" (background.ts) can use the exact same values.
export const SETTINGS_DEFAULTS = {
  distractingSites: ['youtube.com', 'instagram.com', 'x.com', 'reddit.com'],
  focusMinutes: 25,
  breakMinutes: 5,
  // How many rounds of (focus + break) to run before stopping. A number, or the
  // string 'continuous' to keep cycling until you stop it yourself.
  cycles: 4,
  linkOrder: 'sequential', // 'sequential' (to-do style) | 'random'
  companion: 'bunny', // which pet keeps you company — see lib/companions.js
  showOnPage: true, // draw the floating companion on web pages during a session
  theme: 'meadow', // scene skin: 'meadow' | 'autumn' | 'rainy'
};

// User configuration. (Stage 1 only really uses focus/break minutes; the rest
// is here so later stages have a home.)
export const settings = storage.defineItem('local:settings', {
  fallback: SETTINGS_DEFAULTS,
});

// The authoritative timer state.
//   mode        : 'focus' | 'break'  — which kind of session
//   status      : 'idle' | 'running' | 'paused'
//   endsAt      : timestamp (ms) when the running session ends, else null
//   remainingMs : time left, used while paused/idle so resume is exact
//   cycle       : which round we're on (1-based). A round is one focus + its
//                 break; when the last one ends the timer stops.
export const timer = storage.defineItem('local:timer', {
  fallback: {
    mode: 'focus',
    status: 'idle',
    endsAt: null,
    remainingMs: 25 * MINUTE,
    cycle: 1,
  },
});

// A once-a-minute "we're still awake" heartbeat, used only by the background.
// Nothing in the extension runs while the laptop sleeps (or Chrome is closed), so
// on wake a gap far bigger than the tick means we were suspended. The background
// uses that to PAUSE a running session instead of counting the missing time.
// Null until the first beat.
export const heartbeat = storage.defineItem('local:heartbeat', {
  fallback: null,
});

// The gamification progress — lifetime focus XP.
//   xp : focus progress, earned per focused minute and never spent. A companion
//        is UNLOCKED when xp >= its unlockAt (see companions.js), so unlocking is
//        derived, never stored. Updated once per awake minute by the background
//        (see applyProgress in background.ts); sleep time is frozen out.
export const progress = storage.defineItem('local:progress', {
  fallback: { xp: 0 },
});

// Where the floating on-page companion (the content-script widget) was last
// dragged, as viewport pixels from the top-left. Null until first placed, which
// means "use the default bottom-right corner". Shared across tabs so the pet stays
// in the same spot everywhere.
export const overlay = storage.defineItem('local:overlay', {
  fallback: { x: null, y: null },
});

// The user's own useful links, bucketed by the SITE each one lives on.
//   sites   : { siteKey: [ { url, title }, ... ] }
//   cursors : { siteKey: n }  — which link to serve next FOR THAT SITE
// A link's bucket is worked out from its own URL (see siteKeyOf in sites.js), so
// there is nothing to choose when saving. The point of bucketing by site is the
// substitution: reach for youtube.com and you get your next saved YouTube link,
// reach for amazon.com and you get the thing you actually meant to buy. Each site
// keeps its own cursor so the queues don't interfere.
export const lists = storage.defineItem('local:lists', {
  fallback: {
    sites: {},
    cursors: {},
  },
});

// The "thought parking lot" (Stage 6). When a distraction is intercepted, the
// impulse often carries a real thought underneath ("reply to Sam", "check that
// song"). A wandering brain keeps rehearsing that thought so it won't forget it,
// which pulls it further off task. Letting the user dump it here — from the
// redirect page — gets it out of their head; it waits in the popup for after the
// session. A plain list, newest last.
//   [{ text, savedAt, done }]  — done flips true when they tick it off later.
export const parkingLot = storage.defineItem('local:parkingLot', {
  fallback: [],
});

// Active "freedom windows" — the per-site escape hatch (Stage 3).
//   { "<blocked site>": <expiry> }
// where <expiry> is either a timestamp (ms) when the window ends, or the string
// 'forever' for an allowance with no time limit. While a site has an active
// entry here, it is NOT redirected during focus; every other blocked site is.
export const allowances = storage.defineItem('local:allowances', {
  fallback: {},
});
