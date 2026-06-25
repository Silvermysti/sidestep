<script>
  import { onMount } from 'svelte';
  import { browser } from '#imports';
  import { settings, timer } from '@/lib/storage';
  import { durationMs, formatMs } from '@/lib/timer';

  // Local copies of the saved state. We read them from storage and keep them in
  // sync with `.watch()`, so the popup always reflects what the background did.
  let t = $state(null);
  let s = $state(null);
  // `now` ticks every quarter second so the countdown updates smoothly on screen.
  // (Display only — the real timing lives in `endsAt`, not here.)
  let now = $state(Date.now());

  onMount(() => {
    (async () => {
      t = await timer.getValue();
      s = await settings.getValue();
    })();

    const unwatchT = timer.watch((v) => (t = v));
    const unwatchS = settings.watch((v) => (s = v));
    const ticker = setInterval(() => (now = Date.now()), 250);

    return () => {
      unwatchT();
      unwatchS();
      clearInterval(ticker);
    };
  });

  // Derived display values. `$derived` recomputes automatically when t/s/now change.
  let remaining = $derived(t && s ? remainingFor(t, now) : 0);
  let total = $derived(t && s ? durationMs(t.mode, s) : 1);
  let progress = $derived(total > 0 ? Math.min(1, 1 - remaining / total) : 0);
  let isFocus = $derived(t?.mode === 'focus');

  function remainingFor(t, now) {
    if (t.status === 'running' && t.endsAt != null) return Math.max(0, t.endsAt - now);
    return t.remainingMs;
  }

  function send(action, extra = {}) {
    browser.runtime.sendMessage({ action, ...extra });
  }
</script>

<main class:focus={isFocus} class:break={!isFocus}>
  <header>
    <span class="brand">Sidestep</span>
    <span class="dot"></span>
    <span class="tag">stay on your own path</span>
  </header>

  {#if t && s}
    <div class="tabs" role="tablist">
      <button
        class="tab"
        class:active={isFocus}
        disabled={t.status !== 'idle'}
        onclick={() => send('setMode', { mode: 'focus' })}
      >Focus</button>
      <button
        class="tab"
        class:active={!isFocus}
        disabled={t.status !== 'idle'}
        onclick={() => send('setMode', { mode: 'break' })}
      >Break</button>
    </div>

    <div class="clock">
      <div class="time">{formatMs(remaining)}</div>
      <div class="state">
        {#if t.status === 'running'}{isFocus ? 'Focusing…' : 'On a break…'}
        {:else if t.status === 'paused'}Paused
        {:else}Ready{/if}
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
  {:else}
    <div class="clock"><div class="time">--:--</div></div>
  {/if}
</main>

<style>
  /* The accent colour changes with the mode: calm indigo for focus, green for break. */
  main {
    --accent: #7c9cff;
    --accent-soft: rgba(124, 156, 255, 0.16);
    padding: 18px 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  main.break {
    --accent: #6fcf97;
    --accent-soft: rgba(111, 207, 151, 0.16);
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .brand { font-weight: 700; letter-spacing: 0.2px; }
  .dot { width: 4px; height: 4px; border-radius: 50%; background: #565b66; }
  .tag { color: #8b909b; }

  .tabs {
    display: flex;
    gap: 4px;
    background: #20232b;
    padding: 4px;
    border-radius: 10px;
  }
  .tab {
    flex: 1;
    border: 0;
    border-radius: 7px;
    padding: 7px 0;
    font-size: 13px;
    font-weight: 600;
    color: #9aa0ab;
    background: transparent;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .tab.active { background: var(--accent-soft); color: var(--accent); }
  .tab:disabled { cursor: default; }

  .clock { text-align: center; }
  .time {
    font-variant-numeric: tabular-nums;
    font-size: 56px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 1px;
  }
  .state { margin-top: 6px; font-size: 12px; color: #8b909b; }

  .bar {
    height: 6px;
    border-radius: 999px;
    background: #20232b;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
    transition: width 0.25s linear;
  }

  .controls { display: flex; gap: 8px; }
  .controls button {
    flex: 1;
    border-radius: 9px;
    padding: 10px 0;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: filter 0.15s, opacity 0.15s;
  }
  .primary { background: var(--accent); color: #15171c; }
  .primary:hover { filter: brightness(1.08); }
  .ghost { background: transparent; color: #c7ccd5; border-color: #2d313b; }
  .ghost:hover:not(:disabled) { border-color: #424753; }
  .controls button:disabled { opacity: 0.4; cursor: default; }
</style>
