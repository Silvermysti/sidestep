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
  <div class="badge">Sidestep stepped in</div>

  <h1>You were heading to <span class="from">{from}</span></h1>
  <p class="sub">You're in a focus session. Here's what you actually wanted to get to.</p>

  {#if to}
    <button class="go" onclick={go}>
      <span class="go-label">{title || 'Open your focus link'}</span>
      <span class="go-url">{prettyUrl(to)}</span>
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
</main>

<style>
  main {
    width: 100%;
    max-width: 440px;
    text-align: center;
  }

  .badge {
    display: inline-block;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.3px;
    color: #7c9cff;
    background: rgba(124, 156, 255, 0.14);
    border-radius: 999px;
    padding: 5px 12px;
    margin-bottom: 20px;
  }

  h1 {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.25;
    margin: 0 0 10px;
  }
  .from { color: #7c9cff; }

  .sub {
    margin: 0 0 26px;
    color: #9aa0ab;
    font-size: 15px;
  }

  .go {
    width: 100%;
    border: 0;
    cursor: pointer;
    border-radius: 14px;
    padding: 16px 18px;
    background: #7c9cff;
    color: #15171c;
    display: flex;
    flex-direction: column;
    gap: 2px;
    transition: filter 0.15s, transform 0.05s;
  }
  .go:hover { filter: brightness(1.06); }
  .go:active { transform: translateY(1px); }
  .go-label { font-size: 16px; font-weight: 700; }
  .go-url {
    font-size: 13px;
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    border: 1px dashed #2d313b;
    border-radius: 14px;
    padding: 18px;
    color: #9aa0ab;
    font-size: 14px;
  }

  .foot {
    margin: 26px 0 0;
    color: #6c717c;
    font-size: 12.5px;
  }
</style>
