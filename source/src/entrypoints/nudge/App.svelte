<script>
  // This page is what a redirected tab shows. The background tells us in the URL
  // which site we stepped past (`from`) and the exact page they were heading to
  // (`orig`), so "allow + go" can hand them straight back to it.
  //
  // It's a pause, not a wall: jot down whatever pulled you here, see the thoughts
  // you've already parked, see the sites you're protecting, and — if you genuinely
  // need this one — open a freedom window for it.
  import { onMount } from 'svelte';
  import { browser } from '#imports';
  import { parkingLot, settings } from '@/lib/storage';
  import { COMPANIONS, DEFAULT_COMPANION } from '@/lib/companions';
  import { parkThought } from '@/lib/parking';

  const params = new URLSearchParams(location.search);
  const from = params.get('from') ?? 'that site';
  const orig = params.get('orig'); // the exact page the user was heading to

  // The thought parking lot: whatever pulled them here, jotted down so it stops
  // nagging. `parked` briefly confirms the save.
  let parkDraft = $state('');
  let parked = $state(false);
  let thoughts = $state([]); // [{ text, savedAt, done }] — newest first
  let blockedSites = $state([]); // the sites being protected this session
  let loaded = $state(false);

  // Which pet naps on this page follows the companion chosen in settings.
  let companionKey = $state(DEFAULT_COMPANION);
  let pet = $derived(COMPANIONS[companionKey]);

  onMount(async () => {
    const cfg = await settings.getValue();
    companionKey = cfg?.companion ?? DEFAULT_COMPANION;
    blockedSites = Array.isArray(cfg?.distractingSites) ? cfg.distractingSites : [];
    thoughts = await readThoughts();
    loaded = true;
  });

  // Never trust a corrupted value — the list must be safe to loop over.
  async function readThoughts() {
    const stored = await parkingLot.getValue();
    return Array.isArray(stored) ? stored : [];
  }

  // Save a stray thought, then clear the box, flash a note, and refresh the list
  // below so the thought they just typed appears straight away.
  async function park() {
    if (!(await parkThought(parkDraft))) return; // empty box — nothing to save
    parkDraft = '';
    thoughts = await readThoughts();
    parked = true;
    setTimeout(() => (parked = false), 2600);
  }

  function open(u) {
    if (u) location.replace(u); // replace() so Back doesn't loop us here
  }

  // Freedom window: grant THIS site a pass, then go to the page they wanted.
  // `minutes` is a number or the string 'forever'.
  async function allow(minutes) {
    await browser.runtime.sendMessage({ action: 'allowSite', host: from, minutes });
    open(orig || `https://${from}`);
  }
</script>

<!-- Clouds drift slowly leftward across the night sky, behind everything. The
     cloud strip tiles seamlessly, so repeating it and sliding by one tile-width
     loops forever with no visible seam. -->
<div class="clouds" aria-hidden="true"></div>

<main>
  <div class="sleeper-wrap" style="width:{pet.sleepW}px">
    <img class="sleeper" src={pet.sleep} alt="" />
    <!-- Sleepy pixel "Z"s: they drift up and fade one after another, on a loop. -->
    <img class="z z1" src="/scene/z.png" alt="" />
    <img class="z z2" src="/scene/z.png" alt="" />
    <img class="z z3" src="/scene/z.png" alt="" />
  </div>
  <div class="card">
    <div class="brand-wrap">
      <svg class="sprout" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
        <path d="M12 22c-.55 0-1-.45-1-1v-6.2c0-.55.45-1 1-1s1 .45 1 1V21c0 .55-.45 1-1 1Z"/>
        <path d="M10.8 14.2c-3.4 0-6.2-2.8-6.2-6.2 0-.6.5-1 1-1 3.4 0 6.2 2.8 6.2 6.2 0 .6-.5 1-1 1Z"/>
        <path d="M13.2 12.2c0-3.4 2.8-6.2 6.2-6.2.6 0 1 .5 1 1 0 3.4-2.8 6.2-6.2 6.2-.6 0-1-.5-1-1Z"/>
      </svg>
      <span class="brand">Sidestep</span>
      <span class="badge">stepped in</span>
    </div>

    <h1>You were heading to <span class="from">{from}</span></h1>
    <p class="sub">You're in a focus session. Park the thought, then get back to it.</p>

    <div class="park">
      <label class="park-q" for="park-input">Was there something you meant to do there?</label>
      <div class="park-row">
        <input
          id="park-input"
          class="park-inp"
          placeholder="Jot it down — e.g. reply to Sam's message"
          bind:value={parkDraft}
          onkeydown={(e) => e.key === 'Enter' && park()}
        />
        <button class="park-btn" onclick={park}>Park it</button>
      </div>
      {#if parked}
        <span class="park-done">Saved — it'll be waiting in Sidestep after your session.</span>
      {/if}
    </div>

    {#if loaded}
      <!-- Everything already parked, so the thought that just pulled them here
           lands among the others instead of vanishing into the popup. -->
      <section class="sec">
        <h2 class="sec-title">Parked thoughts</h2>
        {#if thoughts.length}
          <ul class="thoughts">
            {#each thoughts as th}
              <li class="thought" class:done={th.done}>
                <span class="t-dot" aria-hidden="true"></span>
                <span class="t-text">{th.text}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="empty">Nothing parked yet — jot one above and it'll wait here.</div>
        {/if}
      </section>

      <!-- The sites being held back right now; the one they just reached for is
           marked, so it's clear which of them stopped this tab. -->
      <section class="sec">
        <h2 class="sec-title">Sites you're protecting</h2>
        {#if blockedSites.length}
          <ul class="ovals">
            {#each blockedSites as site}
              <li class="oval" class:current={site === from}>{site}</li>
            {/each}
          </ul>
        {:else}
          <div class="empty">No sites on the list yet.</div>
        {/if}
      </section>
    {/if}

    <div class="allow">
      <span class="allow-q">Genuinely need {from} right now?</span>
      <div class="allow-btns">
        <button onclick={() => allow(5)}>5 min</button>
        <button onclick={() => allow(15)}>15 min</button>
        <button onclick={() => allow(30)}>30 min</button>
        <button class="allow-forever" onclick={() => allow('forever')}>No limit</button>
      </div>
      <span class="allow-note">Only {from} opens up — your other sites stay protected. You can turn it off anytime from the popup.</span>
    </div>
  </div>
</main>

<style>
  main {
    width: 100%;
    max-width: 520px;
    position: relative; /* anchor for the sleeping bunny resting on the card */
  }

  /* The drifting cloud band. Fixed to the viewport, sitting in the upper sky
     behind the card (negative z-index keeps it above the sky background but
     below all content, so the card's frosted blur catches it too). It repeats
     horizontally and slides left by exactly one tile-width on an endless loop —
     because the strip is horizontally continuous, the wrap is seamless. */
  .clouds {
    position: fixed;
    top: 40px;
    left: 0;
    width: 100%;
    /* The cloud strip is scaled to nearly fill the sky's height, but stops short
       of the bottom to leave breathing room. The region is the sky's height
       (50.4vw: sky is 1767x890 → 890/1767 of its 100vw width). We reserve 7% of
       that height (3.528vw) as bottom padding, so the clouds fill the top
       50.4 − 3.528 = 46.872vw. The tile is 2172x724 (exactly 3x wider than
       tall), so at that height it is 46.872 × 3 = 140.62vw wide. Anchored to the
       top (default position), the reserved space falls at the bottom. */
    height: 50.4vw;
    z-index: -1;
    pointer-events: none;
    background: url('/scene/clouds.png') repeat-x;
    background-size: 140.62vw 46.872vw;  /* one tile, leaving 7% bottom padding */
    image-rendering: pixelated;          /* keep the pixel-art edges crisp */
    opacity: 0.92;
    animation: cloud-drift 233s linear infinite;  /* slow, gentle drift */
  }
  @keyframes cloud-drift {
    from { background-position-x: 0; }
    to   { background-position-x: -140.62vw; }  /* one full tile → seamless loop */
  }
  /* Respect users who prefer no motion: park the clouds in place. */
  @media (prefers-reduced-motion: reduce) {
    .clouds { animation: none; }
  }

  /* The sleeping companion lies on top of the card's front edge — most of it
     above the card, its body dipping onto the top so it reads as resting there.
     Width is set inline, per companion (see lib/companions.js). */
  .sleeper-wrap {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translate(-50%, -80%);
    z-index: 3;
    pointer-events: none;
  }
  .sleeper {
    display: block;
    width: 100%;
    height: auto;
    filter: drop-shadow(0 6px 10px rgba(20, 15, 40, 0.5));
  }

  /* The sleepy Z's rise up from above the bunny's head and fade, staggered so
     they appear one by one. A soft moonlit lavender with a faint glow. */
  .z {
    position: absolute;
    image-rendering: pixelated;                                 /* crisp pixel edges */
    filter: drop-shadow(0 0 5px rgba(190, 178, 240, 0.55));     /* soft moonlit glow */
    opacity: 0;
    animation: zrise 3.9s ease-in-out infinite;
  }
  .z1 { left: 47%; top: 4%;   width: 15px; animation-delay: 0s; }
  .z2 { left: 57%; top: -12%; width: 20px; animation-delay: 1.3s; }
  .z3 { left: 68%; top: -30%; width: 26px; animation-delay: 2.6s; }
  @keyframes zrise {
    0%   { opacity: 0; transform: translateY(6px) scale(0.7); }
    18%  { opacity: 1; }
    55%  { opacity: 1; }
    100% { opacity: 0; transform: translateY(-18px) scale(1.05); }
  }

  .card {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow);
    backdrop-filter: blur(5px); /* frosts the night sky behind the card */
    padding: 34px 30px 24px;
    text-align: center;
  }

  /* Brand mark — same sprout + wordmark as the popup */
  .brand-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 22px;
  }
  .sprout { color: var(--accent); flex: none; }
  .brand {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-weight: 600;
    font-size: 22px;
    letter-spacing: 0.2px;
    color: var(--ink);
  }
  .badge {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--accent-deep);
    background: var(--accent-tint);
    border-radius: 999px;
    padding: 4px 11px;
  }

  h1 {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-size: 27px;
    font-weight: 500;
    line-height: 1.25;
    margin: 0 0 9px;
    color: var(--ink);
  }
  .from { color: var(--accent-deep); }

  .sub {
    margin: 0 0 22px;
    color: var(--ink-soft);
    font-size: 15px;
  }

  /* Thought parking lot — dump the impulse that brought you here */
  .park {
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--r);
    padding: 13px 16px;
    margin-bottom: 18px;
  }
  .park-q { font-size: 12.5px; font-weight: 700; color: var(--ink-soft); }
  .park-row { display: flex; gap: 7px; }
  /* The jot field is a solid light panel with dark text — a clear, familiar place
     to type, standing out against the dark night card. */
  .park-inp {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 13.5px;
    color: #2E2748;
    background: #F5F3FC;
    border: 1.5px solid transparent;
    border-radius: 11px;
    padding: 9px 12px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .park-inp:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-tint);
  }
  .park-inp::placeholder { color: #9089B5; }
  .park-btn {
    border: 0;
    border-radius: 11px;
    padding: 0 16px;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    background: var(--accent-tint);
    color: var(--accent-deep);
    transition: filter 0.15s ease;
  }
  .park-btn:hover { filter: brightness(0.97); }
  .park-done { font-size: 11.5px; font-weight: 700; color: var(--accent-deep); }

  /* Sections below the jot box: parked thoughts, then the protected sites. The
     card is a plain block, so each section carries its own top spacing. */
  .sec { margin-top: 22px; text-align: left; display: flex; flex-direction: column; gap: 9px; }
  .sec .empty { margin-top: 0; }
  .sec-title {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: var(--accent-deep);
    margin: 0;
    padding-bottom: 6px;
    border-bottom: 1.5px solid var(--line);
  }

  /* Parked thoughts — read-only here; you tick them off back in the popup. The
     list scrolls once it gets long so the card never runs off the screen. */
  .thoughts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    max-height: 190px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--accent) transparent;
  }
  .thoughts::-webkit-scrollbar { width: 7px; }
  .thoughts::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 999px; }
  .thoughts::-webkit-scrollbar-track { background: transparent; }
  .thought {
    display: flex;
    align-items: baseline;
    gap: 9px;
    background: var(--surface-2);
    border-radius: 11px;
    padding: 10px 13px;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
  }
  .t-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-deep);
    transform: translateY(-1px);
  }
  .t-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  /* Already handled — kept visible but clearly settled. */
  .thought.done { opacity: 0.55; }
  .thought.done .t-text { text-decoration: line-through; }
  .thought.done .t-dot { background: var(--ink-faint); }

  /* The protected sites, as ovals — the same shape as the chips in the popup. */
  .ovals { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 7px; }
  .oval {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--ink-soft);
    background: var(--surface-2);
    border: 1.5px solid transparent;
    border-radius: 999px;
    padding: 5px 13px;
  }
  /* The one that stopped this tab. */
  .oval.current {
    background: var(--accent-tint);
    border-color: var(--accent);
    color: var(--accent-deep);
  }

  .empty {
    margin-top: 22px;
    border: 1.5px dashed var(--line);
    border-radius: var(--r);
    padding: 18px;
    color: var(--ink-soft);
    font-size: 14px;
    text-align: left;
    background: var(--surface-2);
  }

  /* Freedom-window escape hatch */
  .allow {
    margin: 24px 0 0;
    padding-top: 18px;
    border-top: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
  }
  .allow-q { font-size: 13px; font-weight: 700; color: var(--ink-soft); }
  .allow-btns { display: flex; flex-wrap: wrap; justify-content: center; gap: 7px; }
  .allow-btns button {
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    border-radius: 999px;
    padding: 7px 14px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .allow-btns button:hover { background: var(--accent-tint); border-color: var(--accent-tint); }
  .allow-forever { color: var(--ink-soft); }
  .allow-note { font-size: 11.5px; color: var(--ink-faint); max-width: 340px; }
</style>
