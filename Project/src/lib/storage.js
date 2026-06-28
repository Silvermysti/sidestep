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

// User configuration. (Stage 1 only really uses focus/break minutes; the rest
// is here so later stages have a home.)
export const settings = storage.defineItem('local:settings', {
  fallback: {
    distractingSites: ['youtube.com', 'instagram.com', 'x.com', 'reddit.com'],
    focusMinutes: 25,
    breakMinutes: 5,
    linkOrder: 'sequential', // 'sequential' (to-do style) | 'random'
  },
});

// The authoritative timer state.
//   mode        : 'focus' | 'break'  — which kind of session
//   status      : 'idle' | 'running' | 'paused'
//   endsAt      : timestamp (ms) when the running session ends, else null
//   remainingMs : time left, used while paused/idle so resume is exact
export const timer = storage.defineItem('local:timer', {
  fallback: {
    mode: 'focus',
    status: 'idle',
    endsAt: null,
    remainingMs: 25 * MINUTE,
  },
});

// The user's own useful links, grouped by topic (a folder).
//   currentTopic : the topic we're exploring right now ("What are you exploring?")
//   topics       : { topicName: [url, url, ...] }  — the links in each folder
//   cursor       : which link to serve next (sequential, to-do style)
// When a distracting site is intercepted, we redirect to the next link in the
// CURRENT topic's folder. If no topic is chosen, everything lives in "General".
export const lists = storage.defineItem('local:lists', {
  fallback: {
    currentTopic: 'General',
    topics: { General: [] },
    cursor: 0,
  },
});

// Active "freedom windows" — the per-site escape hatch (Stage 3).
//   { "<blocked site>": <expiry> }
// where <expiry> is either a timestamp (ms) when the window ends, or the string
// 'forever' for an allowance with no time limit. While a site has an active
// entry here, it is NOT redirected during focus; every other blocked site is.
export const allowances = storage.defineItem('local:allowances', {
  fallback: {},
});
