<script>
  import { onMount } from 'svelte';
  import { browser } from '#imports';
  import { settings, timer, lists } from '@/lib/storage';
  import { durationMs, formatMs } from '@/lib/timer';
  import { currentLinks, hostnameOf, linkTitle, linkUrl, normalizeUrl } from '@/lib/sites';

  // Local copies of saved state, kept in sync with `.watch()`.
  let t = $state(null);
  let s = $state(null);
  let l = $state(null);
  // `now` ticks every quarter second so the countdown updates smoothly (display
  // only — the real timing lives in `endsAt`).
  let now = $state(Date.now());

  // Draft text for the editable inputs.
  let topicDraft = $state('');
  let linkDraft = $state('');
  let titleDraft = $state('');
  let siteDraft = $state('');

  onMount(() => {
    (async () => {
      t = await timer.getValue();
      s = await settings.getValue();
      l = await lists.getValue();
    })();

    const unwatchT = timer.watch((v) => (t = v));
    const unwatchS = settings.watch((v) => (s = v));
    const unwatchL = lists.watch((v) => (l = v));
    const ticker = setInterval(() => (now = Date.now()), 250);

    return () => {
      unwatchT();
      unwatchS();
      unwatchL();
      clearInterval(ticker);
    };
  });

  // Derived display values — recompute automatically when their inputs change.
  let remaining = $derived(t && s ? remainingFor(t, now) : 0);
  let total = $derived(t && s ? durationMs(t.mode, s) : 1);
  let progress = $derived(total > 0 ? Math.min(1, 1 - remaining / total) : 0);
  let isFocus = $derived(t?.mode === 'focus');
  let topic = $derived(l?.currentTopic ?? 'General');
  let links = $derived(l ? currentLinks(l) : []);
  let sites = $derived(s?.distractingSites ?? []);

  function remainingFor(t, now) {
    if (t.status === 'running' && t.endsAt != null) return Math.max(0, t.endsAt - now);
    return t.remainingMs;
  }

  function send(action, extra = {}) {
    browser.runtime.sendMessage({ action, ...extra });
  }

  function prettyUrl(u) {
    try {
      const url = new URL(u);
      const tail = url.pathname.replace(/\/$/, '') + url.search; // keep ?v=… etc.
      return url.hostname.replace(/^www\./, '') + tail;
    } catch {
      return u;
    }
  }

  // --- Topic ("What are you exploring?") ---
  async function setTopic() {
    const name = topicDraft.trim() || 'General';
    const topics = { ...l.topics };
    if (!topics[name]) topics[name] = [];
    await lists.setValue({ ...l, currentTopic: name, topics, cursor: 0 });
    topicDraft = '';
  }

  // --- Useful links in the current topic --- (each saved as { url, title }) ---
  async function addLink(rawUrl, rawTitle = '') {
    const url = normalizeUrl(rawUrl);
    if (!url) return;
    const title = (rawTitle || '').trim();
    const existing = l.topics[topic] ?? [];
    if (existing.some((x) => linkUrl(x) === url)) { linkDraft = ''; titleDraft = ''; return; }
    await lists.setValue({ ...l, topics: { ...l.topics, [topic]: [...existing, { url, title }] } });
    linkDraft = '';
    titleDraft = '';
  }

  async function removeLink(i) {
    const existing = l.topics[topic] ?? [];
    await lists.setValue({
      ...l,
      topics: { ...l.topics, [topic]: existing.filter((_, idx) => idx !== i) },
    });
  }

  // Grab the page in the active tab and save it, using the page's own title.
  async function saveCurrentPage() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) await addLink(tab.url, tab.title ?? '');
  }

  // --- Sites to redirect (the user's own block-list) ---
  async function addSite() {
    const host = hostnameOf(normalizeUrl(siteDraft) ?? '');
    if (!host || sites.includes(host)) { siteDraft = ''; return; }
    await settings.setValue({ ...s, distractingSites: [...sites, host] });
    siteDraft = '';
  }

  async function removeSite(host) {
    await settings.setValue({ ...s, distractingSites: sites.filter((x) => x !== host) });
  }
</script>

<main class:focus={isFocus} class:break={!isFocus}>
  <div class="brand-wrap">
    <svg class="sprout" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12 22c-.55 0-1-.45-1-1v-6.2c0-.55.45-1 1-1s1 .45 1 1V21c0 .55-.45 1-1 1Z"/>
      <path d="M10.8 14.2c-3.4 0-6.2-2.8-6.2-6.2 0-.6.5-1 1-1 3.4 0 6.2 2.8 6.2 6.2 0 .6-.5 1-1 1Z"/>
      <path d="M13.2 12.2c0-3.4 2.8-6.2 6.2-6.2.6 0 1 .5 1 1 0 3.4-2.8 6.2-6.2 6.2-.6 0-1-.5-1-1Z"/>
    </svg>
    <span class="brand">Sidestep</span>
    <span class="tag">stay on your own path</span>
  </div>

  {#if t && s && l}
    <section class="card timer-card">
      <div class="seg" role="tablist">
        <button
          class:active={isFocus}
          disabled={t.status !== 'idle'}
          onclick={() => send('setMode', { mode: 'focus' })}
        >Focus</button>
        <button
          class:active={!isFocus}
          disabled={t.status !== 'idle'}
          onclick={() => send('setMode', { mode: 'break' })}
        >Break</button>
      </div>

      <div class="clock">
        <div class="time">{formatMs(remaining)}</div>
        <div class="status">
          {#if t.status === 'running'}{isFocus ? 'Focusing' : 'On a break'}
          {:else if t.status === 'paused'}Paused
          {:else}Ready when you are{/if}
        </div>
      </div>

      <div class="bar"><div class="fill" style="width: {progress * 100}%"></div></div>

      <div class="controls">
        {#if t.status === 'idle'}
          <button class="primary" onclick={() => send('start')}>Start</button>
        {:else if t.status === 'running'}
          <button class="primary" onclick={() => send('pause')}>Pause</button>
        {:else}
          <button class="primary" onclick={() => send('resume')}>Resume</button>
        {/if}
        <button class="ghost" disabled={t.status === 'idle'} onclick={() => send('reset')}>Reset</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-label">Exploring</span>
        <span class="topic-pill">{topic}</span>
      </div>

      <div class="row">
        <input
          class="inp"
          placeholder="Change topic…"
          bind:value={topicDraft}
          onkeydown={(e) => e.key === 'Enter' && setTopic()}
        />
        <button class="mini" onclick={setTopic}>Set</button>
      </div>

      <div class="row">
        <input
          class="inp"
          placeholder="Paste a useful link"
          bind:value={linkDraft}
          onkeydown={(e) => e.key === 'Enter' && addLink(linkDraft, titleDraft)}
        />
        <button class="mini" onclick={() => addLink(linkDraft, titleDraft)}>Add</button>
      </div>
      <input
        class="inp full"
        placeholder="Title (optional)"
        bind:value={titleDraft}
        onkeydown={(e) => e.key === 'Enter' && addLink(linkDraft, titleDraft)}
      />

      <button class="soft-btn" onclick={saveCurrentPage}>
        <span class="plus">＋</span> Save this page to “{topic}”
      </button>

      {#if links.length}
        <ul class="list">
          {#each links as link, i}
            <li>
              <div class="link-main">
                {#if linkTitle(link)}
                  <span class="link-title">{linkTitle(link)}</span>
                {/if}
                <span class="link-url" title={linkUrl(link)}>{prettyUrl(linkUrl(link))}</span>
              </div>
              <button class="x" onclick={() => removeLink(i)} aria-label="Remove link">×</button>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="empty">No links yet. Add a few you actually want to get to.</div>
      {/if}
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-label">Sites to redirect</span>
      </div>
      <div class="row">
        <input
          class="inp"
          placeholder="e.g. youtube.com"
          bind:value={siteDraft}
          onkeydown={(e) => e.key === 'Enter' && addSite()}
        />
        <button class="mini" onclick={addSite}>Add</button>
      </div>
      {#if sites.length}
        <ul class="chips">
          {#each sites as host}
            <li class="chip">
              {host}
              <button class="x" onclick={() => removeSite(host)} aria-label="Remove site">×</button>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="empty">No sites yet — add the ones that pull you away.</div>
      {/if}
    </section>
  {:else}
    <section class="card timer-card">
      <div class="clock"><div class="time">--:--</div></div>
    </section>
  {/if}
</main>

<style>
  main {
    padding: 14px 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  /* Focus = sage (default in :root). Break = warm honey. */
  main.break {
    --accent: #D9A35E;
    --accent-deep: #9C6A2A;
    --accent-tint: #F7EDD9;
  }

  /* Header */
  .brand-wrap { display: flex; align-items: center; gap: 7px; padding: 2px 4px; }
  .sprout { color: var(--accent); flex: none; transition: color 0.3s ease; }
  .brand {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-weight: 600;
    font-size: 20px;
    letter-spacing: 0.2px;
    color: var(--ink);
  }
  .tag { margin-left: auto; font-size: 11px; color: var(--ink-soft); }

  /* Cards */
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow);
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .timer-card { gap: 14px; padding-bottom: 17px; }

  .card-head { display: flex; align-items: center; gap: 8px; }
  .card-label { font-size: 12px; font-weight: 700; color: var(--ink-soft); }
  .topic-pill {
    margin-left: auto;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--accent-deep);
    background: var(--accent-tint);
    padding: 3px 10px;
    border-radius: 999px;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Segmented Focus/Break control */
  .seg {
    display: flex;
    gap: 4px;
    background: var(--surface-2);
    padding: 4px;
    border-radius: var(--r);
  }
  .seg button {
    flex: 1;
    border: 0;
    border-radius: 10px;
    padding: 8px 0;
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--ink-soft);
    background: transparent;
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  }
  .seg button.active { background: var(--surface); color: var(--accent-deep); box-shadow: var(--shadow-sm); }
  .seg button:disabled { cursor: default; }

  /* Clock */
  .clock { text-align: center; }
  .time {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    font-size: 58px;
    line-height: 1;
    letter-spacing: 1px;
    color: var(--ink);
  }
  .status { margin-top: 7px; font-size: 12px; font-weight: 600; color: var(--ink-soft); }

  /* Progress */
  .bar { height: 8px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
  .fill {
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
    transition: width 0.3s ease, background 0.3s ease;
  }

  /* Controls */
  .controls { display: flex; gap: 9px; }
  .controls button {
    flex: 1;
    border-radius: var(--r);
    padding: 11px 0;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid transparent;
    transition: filter 0.15s ease, transform 0.05s ease, background 0.15s ease;
  }
  .primary {
    background: var(--accent);
    color: #fff;
    box-shadow: 0 5px 14px color-mix(in srgb, var(--accent) 38%, transparent);
  }
  .primary:hover { filter: brightness(1.04); }
  .primary:active { transform: translateY(1px); }
  .ghost { background: var(--surface); color: var(--ink-soft); border-color: var(--line); }
  .ghost:hover:not(:disabled) { background: var(--surface-2); }
  .controls button:disabled { opacity: 0.45; cursor: default; box-shadow: none; }

  /* Inputs */
  .row { display: flex; gap: 7px; }
  .inp {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 13px;
    color: var(--ink);
    background: var(--surface-2);
    border: 1.5px solid transparent;
    border-radius: 11px;
    padding: 9px 12px;
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .inp:focus {
    outline: none;
    background: var(--surface);
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-tint);
  }
  .inp::placeholder { color: var(--ink-faint); }
  .full { width: 100%; }

  .mini {
    border: 0;
    border-radius: 11px;
    padding: 0 15px;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    background: var(--accent-tint);
    color: var(--accent-deep);
    transition: filter 0.15s ease;
  }
  .mini:hover { filter: brightness(0.97); }

  .soft-btn {
    border: 0;
    border-radius: 12px;
    padding: 10px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    background: var(--accent-tint);
    color: var(--accent-deep);
    transition: filter 0.15s ease;
  }
  .soft-btn:hover { filter: brightness(0.97); }
  .plus { font-weight: 700; margin-right: 2px; }

  /* Link list */
  .list { list-style: none; margin: 2px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
  .list li {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-2);
    border-radius: 11px;
    padding: 8px 11px;
  }
  .link-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .link-title {
    font-size: 12.5px; font-weight: 700; color: var(--ink);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .link-url {
    font-size: 11.5px; color: var(--ink-soft);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* Site chips */
  .chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: flex; align-items: center; gap: 3px;
    background: var(--surface-2);
    border-radius: 999px;
    padding: 5px 7px 5px 12px;
    font-size: 12.5px; font-weight: 600; color: var(--ink);
  }

  .x {
    border: 0; background: transparent; color: var(--ink-faint);
    cursor: pointer; font-size: 17px; line-height: 1; padding: 0 3px;
    transition: color 0.15s ease;
  }
  .x:hover { color: #cf6b5e; }

  .empty { font-size: 12.5px; color: var(--ink-faint); padding: 2px 0; }
</style>
