<script>
  // This page is what a redirected tab shows. The background script sends us two
  // bits of information in the URL: `from` (the site we stepped past) and `to`
  // (the user's own useful link to offer instead). We read them straight from
  // the address bar — no storage needed here.
  const params = new URLSearchParams(location.search);
  const from = params.get('from') ?? 'that site';
  const to = params.get('to');
  const title = params.get('title');

  function prettyUrl(u) {
    try {
      const url = new URL(u);
      const tail = url.pathname.replace(/\/$/, '') + url.search;
      return url.hostname.replace(/^www\./, '') + tail;
    } catch {
      return u;
    }
  }

  function go() {
    if (to) location.replace(to); // replace() so Back doesn't loop us here
  }
</script>

<main>
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

    {#if to}
      <button class="go" onclick={go}>
        <span class="go-label">{title || 'Open your focus link'}</span>
        <span class="go-url">{prettyUrl(to)}</span>
        <span class="go-arrow" aria-hidden="true">→</span>
      </button>
    {:else}
      <div class="empty">
        You haven't saved any focus links yet. Open Sidestep and add a few links to
        the topic you're exploring — then they'll appear here instead of the
        distraction.
      </div>
    {/if}

    <p class="foot">
      Need {from} for studying? Pause the timer (or the per-site allowance, coming
      soon) from the Sidestep popup.
    </p>
  </div>
</main>

<style>
  main {
    width: 100%;
    max-width: 460px;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow);
    padding: 30px 30px 24px;
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
    margin: 0 0 24px;
    color: var(--ink-soft);
    font-size: 15px;
  }

  .go {
    width: 100%;
    border: 0;
    cursor: pointer;
    border-radius: var(--r);
    padding: 16px 20px;
    background: var(--accent);
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 3px;
    position: relative;
    box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 38%, transparent);
    transition: filter 0.15s ease, transform 0.05s ease;
  }
  .go:hover { filter: brightness(1.04); }
  .go:active { transform: translateY(1px); }
  .go-label {
    font-size: 16px; font-weight: 800;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .go-url {
    font-size: 13px;
    opacity: 0.85;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .go-arrow {
    position: absolute;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 22px;
    opacity: 0.9;
  }

  .empty {
    border: 1.5px dashed var(--line);
    border-radius: var(--r);
    padding: 18px;
    color: var(--ink-soft);
    font-size: 14px;
    text-align: left;
    background: var(--surface-2);
  }

  .foot {
    margin: 22px 0 0;
    color: var(--ink-faint);
    font-size: 12.5px;
  }
</style>
