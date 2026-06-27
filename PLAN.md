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

### How we're different

Pet + timer + blocker combos already exist (e.g. Otto, StudyMate AI), and they **block and
punish** (pet loses health when you visit a blocked site). Our defensible edge is the
**substitution engine** plus topic-aware redirection: distractions become *your* goals, with a
gentle companion rather than a guilt trip.

---

## 3. What — the product

Core features (the heart of the product):

1. **Pomodoro timer** — focus / break sessions, kept running in the background even when the
   popup is closed.
2. **Substitution engine** — during a *focus* session, opening **any site on the user's own block
   list** redirects the tab to a useful link from the user's **current topic**. The engine treats
   every blocked site the same way; none is special-cased.
3. **Topic-wise link lists** — useful links live in topic "folders". The "What are you
   exploring?" prompt sets the *current topic*; if none is given, links go to **General**.
   Within a topic, links are served **in order, like a to-do list** (loops back to the start at
   the end). *(Configurable; random is a possible later option.)*
4. **Redirect landing page — your link menu.** Instead of dropping the user on a single link,
   the page a blocked site redirects to shows **all** their saved links as a tidy menu, grouped by
   the **site each link belongs to** (YouTube, Instagram, …) — the site is derived from the link's
   URL, no extra tagging needed — and, **under each site name, grouped by topic**. The blocked
   site the user just reached for is **prioritised**: if they have saved links for *that* site,
   that site's list is shown first; if they have none for it, their **other** sites' lists are
   shown instead. So reaching for YouTube surfaces the YouTube videos they meant to watch (by
   topic); reaching for a site they've saved nothing for still offers everything else they wanted
   to get to. *Why: it converts the impulse into a clear pick among the user's own goals, on-theme
   with the very site they reached for.*
5. **Two ways to add links:**
   - **Paste a URL** directly (choose a topic; defaults to General).
   - **Capture the current tab** — when the timer is **off**, the user can open the extension on
     any page worth keeping and tap "Save this page to a list". (Capture lives in the off-state
     because while the timer is *on*, a blocked tab would already have been redirected away.)
6. **Freedom window (per-site allowance)** — sometimes a blocked site is genuinely needed
   (a lecture, a tutorial). The user can allow **one** of their blocked sites for a chosen time:
   **5 min · 15 min · 30 min · until I turn it off**. During the window that one site is not
   redirected; every *other* site on the block list stays protected. The popup always shows a
   visible status (e.g. "youtube.com: free for 12 more min" / "free, no time limit — Turn off")
   so an allowance is never silently left on. Picking a duration on purpose is intentional
   friction — it keeps this from becoming a mindless "skip" button.
7. **Escape hatches:** (a) allow one site for a time *(above)*, (b) pause the whole timer.
8. **Bunny pet + health bar** — a pixel bunny that gets happier the longer you focus and sad
   when idle a long time (eats grass, art to be illustrated later). This is a gentle
   gamification *skin*, not the core — built **last**.

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
```

### Redirect logic (in plain steps)

When a tab navigates to a site:
1. Is the timer running **and** in *focus* mode? If no → do nothing.
2. Is the site in the distracting list? If no → do nothing.
3. Does the site have an active **freedom window**? If yes → do nothing.
4. Otherwise → redirect the tab to the next useful link from the current topic
   (fall back to General if the current topic is empty).

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
  site they reached for shown first (see feature 4).
  *Deliverable: opening any site on your block list during focus sends you to your goal. (The wow moment.)*
- **Stage 3 — Freedom window.** Per-site timed allowance (5/15/30/until-off) on the redirect
  landing page and in the popup, with visible status. *Deliverable: escape hatch works.*
- **Stage 4 — Capture current tab.** When the timer is off, a "Save this page to a list" button for
  whatever site you're currently on. *Deliverable: easy link adding.*
- **Stage 5 — Bunny + health bar.** Placeholder art first, then the user's pixel art; mood reacts
  to focus/idle time. *Deliverable: the charming skin.*

For the hackathon, the feature list is **frozen** at the above. Any new idea becomes "v2 /
nice-to-have" so we ship a working demo.

---

## 6. Open / deferred decisions

- Link serving order defaulted to **in order**; random is a possible toggle later.
- The redirect landing page now shows a full **grouped menu** (feature 4) the user picks from.
  Open question: does the old "serve the next link in order" behaviour still apply (e.g. as a
  highlighted "next up" suggestion above the menu), or does the menu replace it entirely? Leaning
  toward the menu being the main thing, with in-order kept only for the highlighted suggestion.
- Exact bunny mood thresholds (how fast it gets sad/happy) — tune during Stage 5.
- Whether the bunny reacts to using a freedom window — likely stays neutral (non-punitive).
