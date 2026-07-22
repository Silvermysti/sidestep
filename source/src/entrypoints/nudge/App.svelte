<script>
  import { onMount } from 'svelte';
  import { browser } from '#imports';
  import { parkingLot, settings } from '@/lib/storage';
  import { COMPANIONS, DEFAULT_COMPANION } from '@/lib/companions';
  import { parkThought } from '@/lib/parking';

  const params = new URLSearchParams(location.search);
  const from = params.get('from') ?? 'that site';
  const orig = params.get('orig');

  let parkDraft = $state('');
  let parked = $state(false);
  let thoughts = $state([]);
  let blockedSites = $state([]);
  let loaded = $state(false);

  let companionKey = $state(DEFAULT_COMPANION);
  let pet = $derived(COMPANIONS[companionKey]);

  onMount(async () => {
    const cfg = await settings.getValue();
    companionKey = cfg?.companion ?? DEFAULT_COMPANION;
    blockedSites = Array.isArray(cfg?.distractingSites) ? cfg.distractingSites : [];
    thoughts = await readThoughts();
    loaded = true;
  });

  async function readThoughts() {
    const stored = await parkingLot.getValue();
    return Array.isArray(stored) ? stored : [];
  }

  async function park() {
    if (!(await parkThought(parkDraft))) return;
    parkDraft = '';
    thoughts = await readThoughts();
    parked = true;
    setTimeout(() => (parked = false), 2600);
  }

  function open(u) {
    if (u) location.replace(u);
  }

  async function allow(minutes) {
    await browser.runtime.sendMessage({ action: 'allowSite', host: from, minutes });
    open(orig || `https://${from}`);
  }
</script>

<div class="clouds" aria-hidden="true"></div>

<main>
  <div class="sleeper-wrap" style="width:{pet.sleepW}px">
    <img class="sleeper" src={pet.sleep} alt="" />

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
    position: relative;
  }

  .clouds {
    position: fixed;
    top: 40px;
    left: 0;
    width: 100%;

    height: 50.4vw;
    z-index: -1;
    pointer-events: none;
    background: url('/scene/clouds.png') repeat-x;
    background-size: 140.62vw 46.872vw;
    image-rendering: pixelated;
    opacity: 0.92;
    animation: cloud-drift 233s linear infinite;
  }
  @keyframes cloud-drift {
    from { background-position-x: 0; }
    to   { background-position-x: -140.62vw; }
  }

  @media (prefers-reduced-motion: reduce) {
    .clouds { animation: none; }
  }

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

  .z {
    position: absolute;
    image-rendering: pixelated;
    filter: drop-shadow(0 0 5px rgba(190, 178, 240, 0.55));
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
    backdrop-filter: blur(5px);
    padding: 34px 30px 24px;
    text-align: center;
  }

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

  .thought.done { opacity: 0.55; }
  .thought.done .t-text { text-decoration: line-through; }
  .thought.done .t-dot { background: var(--ink-faint); }

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
