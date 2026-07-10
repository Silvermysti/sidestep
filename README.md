<p align="center">
  <img src="assets/banner.png" alt="Sidestep — don't block the distraction, sidestep it" width="100%">
</p>

<h1 align="center">Sidestep</h1>

<p align="center">
  <strong>A gentle Chrome focus tool that turns the sites you waste time on into the things you actually meant to do.</strong>
</p>

<p align="center">
  <img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome-Extension-cf6b5e?style=flat-square">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-D9A35E?style=flat-square">
  <img alt="Built with WXT + Svelte" src="https://img.shields.io/badge/Built%20with-WXT%20%2B%20Svelte-9C6A2A?style=flat-square">
  <img alt="Hackathon: HackWave" src="https://img.shields.io/badge/HackWave-2026-7BC24A?style=flat-square">
</p>

---

## 💡 The idea in one line

Most focus apps **block** distracting sites and put up a wall. Sidestep does the opposite: when you reach for a distracting site, it **redirects you to one of your own useful links instead.** Same impulse, better destination.

> We call it **substitution, not blocking.** A wall makes you want to switch the tool off. A gentle redirect works *with* you.

---

## 🐰 Why it's different

A blocker fights you. Sidestep meets you at the exact moment you drift — finger already on the distracting site — and gently steers the impulse somewhere useful. Around that core sit a few small features built for how easily-distracted, anxious brains actually work:

| | Feature | What it does |
|---|---|---|
| 🔁 | **Substitution engine** | During a focus session, opening any site on *your* block list redirects the tab to a useful link *you* saved. |
| 🎯 | **Intention anchor** | At the start of a session you set "the one thing" you're here to do. It's shown back to you on the redirect page — so a wandering mind is reminded of its own goal at the moment it starts to slip. |
| 🗒️ | **Thought parking lot** | When a distraction is intercepted, jot down the stray thought that pulled you there ("reply to Sam"). It's saved to a *for-later* list so the thought stops nagging you — instead of becoming a rabbit hole. |
| ⏱️ | **Pomodoro timer** | Focus / break sessions that keep running in the background even when the popup is closed. |
| 🕊️ | **Freedom window** | Genuinely need a blocked site for a bit? Allow just that one site for 5 / 15 / 30 min (or until you turn it off). Every other site stays protected. |
| 📌 | **Capture the current tab** | When the timer's off, save any page worth keeping straight into a topic list. |

---

## 🎬 How it feels

1. You start a focus session and set your **one thing**: *"finish the biology notes."*
2. Ten minutes in, your hand drifts to YouTube out of habit.
3. Instead of YouTube, the tab lands on **your own redirect page** — your goal at the top, a menu of the useful links you actually saved, and a little box: *"Was there something you meant to do there?"*
4. You jot down the thought, pick a useful link (or just close the tab), and carry on. The thought is waiting for you in the popup when your break comes.

No guilt screen. No "you failed." Just a nudge back toward what you wanted.

---

## 🛠️ Built with

- **[WXT](https://wxt.dev/)** — a modern toolkit for building browser extensions (handles the build, hot-reload, and manifest for us).
- **[Svelte 5](https://svelte.dev/)** — the UI framework for the popup and redirect pages.
- **Chrome Manifest V3** — the current standard for Chrome extensions (background *service worker*, storage, alarms, webNavigation).

Under the hood, one background *service worker* (a script that runs quietly in the background) owns the timer and watches page navigations; the popup just sends it commands and reads the result from storage.

---

## 🚀 Run it locally

You'll need [Node.js](https://nodejs.org/) installed (it comes with `npm`, the tool that installs code libraries).

```bash
# 1. go into the extension folder
cd Project

# 2. install the libraries the project depends on
npm install

# 3. build the extension
npm run build
```

This produces a folder at `Project/.output/chrome-mv3/`. To load it into Chrome:

1. Open `chrome://extensions` in your browser.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `Project/.output/chrome-mv3/` folder.
4. Pin the Sidestep icon and click it to start a focus session.

> 💡 For live development with auto-reload, run `npm run dev` instead of `npm run build`.

---

## 📂 Project layout

```
HackWave/
├─ Project/                    # the Chrome extension (WXT + Svelte)
│  └─ src/
│     ├─ entrypoints/
│     │  ├─ popup/             # the toolbar popup (timer, lists, settings)
│     │  ├─ nudge/             # the redirect landing page
│     │  └─ background.ts      # the service worker — owns the timer & redirects
│     └─ lib/
│        ├─ storage.js         # what we save (settings, timer, lists, parking lot…)
│        ├─ sites.js           # URL rules: is this distracting? which link is next?
│        └─ timer.js           # pure timer logic
├─ PLAN.md                     # full product plan & build stages
├─ ARCHITECTURE.md             # how the pieces fit together
└─ assets/banner.png           # the banner above
```

---

## 🗺️ Roadmap

- [x] Substitution engine + topic link lists
- [x] Freedom window (per-site allowance)
- [x] Capture the current tab
- [x] Intention anchor
- [x] Thought parking lot
- [ ] Session wrap-up — a gentle, additive-only "win log"
- [ ] Bunny companion — a calm body-double that naps when idle and never guilt-trips you

---

<p align="center">
  <sub>Built for <strong>HackWave 2026</strong> · A supportive productivity tool — not a medical or clinical product.</sub>
</p>
