<script>
  // This page is what a redirected tab shows. The background script tells us in
  // the URL which site we stepped past (`from`) and which single link it served
  // next (`to`/`title`, shown as a highlighted suggestion). For the full menu we
  // read the saved lists straight from storage and group them by site, then topic.
  import { onMount } from 'svelte';
  import { browser } from '#imports';
  import { lists } from '@/lib/storage';
  import { parkThought } from '@/lib/parking';
  import { groupLinksBySite, linkTitle, linkUrl } from '@/lib/sites';

  const params = new URLSearchParams(location.search);
  const from = params.get('from') ?? 'that site';
  const orig = params.get('orig'); // the exact page the user was heading to
  const to = params.get('to');
  const title = params.get('title');

  let groups = $state([]);
  let loaded = $state(false);
  // The thought parking lot: whatever pulled them here, jotted down so it stops
  // nagging. `parked` briefly confirms the save.
  let parkDraft = $state('');
  let parked = $state(false);

  onMount(async () => {
    const l = await lists.getValue();
    groups = groupLinksBySite(l, from); // site you reached for floats to front
    loaded = true;
  });

  // Save a stray thought to the parking lot, then clear the box and flash a note.
  async function park() {
    if (!(await parkThought(parkDraft))) return; // empty box — nothing to save
    parkDraft = '';
    parked = true;
    setTimeout(() => (parked = false), 2600);
  }

  function prettyUrl(u) {
    try {
      const url = new URL(u);
      const tail = url.pathname.replace(/\/$/, '') + url.search;
      return url.hostname.replace(/^www\./, '') + tail;
    } catch {
      return u;
    }
  }

  function open(u) {
    if (u) location.replace(u); // replace() so Back doesn't loop us here
  }

  // Freedom window: grant THIS site a pass, then go to the page they wanted.
  // `minutes` is a number or the string 'forever'.
  async function allow(minutes) {
    await browser.runtime.sendMessage({ action: 'allowSite', host: from, minutes });
    open(orig || to || `https://${from}`);
  }
</script>

<main>
  <div class="sleeper-wrap">
    <img class="sleeper" src="/scene/sleeping.png" alt="" />
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
    <p class="sub">You're in a focus session. Here's what you actually wanted to get to.</p>

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

    {#if to}
      <button class="go" onclick={() => open(to)}>
        <span class="go-tag">Next up</span>
        <span class="go-label">{title || prettyUrl(to)}</span>
        <span class="go-url">{prettyUrl(to)}</span>
        <span class="go-arrow" aria-hidden="true">→</span>
      </button>
    {/if}

    {#if loaded}
      {#if groups.length}
        <div class="menu">
          {#each groups as g}
            <section class="site">
              <h2 class="site-name">{g.label}</h2>
              {#each g.topics as tp}
                <div class="topic-group">
                  <div class="topic-name">{tp.topic}</div>
                  <ul>
                    {#each tp.links as link}
                      <li>
                        <button class="link" onclick={() => open(linkUrl(link))}>
                          <span class="l-title">{linkTitle(link) || prettyUrl(linkUrl(link))}</span>
                          {#if linkTitle(link)}
                            <span class="l-url">{prettyUrl(linkUrl(link))}</span>
                          {/if}
                        </button>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/each}
            </section>
          {/each}
        </div>
      {:else}
        <div class="empty">
          You haven't saved any focus links yet. Open Sidestep and add a few links to
          the topic you're exploring — then they'll appear here instead of the
          distraction.
        </div>
      {/if}
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

  /* The sleeping bunny lies on top of the card's front edge — most of it above
     the card, its body dipping onto the top so it reads as resting there. */
  .sleeper-wrap {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translate(-50%, -80%);
    width: 236px;
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

  /* Highlighted "next up" suggestion */
  .go {
    width: 100%;
    border: 0;
    cursor: pointer;
    border-radius: var(--r);
    padding: 15px 20px;
    background: var(--accent);
    color: #211C3D; /* dark ink reads best on the light periwinkle accent */
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 2px;
    position: relative;
    box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 38%, transparent);
    transition: filter 0.15s ease, transform 0.05s ease;
  }
  .go:hover { filter: brightness(1.04); }
  .go:active { transform: translateY(1px); }
  .go-tag { font-size: 10.5px; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase; opacity: 0.85; }
  .go-label {
    font-size: 16px; font-weight: 800;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .go-url {
    font-size: 13px; opacity: 0.85;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .go-arrow { position: absolute; right: 20px; top: 50%; transform: translateY(-50%); font-size: 22px; opacity: 0.9; }

  /* The grouped menu */
  .menu { margin-top: 22px; text-align: left; display: flex; flex-direction: column; gap: 18px; }
  .site { display: flex; flex-direction: column; gap: 8px; }
  .site-name {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: var(--accent-deep);
    margin: 0;
    padding-bottom: 6px;
    border-bottom: 1.5px solid var(--line);
  }
  .topic-group { display: flex; flex-direction: column; gap: 5px; }
  .topic-name {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin: 4px 0 1px;
  }
  .topic-group ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }

  .link {
    width: 100%;
    border: 0;
    cursor: pointer;
    border-radius: 11px;
    padding: 10px 13px;
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 1px;
    transition: background 0.15s ease, transform 0.05s ease;
  }
  .link:hover { background: var(--accent-tint); }
  .link:active { transform: translateY(1px); }
  .l-title {
    font-size: 13.5px; font-weight: 700; color: var(--ink);
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .l-url {
    font-size: 11.5px; color: var(--ink-soft);
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
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
