# Bunny Focus — Project Plan

> A focus tool that turns the sites you waste time on into the things you actually meant to do.

A Chrome browser extension built for HackWave. Plain HTML/CSS/JavaScript, Manifest V3, no framework.

---

## 1. Problem Statement

People who struggle to focus (ADHD, low concentration) or who get anxious easily are hit
hardest by online distraction — but the usual fix makes things worse.

The standard tool is a **harsh website blocker**. Blocking:

- creates frustration and the urge to just turn the tool off,
- doesn't satisfy the craving that caused the click (so the impulse just relocates), and
- often shows guilt-based "you failed" screens that *add* stress.

In short: blocking fights the user. We wanted something that works *with* them — and that is
gentle enough not to be stressful in itself.

> **Note on framing:** this product is *informed by* the experience of low focus and anxiety.
> It is a supportive productivity tool, **not** a medical or clinical product, and makes no
> treatment claims.

---

## 2. Why — the core insight

Instead of **blocking** a distraction, **substitute** it.

When the user reaches for a site they've chosen to block — whichever sites those are — we don't
put up a wall. We swap that page for something *they* decided was useful: a video they need to
watch, a problem they want to solve. The same impulse that opened the distraction now lands them
on their own goal.

Substitution redirects the impulse instead of fighting it, and a calm companion (the bunny)
encourages instead of shaming. That is the whole philosophy: **substitute and support, don't
block and punish.**

### Built around how these brains actually work

Substitution is the engine, but on its own it only handles the *symptom* (the click). A small
**support layer** handles the *causes* — the specific ways ADHD and anxiety derail focus — and it
all rides on one thing no other focus tool has: **we are present at the exact moment of
distraction** (finger already on the blocked site). That instant is a *pattern interrupt* — the
kindest, highest-leverage moment to help. The support features use it:

- **Leaky working memory / rumination.** People bail to a distracting site because a *thought*
  ("I should check that…") is nagging, and the only way to quiet it feels like acting on it. →
  **Thought parking lot.**
- **Forgetting the goal / time blindness.** People genuinely lose track of what they sat down to
  do. → **Intention anchor.**
- **Shame spirals & progress blindness.** Anxiety discounts what got done; punitive streak-tools
  cause the shame that makes ADHD users quit. → **gentle win log**, additive only, never a red X.
- **Focusing better with someone present (body-doubling).** → the **bunny is a body-double**, a
  calm companion working alongside you, not a pet you can kill.

> **Framing, again:** these are supportive, everyday-productivity features *informed by* how low
> focus and anxiety feel. They are **not** medical features and make no treatment claims.

### How we're different

Pet + timer + blocker combos already exist (e.g. Otto, StudyMate AI), and they **block and
punish** (pet loses health when you visit a blocked site). Our defensible edge is the
**substitution engine** plus topic-aware redirection **plus the support layer above** — distractions
become *your* goals, nagging thoughts get parked instead of chased, and a body-double companion
cheers you on rather than guilt-tripping you.

---

## 3. What — the product

Core features (the heart of the product):

1. **Pomodoro timer** — focus / break sessions, kept running in the background even when the
   popup is closed.
2. **Intention anchor** — when a focus session starts, one gentle prompt: *"What's the one thing?"*
   The answer is shown back to the user **on the redirect page** — *"You wanted to: finish the biology
   notes"* — so a wandering brain is reminded of its own goal at the exact moment it's drifting.
   *Why: fights leaky working memory — people genuinely lose track of what they sat down to do.
   Skippable — never a wall.*
3. **Substitution engine** — during a *focus* session, opening **any site on the user's own block
   list** redirects the tab to a useful link from the user's **current topic**. The engine treats
   every blocked site the same way; none is special-cased.
4. **Topic-wise link lists** — useful links live in topic "folders". The "What are you
   exploring?" prompt sets the *current topic*; if none is given, links go to **General**.
   Within a topic, links are served **in order, like a to-do list** (loops back to the start at
   the end). *(Configurable; random is a possible later option.)*
5. **Redirect landing page — your link menu.** Instead of dropping the user on a single link,
   the page a blocked site redirects to shows **all** their saved links as a tidy menu, grouped by
   the **site each link belongs to** (YouTube, Instagram, …) — the site is derived from the link's
   URL, no extra tagging needed — and, **under each site name, grouped by topic**. The blocked
   site the user just reached for is **prioritised**: if they have saved links for *that* site,
   that site's list is shown first; if they have none for it, their **other** sites' lists are
   shown instead. So reaching for YouTube surfaces the YouTube videos they meant to watch (by
   topic); reaching for a site they've saved nothing for still offers everything else they wanted
   to get to. *Why: it converts the impulse into a clear pick among the user's own goals, on-theme
   with the very site they reached for.* The user's **intention** (feature 2) sits at the top of
   this page as a reminder.
6. **Thought parking lot** — the redirect page also offers one small text box: *"Was there
   something on your mind? Jot it down and let it go."* Whatever the user types is saved to a
   **"for later" list** they see when the session ends — it is *not* opened now. *Why: a huge share
   of distraction is a nagging thought the brain won't drop until it's acted on or written down.
   Capturing it lets the brain release it, turning a rabbit hole into a parked task. This is the
   feature our interception architecture is uniquely able to offer, at the perfect moment.*
7. **Two ways to add links:**
   - **Paste a URL** directly (choose a topic; defaults to General).
   - **Capture the current tab** — when the timer is **off**, the user can open the extension on
     any page worth keeping and tap "Save this page to a list". (Capture lives in the off-state
     because while the timer is *on*, a blocked tab would already have been redirected away.)
8. **Freedom window (per-site allowance)** — sometimes a blocked site is genuinely needed
   (a lecture, a tutorial). The user can allow **one** of their blocked sites for a chosen time:
   **5 min · 15 min · 30 min · until I turn it off**. During the window that one site is not
   redirected; every *other* site on the block list stays protected. The popup always shows a
   visible status (e.g. "youtube.com: free for 12 more min" / "free, no time limit — Turn off")
   so an allowance is never silently left on. Picking a duration on purpose is intentional
   friction — it keeps this from becoming a mindless "skip" button.
9. **Escape hatches:** (a) allow one site for a time *(above)*, (b) pause the whole timer.
10. **Session wrap-up — the gentle win log.** When a focus session ends, a soft summary of what
    happened: *"You focused 25 min · sidestepped 3 distractions · parked 2 thoughts for later"* —
    plus the parked thoughts, ready to act on now that it's break time. It is **additive only**:
    it counts wins and never shows a broken streak, a red X, or a "you failed" screen. If the user
    bails early, nothing is punished. *Why: anxiety brains discount their own progress ("I did
    nothing"), and punitive streak-tools cause the shame that makes ADHD users abandon them. This
    also feeds the bunny's mood and gives the demo its proof-it-works numbers.*
11. **Bunny companion (body-double)** — a pixel bunny that sits with the user and gets happier the
    longer they focus (eats grass; art illustrated later). It is framed as a **body-double** — a
    calm presence working *alongside* you, a real focus technique — not a pet you can neglect to
    death: when idle it simply naps, it never loses health or dies. This is the gentle,
    non-punitive gamification *skin* over the core — built **last**, and driven by the win-log data.

**The block list belongs to the user.** They add whichever sites pull *them* away — as many as
they like — and remove any at will. Nothing is hard-coded: the engine redirects exactly what's on
the user's list and nothing else. We ship a few optional starting suggestions (YouTube, Instagram,
X, Reddit) purely as a convenience to delete or keep. (A site like LeetCode would more likely be a
useful-link *target* than a block, but even that is the user's call.)

---

## 4. How — the technical approach

A Chrome extension is a small bundle of web files plus a `manifest.json` (a file that tells
Chrome what the extension is and what it's allowed to do). Each feature maps to one part:

| Part | Plain meaning | Powers |
|---|---|---|
| **Popup** | The window that opens when you click the toolbar icon | Bunny, health bar, timer, topic prompt, link lists, freedom controls, capture button |
| **Background service worker** | A script that runs quietly in the background | Timer ticking, watching navigation, doing the redirects |
| **Storage** | A small built-in database | Topics + links, distracting sites, current topic, allowances, timer state, bunny mood |
| **Alarms** | A scheduler that can wake the background script | Ending a Pomodoro session, ending a timed freedom window |

We use the **redirect** approach (change the whole tab's address), not an overlay, because it's
reliable and works on every site — important for a live demo.

### Data we save (rough shape)

```
topics: {
  "General":  [ {url, title, savedAt}, ... ],
  "DSA prep": [ {url, title, savedAt}, ... ]
}
currentTopic: "General"
nextLinkIndex: { "General": 0, "DSA prep": 2 }   // for in-order serving
distractingSites: ["youtube.com", "instagram.com", ...]   // the user's own list — any sites
allowances: { "<some blocked site>": <expiry timestamp | "forever"> }
timer: { mode: "focus" | "break", running: bool, endTime, remaining }
bunny: { happiness, lastActive }

// --- support layer ---
intention: { text, setAt }                            // this session's "one thing" (feature 2)
parkingLot: [ {text, savedAt, done}, ... ]            // thoughts jotted at the redirect (feature 6)
sessionStats: { focusMs, sidesteps, parked }          // counted this session, for the win log (feature 10)
```

### Redirect logic (in plain steps)

When a tab navigates to a site:
1. Is the timer running **and** in *focus* mode? If no → do nothing.
2. Is the site in the distracting list? If no → do nothing.
3. Does the site have an active **freedom window**? If yes → do nothing.
4. Otherwise → count it as a **sidestep** (for the win log) and redirect the tab to the redirect
   landing page, which shows the user's **intention**, their **link menu** (next useful link
   highlighted; General as fallback if the current topic is empty), and the **thought parking
   lot** box.

### Permissions we'll request (and why)

- `storage` — save the lists, settings, and state.
- `tabs` — read the current tab's address (to recognise a blocked site and to capture the current page when the user saves it).
- `webNavigation` — notice when a tab is heading to a new page, so we can redirect early.
- `alarms` — reliably end timer sessions and freedom windows.
- `notifications` — tell the user when a focus session ends.
- `host_permissions: <all_urls>` — needed to redirect any distracting site.

---

## 5. Stages (build order)

Built so there's something runnable early; the impressive mechanic comes before the decoration.

- **Stage 0 — Skeleton.** `manifest.json` + a popup that just opens. Load it in Chrome (learn the
  load-an-extension loop). *Deliverable: the extension installs and the popup appears.*
- **Stage 1 — Timer.** Working Pomodoro countdown (focus/break, start/pause/reset) in the popup,
  kept alive by the background worker + alarms. *Deliverable: a real timer.*
- **Stage 2 — Substitution engine + topic lists.** Storage for distracting sites and topic-based
  useful links; the redirect logic; the "What are you exploring?" topic prompt. The redirect
  landing page shows the user's saved links as a menu grouped by site, then by topic, with the
  site they reached for shown first (see feature 5).
  *Deliverable: opening any site on your block list during focus sends you to your goal. (The wow moment.)* ✅
- **Stage 3 — Freedom window.** Per-site timed allowance (5/15/30/until-off) on the redirect
  landing page and in the popup, with visible status. *Deliverable: escape hatch works.* ✅
- **Stage 4 — Capture current tab.** When the timer is off, a "Save this page to a list" button for
  whatever site you're currently on. *Deliverable: easy link adding.* ✅

**The support layer** (the ADHD/anxiety features — this is where the product gets its heart):

- **Stage 5 — Intention anchor.** A "What's the one thing?" prompt when a focus session starts,
  saved to storage and shown at the top of the redirect landing page.
  *Deliverable: every redirect reminds you of your own goal.* ✅
- **Stage 6 — Thought parking lot.** A jot box on the redirect page ("Was there something you
  meant to do there?") that saves thoughts to a "for later" list instead of chasing them. The
  list shows on the popup's Focus tab (only when non-empty), where each thought can be ticked off
  or removed. (Will also feed the Stage-7 session-end summary once that exists.)
  *Deliverable: a nagging thought becomes a parked task, not a rabbit hole.* ✅
- **Stage 7 — Session wrap-up / win log.** Count focus time, sidesteps, and parked thoughts per
  session; show a gentle, additive-only summary (never a failure screen) at session end.
  *Deliverable: proof-it-works numbers + the data the bunny's mood runs on.*

**The skin, last:**

- **Stage 8 — Bunny companion (body-double).** Placeholder art first, then the user's pixel art;
  mood driven by the win-log/focus data; naps when idle, never dies. *Deliverable: the charming,
  non-punitive companion.*

For the hackathon, the feature list is **frozen** at the above. Any *further* new idea becomes
"v2 / nice-to-have" so we ship a working demo.

---

## 6. Open / deferred decisions

- Link serving order defaulted to **in order**; random is a possible toggle later.
- The redirect landing page now shows a full **grouped menu** (feature 5) the user picks from.
  Open question: does the old "serve the next link in order" behaviour still apply (e.g. as a
  highlighted "next up" suggestion above the menu), or does the menu replace it entirely? Leaning
  toward the menu being the main thing, with in-order kept only for the highlighted suggestion.
- **Intention anchor:** is it required or skippable to start a session? Leaning **skippable**
  (forcing it would be a wall, against the philosophy). Does it persist across sessions in a day or
  reset each session? Leaning reset each focus session.
- **Parking lot:** does the "for later" list live forever until cleared, or clear each day? And is
  it shown on the break screen, in the popup, or both? Leaning: persists until the user ticks items
  off; surfaced on the session-end wrap-up and in a popup tab.
- **Win log:** what counts as a "win" worth showing, and do stats persist as a lifetime tally
  (e.g. a small "focus garden") or just per-session? Leaning per-session for the demo, lifetime
  tally as a stretch.
- Exact bunny mood thresholds (how fast it gets sad/happy) — tune during Stage 8.
- Whether the bunny reacts to using a freedom window — likely stays neutral (non-punitive).
