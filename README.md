<p align="center">
  <img src="assets/banner.png" alt="Sidestep — don't block the distraction, sidestep it" width="100%">
</p>

<h1 align="center">Sidestep</h1>

<p align="center">
  <strong>A gentle Chrome focus tool that turns the sites you waste time on into the things you actually meant to do.</strong>
</p>

<p align="center">
  <img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome-Extension-8C81CC?style=for-the-badge">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-6E5FC0?style=for-the-badge">
  <img alt="Built with WXT + Svelte" src="https://img.shields.io/badge/Built%20with-WXT%20%2B%20Svelte-4A4080?style=for-the-badge">
  <img alt="Hackathon: HackWave 2026" src="https://img.shields.io/badge/HackWave-2026-A99CF0?style=for-the-badge">
</p>

---

## 💡 The idea in one line

Most focus apps **block** distracting sites and put up a wall. Sidestep does the opposite: when you reach for a distracting site, it **quietly redirects you to one of your own useful links instead.** Same impulse, better destination.

> **Substitution, not blocking.** A wall makes you want to switch the tool off. A gentle redirect works *with* you.

---

## 🐰 Meet your bunny

Sidestep has a little pixel bunny that lives in the app and keeps you company.

<table>
<tr>
<td width="50%" valign="top">

### ☀️ By day, it works with you

Open the popup and a small bunny hops along in its meadow while your focus session runs. When you pause or stop, it settles down and rests. It is a calm body double, a quiet presence that makes focusing feel a little less lonely.

</td>
<td width="50%" valign="top">

### 🌙 By night, it tells you to rest

Drift to a distracting site mid session and you do not hit a harsh block wall. You land on a peaceful night sky, where the same bunny is fast asleep on a cloud with little "Zzz" drifting up. The message is gentle: rest your mind, then come back to what you were doing.

</td>
</tr>
</table>

---

## ✨ What's inside

| | Feature | What it does |
|:--:|---|---|
| 🔁 | **Substitution engine** | The heart of Sidestep. During a focus session, opening any site on *your* list redirects the tab to a useful link *you* saved. |
| 🐰 | **Bunny companion** | An animated pixel bunny that hops while you focus and rests when you pause. The emotional heart of the app, front and centre on the focus screen. |
| 🌙 | **Calm night redirect** | Get pulled off task and you land on a soft night scene with a sleeping bunny, not a guilt screen. |
| 🗒️ | **Thought parking lot** | Jot down the stray thought that pulled you away ("reply to Sam") from the popup or the redirect page. It waits safely on a *for later* list so it stops nagging you, instead of becoming a rabbit hole. |
| ⏱️ | **Focus timer** | A focus first Pomodoro timer that keeps running in the background even when the popup is closed. |
| 🕊️ | **Freedom window** | Genuinely need a blocked site for a bit? Allow just that one site for 5, 15, or 30 minutes (or until you turn it off). Every other site stays protected. |
| 📌 | **Capture the current tab** | Save any page worth keeping straight into a topic list, ready to be served back to you later. |

---

## 🎬 How it feels

1. You start a focus session. A little bunny begins hopping alongside you.
2. Ten minutes in, your hand drifts to YouTube out of habit.
3. Instead of YouTube, the tab lands on a **calm night scene**: a sleeping bunny, a menu of the useful links you actually saved, and a soft box asking *"Was there something you meant to do there?"*
4. You jot the thought down, pick a useful link (or just close the tab), and carry on. The thought is waiting for you in the popup for later.

No guilt screen. No "you failed." Just a gentle nudge back toward what you wanted.

---

## 🛠️ Built with

- **[WXT](https://wxt.dev/)** is a modern toolkit for building browser extensions (it handles the build, hot reload, and manifest for us).
- **[Svelte 5](https://svelte.dev/)** is the UI framework for the popup and the redirect page.
- **Chrome Manifest V3** is the current standard for Chrome extensions (background *service worker*, storage, alarms, webNavigation).

Under the hood, one background *service worker* (a script that runs quietly on its own) owns the timer and watches page navigations. The popup just sends it commands and reads the result back from storage, so your session keeps ticking even with the popup closed.

---

## 🚀 Run it locally

You will need [Node.js](https://nodejs.org/) installed (it comes with `npm`, the tool that installs code libraries).

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
2. Turn on **Developer mode** (top right toggle).
3. Click **Load unpacked** and select the `Project/.output/chrome-mv3/` folder.
4. Pin the Sidestep icon, click it, and start a focus session.

> 💡 For live development with auto reload, run `npm run dev` instead of `npm run build`.

---

## 📂 Project layout

```
HackWave/
├─ Project/                    # the Chrome extension (WXT + Svelte)
│  ├─ public/
│  │  ├─ bunny/                # the companion's hop + sit animation frames
│  │  └─ scene/                # night sky + sleeping bunny for the redirect page
│  └─ src/
│     ├─ entrypoints/
│     │  ├─ popup/             # the toolbar popup (timer, bunny, lists, settings)
│     │  ├─ nudge/             # the calm night redirect page
│     │  └─ background.ts      # the service worker: owns the timer & redirects
│     └─ lib/
│        ├─ storage.js         # what we save (settings, timer, lists, parking lot)
│        ├─ sites.js           # URL rules: is this distracting? which link is next?
│        └─ timer.js           # pure, focus first timer logic
├─ PLAN.md                     # full product plan & build stages
├─ ARCHITECTURE.md             # how the pieces fit together
└─ assets/banner.png           # the banner above
```

---

## 🗺️ Where it's headed

- [x] Substitution engine and topic link lists
- [x] Focus timer that runs in the background
- [x] Freedom window (per site allowance)
- [x] Capture the current tab
- [x] Thought parking lot (from the popup and the redirect page)
- [x] Bunny companion: animated, hops while you focus, sleeps on the redirect page
- [ ] **The bunny grows up.** It starts as a baby and levels through XP earned from how long you focus each day and how consistent you stay, unlocking new skins and little accessories along the way. The more you focus, the more it becomes your own encouragement pet.
- [ ] Session wrap up: a gentle, additive only "win log"

---

<p align="center">
  <sub>Built with 💜 for <strong>HackWave 2026</strong> · A supportive productivity tool, not a medical or clinical product.</sub>
</p>
