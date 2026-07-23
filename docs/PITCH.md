# Sidestep: Judge Pitch

*Ideation, the problem it solves, the engineering restraint behind it, and the psychology of why it works for a student's focus.*

---

## 1. The problem, stated honestly

Every student already owns five focus apps and ignores all of them. Site blockers get uninstalled by Tuesday. The reason isn't willpower. It's that blockers treat a *psychological* problem as a *mechanical* one. They assume the enemy is the website. It isn't.

The real sequence is this: you're studying, a thought surfaces, *"did Sam reply?"*, *"I should check that grade,"* and your hand opens a new tab before you've consciously decided anything. The website is just the exit door. The thing that made you stand up was an **unfinished loop in your head.** A hard blocker slams the door and leaves the loop screaming. So you fight the blocker, disable it, or tab to your phone. Suppression doesn't work; it rebounds.

**Sidestep solves the loop, not the door.**

## 2. The ideation process, one real pivot

We started where everyone starts: a Pomodoro timer plus a blocklist. It was boring and, worse, it was the same thing that had already failed us.

The pivot came from asking a single question: *what is the user actually trying to do in the half second before they get distracted?* The answer is almost never "waste time." It's "discharge a nagging thought." So instead of blocking, we intercept that moment and give the thought somewhere to go. When you drift to a protected site mid focus, Sidestep doesn't show a wall. It shows a calm page that says *"You were heading to YouTube. Was there something you meant to do there?"* and lets you **park the thought** in one line. Then you close the loop and return to work.

That reframe, from **blocking** to **substitution**, is the whole project. Everything else is built to protect that moment and make coming back feel good instead of punishing.

## 3. The core mechanic, and why it's load-bearing

Parking a thought looks trivial. It is the single most psychologically grounded thing in the app.

- **Zeigarnik effect / open loops:** unfinished intentions occupy working memory and keep pulling attention. They don't quiet down until they're resolved *or credibly deferred.*
- **Implementation intentions (Masicampo & Baumeister):** you don't need to *do* the task to free the mind. You need to make a concrete plan for it. Writing "reply to Sam later" is exactly that plan. The brain accepts the deferral and lets go.
- **Ironic process theory (Wegner):** "don't think about the website" guarantees you think about it. Substitution sidesteps the rebound entirely by redirecting the intention instead of suppressing it.

So the block page isn't a gate. It's a **cognitive offload surface.** That's the depth. It's just hidden in the psychology instead of the code.

## 4. Every feature, and the "why" behind it

Nothing here is decorative. Each feature maps to a mechanism.

| Feature | What it does | Why it works |
|---|---|---|
| **The nudge / park-a-thought** | Intercepts the drift, captures the thought | Closes the open loop (Zeigarnik plus implementation intentions) |
| **The freedom window** ("need YouTube? 5 min") | Grants a timed, self chosen pass | **Autonomy** (Self-Determination Theory). A tool that *polices* you triggers reactance; one that *trusts* you gets kept. You stay the decision maker. |
| **Parked-thoughts list** | Everything you deferred, waiting after the session | Makes the deferral *credible*. The mind only lets go if it believes the thought is safe |
| **Pixel companion, on every page** | A small living presence that runs alongside you, draggable anywhere | **Body doubling / co-presence,** the "study-with-me" effect. Relatedness, the third SDT pillar. A companion on screen quietly signals "we're working," which raises adherence |
| **XP that you earn by focusing and slowly lose when idle** | Unlocks companions and themes | **Competence** (visible mastery) plus gentle **loss aversion**. Escalating unlock costs (60, 150, 300, 500) make progress feel earned, not handed over |
| **Companion sleeps during breaks, with drifting Zzz** | Models rest | Gives *permission to rest.* Reinforces the Pomodoro discipline instead of guilt tripping breaks |
| **Cozy themes (Meadow, Autumn, Rainy)** | Whole UI recolours | **Affect matters.** A shaming, red alert blocker raises anxiety and avoidance. Warmth produces approach behavior. Calm design is a retention strategy, not a coat of paint |
| **The completion chime plus notification** | Signals session boundaries | Clean start/stop cues reduce **attention residue** (Leroy). You know precisely when to switch, so the previous block stops bleeding into the next |
| **Toolbar countdown badge** | Time left at a glance | Ambient awareness without opening anything. Lowers the temptation to "just check the timer" |

The through line: **friction in the right place.** We insert one gentle pause into the habit loop (cue, routine, reward) right at the routine step. Not a wall, a speed bump with a purpose. Walls get torn down; speed bumps get respected.

## 5. Why more technical depth would make this *worse,* and where the real engineering is

I expect the instinct from a tech panel: *"It's a timer and a redirect. Where's the backend? The ML? The complexity?"* Here's my honest answer: **adding those would be over engineering a behavioral problem, and it would break the product.**

**First, the hard engineering here is real, it's just in the right places:**

- **MV3 service worker lifecycle.** Chrome kills the background worker after about 30 seconds idle. A naive `setInterval` timer would silently die. Ours is **timestamp based** (`endsAt` plus `chrome.alarms`), so it's accurate across worker deaths, sleeps, and browser restarts. It reconciles missed completions on wake. That's the classic MV3 trap, handled.
- **Audio from a service worker is impossible.** The worker has no DOM. Playing the completion chime required an **offscreen document,** the correct (and non obvious) MV3 pattern. We built exactly that.
- **Correct domain matching.** Blocking `youtube.com` must not block `notyoutube.com`. We match on host equality or a leading dot suffix, a small correctness detail that separates a real tool from a demo.
- **Badge accuracy.** The countdown re-arms on the clock's own minute boundary so it never drifts out of step.

**Second, the deliberate restraint is the sophistication:**

- **Zero network. No servers, no accounts, no `host_permissions`, no analytics.** Everything lives in `chrome.storage.local`. For a tool that necessarily *sees which sites you visit,* local only isn't a limitation, it's the **entire trust proposition.** A backend would add latency, a privacy liability, an outage surface, and a cost center, in exchange for **zero** behavioral benefit. The right architecture for "watch my browsing and help me focus" is the one that can never phone home.
- **Matching complexity to the problem.** The problem is a psychology problem. The correct solution is behavioral design executed on a platform with brutal constraints, not a transformer model deciding whether you're "really" focused. Good engineering is choosing the *smallest* system that fully solves the problem. That's a judgment call, and making it is the skill.

So the technical depth is exactly where it should be: in respecting a hostile runtime and in refusing to add machinery that would betray the user. Every line of restraint is a decision, not an absence.

## 6. Why it actually works for a student

Put together, Sidestep is a small, quiet system that satisfies the three things intrinsic motivation actually requires (Self-Determination Theory):

- **Autonomy.** You grant your own passes; nothing is locked away by force.
- **Competence.** XP and unlocks make your accumulated focus *visible* and earned.
- **Relatedness.** A companion works beside you, so focusing feels less like solitary discipline and more like company.

And it removes the one thing that breaks focus most, the nagging open loop, by giving thoughts a home instead of a wall. It's not trying to out discipline the student. It's lowering the psychological cost of staying, and the psychological cost of coming back.

That's the pitch: **a focus tool that finally treats distraction as a thought to be caught, not a site to be banned, built with exactly as much technology as that truth requires, and not one byte more.**
