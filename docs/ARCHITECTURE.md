# Sidestep — Architecture

How the pieces fit together. Read alongside `PLAN.md` (which covers the *why* and the features).
Stack: WXT + Svelte + JavaScript, Manifest V3.

---

## 1. The big picture

A Chrome extension is not one program; it's a few small programs that each run in a different
place and talk to each other. Sidestep has four parts:

```
        ┌─────────────────────────────────────────────────────────┐
        │                    chrome.storage.local                   │
        │            (the single source of truth / "database")       │
        │   topics · currentTopic · timer · allowances · settings ·  │
        │                       bunny mood                           │
        └─────────────────────────────────────────────────────────┘
              ▲  reads/writes              ▲  reads/writes
              │                            │
   ┌──────────┴───────────┐    ┌───────────┴────────────────────────┐
   │   POPUP (the face)   │    │   BACKGROUND worker (the brain)     │
   │   Svelte UI          │    │   - owns the timer (via alarms)     │
   │   - timer display    │───▶│   - watches tab navigation          │
   │   - bunny + health   │ cmd│   - does the redirects              │
   │   - topic + lists    │    │   - expires freedom windows         │
   │   - freedom controls │    │   - updates bunny mood over time    │
   └──────────────────────┘    └───────────┬─────────────────────────┘
                                            │ redirects a tab to ▼
                               ┌────────────────────────────────────┐
                               │  NUDGE page (extension HTML page)   │
                               │  "You drifted. Here's your task →"  │
                               │  + "I really need this site" escape │
                               └────────────────────────────────────┘
```

**The three rules that keep this sane (important to internalise):**

1. **Storage is the single source of truth.** Nothing keeps important state "in its head."
   The popup and the background both read/write the same `chrome.storage.local`. When storage
   changes, the popup re-renders automatically. This is why the timer keeps working even if you
   close the popup: the popup was never holding the timer, storage + the background were.
2. **The background is the only "doer."** Redirects, the authoritative timer, and mood updates
   all happen in the background. The popup only *shows* state and *sends commands*. (Why: the
   popup can be closed at any moment, so it can't be trusted to run anything important.)
3. **The timer is stored as a timestamp, not a ticking number.** We save "this session ends at
   3:42:10pm" plus an alarm, not "25:00 counting down." (Why: background workers go to sleep to
   save memory; a `setInterval` countdown would freeze. A timestamp + `chrome.alarms` survives
   sleep. The popup only counts seconds for *display* while it's open.)

---

## 2. File / folder map (WXT layout)

```
src/
  entrypoints/
    background.ts        ← the brain: timer, navigation watcher, redirect, mood ticks
    popup/
      App.svelte         ← the main UI shell
      main.ts            ← mounts the Svelte app (plumbing, leave mostly alone)
      index.html
    nudge/               ← NEW: the interstitial "you drifted, here's your task" page
      index.html
      App.svelte
    content.ts           ← optional/minimal; probably unused for the redirect approach
  lib/
    storage.js           ← defines all storage items in ONE place (the data model)
    redirect.js          ← the "should we redirect, and where to?" decision logic
    timer.js             ← helpers to start/pause/reset the timer
    components/          ← reusable Svelte UI pieces (Timer, Bunny, TopicList, ...)
public/                  ← static files (bunny pixel art will live here)
```

Why centralise `lib/storage.js`: every part of the app touches the same data. Defining each
piece of state in one file (with WXT's `storage.defineItem`) means there's one place that knows
the shape and the defaults, and the rest of the app just imports it. Fewer bugs, less guessing.

---

## 3. The data model (what lives in storage)

```js
// settings — the user's configuration
settings = {
  distractingSites: ["youtube.com", "instagram.com", "x.com", "reddit.com"],
  focusMinutes: 25,
  breakMinutes: 5,
  linkOrder: "sequential",        // "sequential" (to-do style) | "random"
}

// topics — folders of useful links. Key is the topic name.
topics = {
  "General":  [ { id, url, title, addedAt } ],
  "DSA prep": [ { id, url, title, addedAt } ],
}
currentTopic = "General"          // set by the "What are you exploring?" prompt
cursorByTopic = { "General": 0 }  // which link is next, for sequential serving

// timer — authoritative timer state
timer = {
  mode: "focus",                  // "focus" | "break"
  status: "idle",                 // "idle" | "running" | "paused"
  endsAt: 1750000000000,          // timestamp when current session ends (when running)
  remainingMs: 1500000,           // used when paused, so resume is exact
}

// allowances — temporary "freedom windows", keyed by site
allowances = {
  "youtube.com": { until: 1750000300000 },   // a timestamp, OR...
  // "youtube.com": { until: "forever" },     // ...indefinite, ended manually
}

// bunny — gentle gamification state
bunny = {
  happiness: 70,                  // 0..100
  lastFocusAt: 1749990000000,     // for idle-decay calculation
}
```

---

## 4. How the parts communicate

- **Popup → Background:** the popup sends a *command message*
  (e.g. `{ type: "START_TIMER" }`, `{ type: "GRANT_FREEDOM", site, minutes }`) using
  `browser.runtime.sendMessage`. The background does the work and updates storage.
- **Background → Popup:** there's no direct "push." The popup *watches* storage
  (`storage.watch`) and re-renders when values change. Simple and reliable.
- **Background ↔ the clock:** `chrome.alarms` wakes the background for three kinds of events:
  1. `timer-end` — a focus/break session finished (notify + switch mode).
  2. `freedom-end:<site>` — a timed allowance expired (remove it, protection resumes).
  3. `mood-tick` — a periodic (e.g. every minute) nudge to recompute bunny happiness.
- **Background ↔ tabs:** `chrome.webNavigation`/`tabs.onUpdated` tells the background a tab is
  navigating; `chrome.tabs.update` performs the redirect.

---

## 5. Key flows, walked through

### A. Starting a focus session
Popup: user names a topic ("What are you exploring?") and hits Start
→ sends `START_TIMER`
→ background sets `timer = {mode:focus, status:running, endsAt: now+25min}`, sets a `timer-end`
  alarm, marks `bunny.lastFocusAt`
→ popup sees storage change, shows the countdown.

### B. The redirect / substitution (the core)
A tab navigates to a URL. Background runs the decision in `lib/redirect.js`:
1. Is `timer.status === "running"` AND `timer.mode === "focus"`? If not → **ignore**.
2. Is the hostname in `settings.distractingSites`? If not → **ignore**.
3. Is there an active `allowances[hostname]` (until > now, or "forever")? If yes → **ignore**.
4. Otherwise → pick the next link from `currentTopic` using `cursorByTopic` (sequential) or at
   random; fall back to "General"; advance the cursor. Redirect the tab to the **nudge page**,
   passing the target link and the site we came from.
   - Guard rails: never redirect our own extension pages; if the topic has no links, the nudge
     page shows an "add a task" prompt instead of a broken redirect.

### C. The freedom window (escape hatch 1)
On the nudge page (or popup), user clicks "I need youtube.com → 15 min"
→ sends `GRANT_FREEDOM {site:"youtube.com", minutes:15}`
→ background writes `allowances["youtube.com"] = {until: now+15min}` and sets a
  `freedom-end:youtube.com` alarm. ("Until I turn it off" stores `until:"forever"` and sets no
  alarm; the popup always shows a visible "free — Turn off" status so it can't be forgotten.)
→ now step 3 above passes, so that one site loads normally; others stay protected.

### D. Pausing the whole timer (escape hatch 2)
Popup: Pause → `PAUSE_TIMER` → background stores `status:"paused"`,
`remainingMs = endsAt - now`, clears the `timer-end` alarm. With `mode/status` no longer
"running focus", rule 1 in the redirect flow fails, so nothing is redirected. Resume restores
`endsAt = now + remainingMs`.

### E. Capturing the current tab (add a link the easy way)
Only when `timer.status !== "running"`. The popup asks the background for the active tab's URL;
if it's a YouTube video, it shows "Save this to a list" with a topic picker → appends a link to
`topics[chosenTopic]`. (Lives in the off-state because while focusing, that tab would already
have been redirected away.)

### F. Bunny mood
On each `mood-tick` alarm and whenever focus is active, the background nudges
`bunny.happiness` up (during focus) or lets it decay based on time since `bunny.lastFocusAt`.
The popup just renders the number as a health bar + the matching pixel-art frame. Mood never
punishes (e.g. using a freedom window doesn't tank happiness) — it only reflects focus vs idle.

---

## 6. Permissions (and the reason for each)

- `storage` — the data model above.
- `tabs` — read the active tab's URL (detect distracting sites; capture a YouTube video).
- `webNavigation` — notice navigations early so we can redirect before the page fully loads.
- `alarms` — survive service-worker sleep for the timer, freedom expiry, and mood ticks.
- `notifications` — tell the user when a session ends.
- `host_permissions: <all_urls>` — needed to redirect any distracting site.

---

## 7. Build order maps onto this architecture

- **Stage 1 — Timer:** `lib/timer.js` + `lib/storage.js` (timer item) + background alarm handling
  + popup display. (Flows A, D.)
- **Stage 2 — Substitution:** storage (topics, settings) + `lib/redirect.js` + nudge page +
  navigation watcher. (Flow B.)
- **Stage 3 — Freedom window:** allowances item + GRANT_FREEDOM + freedom alarms + UI. (Flow C.)
- **Stage 4 — Capture tab:** active-tab read + save-link UI. (Flow E.)
- **Stage 5 — Bunny:** bunny item + mood-tick + pixel art + health bar. (Flow F.)
```
