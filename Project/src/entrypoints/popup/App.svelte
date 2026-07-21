<script>
  import { onMount, tick } from 'svelte';
  import { browser } from '#imports';
  import { settings, timer, lists, allowances, parkingLot, progress as progressStore } from '@/lib/storage';
  import { parkThought } from '@/lib/parking';
  import { durationMs, formatMs, totalCycles } from '@/lib/timer';
  import { COMPANIONS, COMPANION_KEYS, DEFAULT_COMPANION, isUnlocked } from '@/lib/companions';
  import { hostnameOf, linkTitle, linkUrl, normalizeUrl, siteBuckets, siteKeyOf, siteLabel, siteToBlock } from '@/lib/sites';

  // Which top tab is showing. The popup is now split into pages instead of one
  // long scroll; this single piece of state decides which page is visible.
  let tab = $state('focus');

  // Local copies of saved state, kept in sync with `.watch()`.
  let t = $state(null);
  let s = $state(null);
  let l = $state(null);
  let al = $state(null); // active freedom windows: { site: expiry }
  let prog = $state(null); // gamification: { xp } — drives the XP bar
  let pl = $state([]); // parked thoughts: [{ text, savedAt, done }]
  let parkDraft = $state(''); // the "jot a thought" box on the Focus tab
  let adding = $state(false); // is that box open? kept shut so the list stays easy to read
  let parkInput; // the <input> element, so we can focus it the moment it opens
  // Which thought is asking "Remove this?" right now. We key on `savedAt` rather
  // than the row number, because parking a new thought shifts every row down —
  // an index would suddenly point at the wrong thought.
  let confirmAt = $state(null);
  // `now` ticks every quarter second so the countdown updates smoothly (display
  // only — the real timing lives in `endsAt`).
  let now = $state(Date.now());

  // Draft text for the editable inputs.
  let linkDraft = $state('');
  let titleDraft = $state('');
  let siteDraft = $state('');

  onMount(() => {
    (async () => {
      t = await timer.getValue();
      s = await settings.getValue();
      l = await lists.getValue();
      al = await allowances.getValue();
      prog = await progressStore.getValue();
      pl = await parkingLot.getValue();
    })();

    // Warm the browser cache so no run cycle flickers on its first loop. We warm
    // every companion's frames, so switching companions later is instant too.
    for (const c of Object.values(COMPANIONS)) {
      for (const src of [...c.run, c.sit]) { const im = new Image(); im.src = src; }
    }

    const unwatchT = timer.watch((v) => (t = v));
    const unwatchS = settings.watch((v) => (s = v));
    const unwatchL = lists.watch((v) => (l = v));
    const unwatchA = allowances.watch((v) => (al = v));
    const unwatchProg = progressStore.watch((v) => (prog = v));
    const unwatchP = parkingLot.watch((v) => (pl = v));
    const ticker = setInterval(() => (now = Date.now()), 250);

    return () => {
      unwatchT();
      unwatchS();
      unwatchL();
      unwatchA();
      unwatchProg();
      unwatchP();
      clearInterval(ticker);
    };
  });

  // Parked thoughts — jotted here, or on the redirect page when a distraction is
  // intercepted. Ticking one off marks it done: a tiny, satisfying "handled it".
  // The ＋ toggles the jot box. It stays shut by default: an always-open input
  // adds clutter to a list you mostly want to skim. `tick()` waits for Svelte to
  // actually put the <input> on the page before we try to focus it.
  async function toggleAdd() {
    adding = !adding;
    if (adding) {
      await tick();
      parkInput?.focus();
    } else {
      parkDraft = ''; // closing discards whatever was half-typed
    }
  }

  // Save, then close the box again so we're back to a clean, readable list.
  async function addThought() {
    if (!(await parkThought(parkDraft))) return; // empty box — leave it open
    parkDraft = '';
    adding = false;
  }
  async function toggleParked(i) {
    await parkingLot.setValue(pl.map((p, idx) => (idx === i ? { ...p, done: !p.done } : p)));
  }

  // Removing asks first: the row swaps to "Remove this thought? Yes / No", so a
  // stray click never silently loses something you meant to come back to.
  function askRemove(savedAt) {
    confirmAt = savedAt;
  }
  function cancelRemove() {
    confirmAt = null;
  }
  async function removeParked(i) {
    await parkingLot.setValue(pl.filter((_, idx) => idx !== i));
    confirmAt = null;
  }

  // Derived display values — recompute automatically when their inputs change.
  let remaining = $derived(t && s ? remainingFor(t, now) : 0);
  let total = $derived(t && s ? durationMs(t.mode, s) : 1);
  let progress = $derived(total > 0 ? Math.min(1, 1 - remaining / total) : 0);
  let isFocus = $derived(t?.mode === 'focus');

  // --- Companion ---
  // The run cycle plays only while a focus session is actually running; the
  // companion sits still when idle, paused, or on a break (it's a "body-double"
  // — it works alongside you, and rests when you rest). ~119ms/frame ≈ 8fps.
  //
  // Which pet is on screen comes from the saved settings (chosen on the Settings
  // tab). The sprite sets themselves live in lib/companions.js, shared with the
  // block page. `?? DEFAULT_COMPANION` covers older saved settings that predate
  // the choice.
  let companion = $derived(s?.companion ?? DEFAULT_COMPANION);
  let sprite = $derived(COMPANIONS[companion]);

  // --- Scene themes ---
  // Each theme reskins the habitat: a background image and a scrolling grass
  // strip. `tile` is that strip's exact pixel width, fed to the grass so the loop
  // lines up; `dot` is the colour of its picker circle.
  const THEMES = {
    meadow: { label: 'Meadow', bg: 'url(/scene/background.png)', grass: '/scene/grass.png', tile: 1571, dot: '#7fb43f' },
    autumn: { label: 'Autumn', bg: 'url(/scene/autumn-bg.png)', grass: '/scene/autumn-grass.png', tile: 2172, dot: '#d5852f' },
    rainy: { label: 'Rainy', bg: 'url(/scene/rainy-bg.png)', grass: '/scene/rainy-grass.png', tile: 1807, dot: '#6d88a8', zoom: '150%' },
  };
  const THEME_KEYS = Object.keys(THEMES);
  let theme = $derived(s?.theme && THEMES[s.theme] ? s.theme : 'meadow');
  let scene = $derived(THEMES[theme]);
  function pickTheme(key) {
    if (key === theme) return;
    saveSettings({ theme: key });
  }

  // --- XP meter ---
  // XP is measured in focus minutes, owned by the background (lib/storage
  // `progress`) — here we only display it. It only ever grows (earned by
  // focusing), so a companion stays unlocked once earned.
  let xp = $derived(prog?.xp ?? 0);
  // The next pet still locked at this XP (companions are listed in ascending
  // unlock order), and the XP already banked toward it, so the XP bar fills from
  // one milestone to the next rather than from zero every time.
  let nextLock = $derived(COMPANION_KEYS.map((k) => COMPANIONS[k]).find((c) => xp < c.unlockAt) ?? null);
  let prevUnlock = $derived(
    COMPANION_KEYS.map((k) => COMPANIONS[k].unlockAt).filter((u) => u <= xp).reduce((a, b) => Math.max(a, b), 0)
  );
  let xpFill = $derived(nextLock ? Math.min(1, (xp - prevUnlock) / (nextLock.unlockAt - prevUnlock)) : 1);
  // Left label leads with what the XP is buying; right value is the running count.
  let xpLead = $derived(
    nextLock ? `XP · ${nextLock.label} in ${Math.max(0, Math.ceil(nextLock.unlockAt - xp))}m` : 'XP · all unlocked'
  );
  let xpValue = $derived(nextLock ? `${Math.floor(xp)} / ${nextLock.unlockAt}` : `${Math.floor(xp)} XP`);

  // Grass scroll duration. The CSS baseline is one tile per 9.2s; a companion can
  // scale that with `grassSpeed` (1 = normal, <1 = slower). We feed the result in
  // as an inline animation-duration, which overrides the CSS shorthand's 9.2s.
  const BASE_GRASS_S = 9.2;
  let grassSeconds = $derived((BASE_GRASS_S / (sprite.grassSpeed ?? 1)).toFixed(3));

  let bunnyFrame = $state(0);
  let bunnyRunning = $derived(t?.status === 'running' && isFocus);
  // The grass scroll stays *attached* through both running and paused so that
  // pausing freezes it in place (play-state) instead of snapping back to start.
  let bunnyActive = $derived((t?.status === 'running' || t?.status === 'paused') && isFocus);
  // Start/stop the frame-swap loop whenever the running state flips. Returning
  // the cleanup clears the old interval before the next run — no leaked timers.
  // Reading `sprite` here means the loop restarts (at the right speed and length)
  // if the companion ever changes mid-run.
  $effect(() => {
    if (!bunnyRunning) { bunnyFrame = 0; return; }
    const frames = sprite.run.length;
    const id = setInterval(() => { bunnyFrame = (bunnyFrame + 1) % frames; }, sprite.frameMs);
    return () => clearInterval(id);
  });

  // Saved links, in per-site buckets: [{ key, label, links }]. Nothing to choose
  // when saving — a link's bucket comes from its own URL.
  let buckets = $derived(l ? siteBuckets(l) : []);
  let linkCount = $derived(buckets.reduce((n, b) => n + b.links.length, 0));
  let sites = $derived(s?.distractingSites ?? []);
  // Freedom windows that are still active right now (recomputes as `now` ticks,
  // so an expired one disappears on its own).
  let allowed = $derived(
    al
      ? Object.entries(al)
          .filter(([, exp]) => exp === 'forever' || (typeof exp === 'number' && exp > now))
          .map(([site, exp]) => ({ site, exp }))
      : []
  );

  function allowanceLabel(exp) {
    if (exp === 'forever') return 'free · no time limit';
    const mins = Math.max(0, Math.ceil((exp - now) / 60000));
    return `free for ${mins} more min`;
  }

  function turnOff(site) {
    send('revokeSite', { host: site });
  }

  function remainingFor(t, now) {
    if (t.status === 'running' && t.endsAt != null) return Math.max(0, t.endsAt - now);
    return t.remainingMs;
  }

  // The moment our countdown reaches zero, ask the background to do the handover
  // (focus -> break -> next round). The background has its own alarms for this and
  // works fine with the popup shut; this just means that when you ARE watching, the
  // switch happens the instant the clock hits 00:00 instead of whenever Chrome
  // gets round to waking it. `syncing` stops us asking over and over.
  let syncing = false;
  $effect(() => {
    if (!t || t.status !== 'running' || remaining > 0 || syncing) return;
    syncing = true;
    browser.runtime.sendMessage({ action: 'sync' }).finally(() => {
      setTimeout(() => (syncing = false), 1500);
    });
  });

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

  // --- Useful links --- (each saved as { url, title }, filed under its site) ---
  //
  // The site a link belongs to is read off its own URL, so there is no folder to
  // pick: paste a YouTube link and it joins the YouTube bucket, which is exactly
  // the bucket we serve from when YouTube is the thing pulling at you.
  async function addLink(rawUrl, rawTitle = '') {
    const url = normalizeUrl(rawUrl);
    const key = siteKeyOf(url);
    if (!url || !key) return;
    const title = (rawTitle || '').trim();

    const existing = l.sites?.[key] ?? [];
    if (existing.some((x) => linkUrl(x) === url)) { linkDraft = ''; titleDraft = ''; return; }

    await lists.setValue({
      ...l,
      sites: { ...(l.sites ?? {}), [key]: [...existing, { url, title }] },
    });
    linkDraft = '';
    titleDraft = '';
  }

  // Drop one link from its bucket. An emptied bucket is removed entirely, so the
  // popup doesn't keep showing a site heading with nothing under it.
  async function removeLink(key, i) {
    const rest = (l.sites?.[key] ?? []).filter((_, idx) => idx !== i);
    const nextSites = { ...(l.sites ?? {}) };
    if (rest.length) nextSites[key] = rest;
    else delete nextSites[key];
    await lists.setValue({ ...l, sites: nextSites });
  }

  // Grab the page in the active tab and save it, using the page's own title.
  async function saveCurrentPage() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) await addLink(tab.url, tab.title ?? '');
  }

  // The site the pasted link would be filed under, shown live as a hint so it's
  // obvious where it's about to land.
  let draftSite = $derived(linkDraft ? siteKeyOf(normalizeUrl(linkDraft)) : null);

  // Save a change to settings. `s` is a Svelte reactive value, which means its
  // nested block-list array stays wrapped in a reactive proxy (a stand-in object)
  // even after we spread it. Handing that proxy to storage can save the block
  // list as something that is no longer a plain array — and the blocker ignores a
  // list that isn't a real array, so blocking would silently stop. $state.snapshot
  // unwraps the proxy back into plain data first, so what we store is always the
  // real thing. Every settings write goes through here.
  function saveSettings(patch) {
    return settings.setValue($state.snapshot({ ...s, ...patch }));
  }

  // --- Sites to redirect (the user's own block-list) ---
  async function addSite() {
    const host = hostnameOf(normalizeUrl(siteDraft) ?? '');
    if (!host || sites.includes(host)) { siteDraft = ''; return; }
    await saveSettings({ distractingSites: [...sites, host] });
    siteDraft = '';
  }

  async function removeSite(host) {
    await saveSettings({ distractingSites: sites.filter((x) => x !== host) });
  }

  // Block whatever site the active tab is on. We drop the path/query (so it's the
  // site, not one page) and strip only www./m./mobile. — keeping the real
  // subdomain, so gemini.google.com blocks just that, not all of google. The new
  // chip appears immediately so the user can see (and edit/remove) what got added.
  async function blockCurrentSite() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const host = siteToBlock(hostnameOf(tab?.url ?? '') ?? '');
    if (!host || sites.includes(host)) return;
    await saveSettings({ distractingSites: [...sites, host] });
  }

  // --- Settings: session lengths ---
  // The lengths you can pick, as fixed presets rather than "add 5 and clamp".
  // Clamping produced odd values: drop below 1 and it pinned to 1, so every step
  // after that was 6, 11, 16… These lists also let the short end be finer than
  // the long end, which a single step size can't do. 1 min is kept so a session
  // can be demoed (and tested) end to end in a few seconds.
  const FOCUS_STEPS = [1, 5, 10, 15, 20, 25, 30, 45, 60, 90];
  const BREAK_STEPS = [1, 3, 5, 10, 15, 20, 30];
  // How many rounds of focus+break to run. 'continuous' sits at the end of the
  // list, so pressing + past the largest number means "just keep going".
  const CYCLE_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 'continuous'];

  // Move one place along the list. `dir` is -1 (shorter) or +1 (longer). We find
  // where the saved value sits — snapping to the nearest preset if an old save
  // holds something off-list, like 11 — then step from there and stop at the ends.
  async function stepMinutes(field, dir) {
    const steps = field === 'focusMinutes' ? FOCUS_STEPS : BREAK_STEPS;
    const current = s[field];
    let nearest = 0;
    for (let i = 1; i < steps.length; i++) {
      if (Math.abs(steps[i] - current) < Math.abs(steps[nearest] - current)) nearest = i;
    }
    // If we're already exactly on a preset, move off it. If we snapped from an
    // off-list value, land on the snapped preset first rather than skipping past it.
    const onPreset = steps[nearest] === current;
    const next = onPreset ? nearest + dir : nearest;
    const i = Math.max(0, Math.min(steps.length - 1, next));

    await saveSettings({ [field]: steps[i] });
    // Sitting idle? Reset so the clock shows the new length straight away.
    if (t.status === 'idle') send('reset');
  }

  // Rounds work the same way, but the list ends in 'continuous' rather than a
  // number, so it needs its own small stepper: find where we are, move one place.
  async function stepCycles(dir) {
    const at = CYCLE_STEPS.indexOf(s.cycles);
    // An off-list value (or a missing one) snaps to the default of 4 rounds.
    const from = at === -1 ? CYCLE_STEPS.indexOf(4) : at;
    const i = Math.max(0, Math.min(CYCLE_STEPS.length - 1, at === -1 ? from : from + dir));
    await saveSettings({ cycles: CYCLE_STEPS[i] });
  }

  // Pick which pet keeps you company. Saved to settings so the habitat here and
  // the block page both follow it. Changing it takes effect right away.
  async function pickCompanion(key) {
    if (key === companion) return;
    if (!isUnlocked(key, xp)) return; // still locked — earn the XP first
    await saveSettings({ companion: key });
  }

  let cycles = $derived(s ? s.cycles : 4);
  let cycleLabel = $derived(cycles === 'continuous' ? '∞' : String(cycles));
  // "Round 2 of 4" under the clock, so a run never feels open-ended. Hidden when
  // idle — there's no round in progress to report.
  let roundLabel = $derived(
    !t || !s || t.status === 'idle'
      ? ''
      : cycles === 'continuous'
        ? `Round ${t.cycle ?? 1}`
        : `Round ${t.cycle ?? 1} of ${totalCycles(s)}`
  );

  // Grey out a button once you're at the end of its list, so it's clear there's
  // nothing further that way.
  let cyclesAtMin = $derived(s ? s.cycles === CYCLE_STEPS[0] : false);
  let cyclesAtMax = $derived(s ? s.cycles === CYCLE_STEPS[CYCLE_STEPS.length - 1] : false);
  let focusAtMin = $derived(s ? s.focusMinutes <= FOCUS_STEPS[0] : false);
  let focusAtMax = $derived(s ? s.focusMinutes >= FOCUS_STEPS[FOCUS_STEPS.length - 1] : false);
  let breakAtMin = $derived(s ? s.breakMinutes <= BREAK_STEPS[0] : false);
  let breakAtMax = $derived(s ? s.breakMinutes >= BREAK_STEPS[BREAK_STEPS.length - 1] : false);
</script>

<main class:focus={isFocus} class:break={!isFocus}>
  <header class="top">
    <div class="brand-wrap">
      <svg class="sprout" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="M12 22c-.55 0-1-.45-1-1v-6.2c0-.55.45-1 1-1s1 .45 1 1V21c0 .55-.45 1-1 1Z"/>
        <path d="M10.8 14.2c-3.4 0-6.2-2.8-6.2-6.2 0-.6.5-1 1-1 3.4 0 6.2 2.8 6.2 6.2 0 .6-.5 1-1 1Z"/>
        <path d="M13.2 12.2c0-3.4 2.8-6.2 6.2-6.2.6 0 1 .5 1 1 0 3.4-2.8 6.2-6.2 6.2-.6 0-1-.5-1-1Z"/>
      </svg>
      <span class="brand">Sidestep</span>

      <!-- Scene theme picker: one pixel-token circle per season, top-right. -->
      <div class="themes">
        {#each THEME_KEYS as key}
          <button
            class="theme-dot"
            class:selected={theme === key}
            style="--dot: {THEMES[key].dot}"
            onclick={() => pickTheme(key)}
            title="{THEMES[key].label} theme"
            aria-label="{THEMES[key].label} theme"
            aria-pressed={theme === key}
          ></button>
        {/each}
      </div>
    </div>

    <nav class="tabs" role="tablist">
      <button class:active={tab === 'focus'} onclick={() => (tab = 'focus')}>Focus</button>
      <button class:active={tab === 'lists'} onclick={() => (tab = 'lists')}>Lists</button>
      <button class:active={tab === 'blocked'} onclick={() => (tab = 'blocked')}>Blocked</button>
      <button class:active={tab === 'settings'} onclick={() => (tab = 'settings')}>Settings</button>
    </nav>
  </header>

  {#if t && s && l}
    <!-- ===================== FOCUS PAGE ===================== -->
    {#if tab === 'focus'}
      {#if allowed.length}
        <div class="freedom-banner">
          {#each allowed as a}
            <div class="fb-row">
              <span class="fb-text"><strong>{a.site}</strong> {allowanceLabel(a.exp)}</span>
              <button class="fb-off" onclick={() => turnOff(a.site)}>Turn off</button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- The bunny's home. It hops through the run cycle while you're focusing
           and sits still when idle/paused/on a break. -->
      <div class="habitat" style="--habitat-bg: {scene.bg}; --habitat-size: {scene.zoom ?? 'cover'}; --grass-img: url({scene.grass}); --grass-tile: {scene.tile}px">
        <div class="hud">
          <div class="time">{formatMs(remaining)}</div>
          <div class="status">
            {#if t.status === 'running'}{isFocus ? 'Focusing' : 'On a break'}
            {:else if t.status === 'paused'}Paused
            {:else}Ready when you are{/if}
          </div>
          {#if roundLabel}
            <div class="round">{roundLabel}</div>
          {/if}
        </div>

        <div class="bunny-slot">
          <img class="bunny-sprite" style="width:{sprite.width}px" src={bunnyRunning ? sprite.run[bunnyFrame % sprite.run.length] : sprite.sit} alt="" draggable="false" />
        </div>

        <div class="ground" class:active={bunnyActive} class:running={bunnyRunning} style="animation-duration: {grassSeconds}s"></div>
      </div>

      <!-- Two minimal bars under the scene: Time (session progress) over XP (focus
           progress toward the next companion unlock). Label + value sit above a
           hairline track, so the scene and pet stay the star. -->
      <div class="stat-bars">
        <div class="mbar">
          <div class="mbar-head">
            <span class="mbar-lab">Time left</span>
            <span class="mbar-val">{formatMs(remaining)}</span>
          </div>
          <div class="mbar-track"><div class="mbar-fill tm" style="width: {progress * 100}%"></div></div>
        </div>
        <div class="mbar">
          <div class="mbar-head">
            <span class="mbar-lab">{xpLead}</span>
            <span class="mbar-val">{xpValue}</span>
          </div>
          <div class="mbar-track"><div class="mbar-fill xp" style="width: {xpFill * 100}%"></div></div>
        </div>
      </div>

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

      <!-- Thought parking lot: jot a stray thought mid-session so it stops nagging
           you, and it waits here until you have time for it. Also filled from the
           redirect page. The card always shows — otherwise there'd be nowhere to
           type your first thought. -->
      <div class="parked">
        <div class="parked-head">
          <span>Parked thoughts</span>
          <button
            class="add"
            class:open={adding}
            onclick={toggleAdd}
            aria-expanded={adding}
            aria-label={adding ? 'Cancel adding a thought' : 'Add a thought'}
          >+</button>
        </div>

        {#if adding}
          <div class="row">
            <input
              class="inp"
              bind:this={parkInput}
              placeholder="Jot a thought for later…"
              bind:value={parkDraft}
              onkeydown={(e) => {
                if (e.key === 'Enter') addThought();
                else if (e.key === 'Escape') toggleAdd();
              }}
            />
            <button class="mini" onclick={addThought}>Park</button>
          </div>
        {/if}

        {#if pl.length}
          <ul class="parked-list">
            {#each pl as p, i}
              <li class:done={p.done}>
                <button
                  class="check"
                  class:on={p.done}
                  onclick={() => toggleParked(i)}
                  aria-label={p.done ? 'Mark not done' : 'Mark done'}
                >{p.done ? '✓' : ''}</button>
                <span class="parked-text">{p.text}</span>
                {#if confirmAt === p.savedAt}
                  <span class="confirm">
                    <span class="confirm-q">Remove?</span>
                    <button class="confirm-yes" onclick={() => removeParked(i)}>Yes</button>
                    <button class="confirm-no" onclick={cancelRemove}>No</button>
                  </span>
                {:else}
                  <button
                    class="remove"
                    onclick={() => askRemove(p.savedAt)}
                    aria-label="Remove thought">Remove</button>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="parked-empty">Nothing parked yet. Tap + to jot a stray thought.</p>
        {/if}
      </div>
    {/if}

    <!-- ===================== LISTS PAGE ===================== -->
    {#if tab === 'lists'}
      <section class="card">
        <div class="card-head">
          <span class="card-label">Useful links</span>
          {#if linkCount}
            <span class="topic-pill">{linkCount} saved</span>
          {/if}
        </div>

        <p class="hint no-top">
          Saved links are filed by the site they're on. Reach for YouTube mid-session
          and Sidestep serves your next saved YouTube link instead.
        </p>

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
        {#if draftSite}
          <span class="filed">Files under <strong>{siteLabel(draftSite)}</strong></span>
        {/if}

        <button class="soft-btn" onclick={saveCurrentPage}>
          <span class="plus">＋</span> Save the page I'm on
        </button>

        {#if buckets.length}
          {#each buckets as b}
            <div class="bucket">
              <div class="bucket-head">
                <span class="bucket-name">{b.label}</span>
                <span class="bucket-count">{b.links.length}</span>
              </div>
              <ul class="list">
                {#each b.links as link, i}
                  <li>
                    <div class="link-main">
                      {#if linkTitle(link)}
                        <span class="link-title">{linkTitle(link)}</span>
                      {/if}
                      <span class="link-url" title={linkUrl(link)}>{prettyUrl(linkUrl(link))}</span>
                    </div>
                    <button class="x" onclick={() => removeLink(b.key, i)} aria-label="Remove link">×</button>
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        {:else}
          <div class="empty">No links yet. Add a few you actually want to get to.</div>
        {/if}
      </section>
    {/if}

    <!-- ===================== BLOCKED PAGE ===================== -->
    {#if tab === 'blocked'}
      {#if allowed.length}
        <section class="card">
          <div class="card-head">
            <span class="card-label">Allowed right now</span>
          </div>
          <ul class="allow-list">
            {#each allowed as a}
              <li>
                <div class="al-main">
                  <span class="al-site">{a.site}</span>
                  <span class="al-status">{allowanceLabel(a.exp)}</span>
                </div>
                <button class="mini" onclick={() => turnOff(a.site)}>Turn off</button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

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

        <button class="soft-btn" onclick={blockCurrentSite}>
          <span class="plus">＋</span> Block the site I'm on
        </button>

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
    {/if}

    <!-- ===================== SETTINGS PAGE ===================== -->
    {#if tab === 'settings'}
      <section class="card">
        <div class="card-head">
          <span class="card-label">Session lengths</span>
        </div>

        <div class="setting">
          <span class="setting-name">Focus</span>
          <div class="stepper">
            <button disabled={focusAtMin} onclick={() => stepMinutes('focusMinutes', -1)} aria-label="Less focus time">−</button>
            <span class="num">{s.focusMinutes}<small>min</small></span>
            <button disabled={focusAtMax} onclick={() => stepMinutes('focusMinutes', 1)} aria-label="More focus time">+</button>
          </div>
        </div>

        <div class="setting">
          <span class="setting-name">Break</span>
          <div class="stepper">
            <button disabled={breakAtMin} onclick={() => stepMinutes('breakMinutes', -1)} aria-label="Less break time">−</button>
            <span class="num">{s.breakMinutes}<small>min</small></span>
            <button disabled={breakAtMax} onclick={() => stepMinutes('breakMinutes', 1)} aria-label="More break time">+</button>
          </div>
        </div>

        <div class="setting">
          <span class="setting-name">
            Rounds
            <small class="setting-note">focus + break, repeated</small>
          </span>
          <div class="stepper">
            <button disabled={cyclesAtMin} onclick={() => stepCycles(-1)} aria-label="Fewer rounds">−</button>
            <span class="num">{cycleLabel}<small>{cycles === 'continuous' ? 'nonstop' : 'rounds'}</small></span>
            <button disabled={cyclesAtMax} onclick={() => stepCycles(1)} aria-label="More rounds">+</button>
          </div>
        </div>

        <div class="card-head card-sub">
          <span class="card-label">Companion</span>
        </div>
        <label class="setting toggle-row">
          <span class="setting-name">
            Companion on web pages
            <small class="setting-note">show the buddy on the page you're reading</small>
          </span>
          <input
            class="toggle"
            type="checkbox"
            checked={s.showOnPage ?? true}
            onchange={(e) => saveSettings({ showOnPage: e.currentTarget.checked })}
          />
        </label>
        <div class="pets">
          {#each COMPANION_KEYS as key}
            <button
              class="pet"
              class:selected={companion === key}
              class:locked={!isUnlocked(key, xp)}
              disabled={!isUnlocked(key, xp)}
              onclick={() => pickCompanion(key)}
              aria-pressed={companion === key}
            >
              <img src={COMPANIONS[key].icon} alt="" draggable="false" />
              <span>{COMPANIONS[key].label}</span>
              {#if !isUnlocked(key, xp)}
                <span class="lock">🔒 {COMPANIONS[key].unlockAt} XP</span>
              {/if}
            </button>
          {/each}
        </div>
        <p class="hint">Your focus buddy runs alongside you here, and naps on the block page when you step past a distraction. Earn XP by focusing to unlock more; keep them fed or a hungry pet loses its XP.</p>
      </section>
    {/if}
  {:else}
    <div class="habitat"><div class="hud"><div class="time">--:--</div></div></div>
  {/if}
</main>

<style>
  main {
    padding: 12px 14px 16px;
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

  /* Header: brand + top tab bar */
  .top { display: flex; flex-direction: column; gap: 10px; }
  .brand-wrap { display: flex; align-items: center; gap: 7px; padding: 2px 2px 0; }
  .sprout { color: var(--accent); flex: none; transition: color 0.3s ease; }
  .brand {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-weight: 600;
    font-size: 20px;
    letter-spacing: 0.2px;
    color: var(--ink);
  }

  /* Scene theme picker — pixel-token circles pinned to the right of the brand. */
  .themes { display: flex; align-items: center; gap: 6px; margin-left: auto; padding-right: 2px; }
  .theme-dot {
    width: 17px;
    height: 17px;
    padding: 0;
    border: 2px solid #2f2416; /* chunky pixel-art outline */
    border-radius: 50%;
    background: var(--dot);
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.22); /* small offset, like a sticker */
    image-rendering: pixelated;
    cursor: pointer;
    transition: transform 0.1s ease;
  }
  .theme-dot:hover { transform: translateY(-1px); }
  .theme-dot.selected {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .tabs {
    display: flex;
    gap: 3px;
    background: var(--surface-2);
    padding: 4px;
    border-radius: var(--r);
  }
  .tabs button {
    flex: 1;
    border: 0;
    border-radius: 9px;
    padding: 7px 0;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    color: var(--ink-soft);
    background: transparent;
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  }
  .tabs button.active { background: var(--surface); color: var(--accent-deep); box-shadow: var(--shadow-sm); }

  /* Cards (Lists / Blocked / Settings) */
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

  .card-head { display: flex; align-items: center; gap: 8px; }
  /* A second group inside the same card — a divider keeps the panel continuous
     instead of splitting it into two separate boxes. */
  .card-sub { padding-top: 12px; border-top: 1px solid var(--line); }
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

  /* The bunny habitat — the hero of the Focus page. A soft meadow: cream "sky"
     fading to a tinted "grass" band at the bottom. The clock floats in the sky;
     the bunny (placeholder for now) sits on the grass. */
  .habitat {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 5;
    border-radius: var(--r-lg);
    border: 1px solid var(--line);
    /* Scene backdrop — swapped per theme via --habitat-bg; --habitat-size lets a
       theme zoom in past cover (rainy). Falls back to the meadow at cover. */
    background: var(--habitat-bg, url(/scene/background.png)) center / var(--habitat-size, cover) no-repeat;
    box-shadow: var(--shadow);
    overflow: hidden;
    transition: background 0.3s ease;
  }
  /* Timer "heads-up display" floating near the top of the habitat. */
  .hud { position: absolute; top: 22px; left: 0; right: 0; text-align: center; z-index: 1; }
  .time {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    font-size: 52px;
    line-height: 1;
    letter-spacing: 1px;
    color: var(--ink);
  }
  .status { margin-top: 4px; font-size: 12px; font-weight: 600; color: var(--ink-soft); }
  /* "Round 2 of 4" — a run with an end in sight is easier to commit to. */
  .round {
    margin-top: 5px;
    display: inline-block;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.3px;
    color: var(--accent-deep);
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    border-radius: 999px;
    padding: 2px 9px;
  }

  /* The bunny, standing on the grass. Its feet rest on the grass line; the baked
     hop in the frames lifts it off and back as the run cycle plays. `bottom` is a
     percentage so it tracks the square habitat at any popup size. */
  .bunny-slot {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 20%;
    z-index: 1;
    display: flex;
    justify-content: center;
  }
  .bunny-sprite {
    /* Width is set inline, per companion (bunny vs fox read at different sizes). */
    height: auto;
    user-select: none;
    -webkit-user-drag: none;
  }

  /* The grass band. */
  .ground {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -3%;
    height: 55%;
    /* Grass image + its exact tile width both come from the active theme
       (--grass-img / --grass-tile), set inline on .habitat. Each strip's ends are
       cross-faded over a plain-grass patch so the scroll seam is invisible, and
       the scroll distance below matches --grass-tile so the loop lines up. */
    background-image: var(--grass-img, url(/scene/grass.png));
    background-repeat: repeat-x;
    background-size: var(--grass-tile, 1571px) 100%;
    background-position: left top;
  }
  /* While the companion runs it faces left and stays put, so scroll the meadow
     to the RIGHT to sell forward motion. One full tile (1571px) takes 9.2s — a
     run, not a slide. steps(105) hops the grass in discrete ~15px jumps (~88ms,
     about twice the run frame rate) so it shares the pixel-art look without
     stuttering. The animation is attached whenever the focus session is `active`
     (running OR paused) and defaults to paused; adding `running` plays it. That
     way a pause freezes the grass in place and resume continues from there,
     instead of snapping back to the start. */
  .ground.active {
    animation: grass-scroll 9.2s steps(105) infinite;
    animation-play-state: paused;
  }
  .ground.active.running {
    animation-play-state: running;
  }
  @keyframes grass-scroll {
    from { background-position: 0 top; }
    to   { background-position: var(--grass-tile, 1571px) top; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ground.active { animation: none; }
  }

  /* Parked thoughts — the "for later" list, filled from the redirect page */
  .parked {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow);
    padding: 13px 14px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .parked-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    font-weight: 700;
    color: var(--ink-soft);
  }
  /* The + that reveals the jot box. Rotates into an × while the box is open.
     `font: inherit` matters: a <button> does NOT inherit the page font on its
     own, so without it the + would render in the browser's default face at a
     different weight from the "Parked thoughts" label beside it. */
  .add {
    flex: none;
    border: 0;
    background: transparent;
    color: var(--ink-soft);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    padding: 0 1px;
    transition: transform 0.15s ease, color 0.15s ease;
  }
  .add:hover { color: var(--accent); }
  .add.open { transform: rotate(45deg); color: var(--ink-faint); }
  .parked-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
  .parked-list li {
    display: flex;
    align-items: center;
    gap: 9px;
    background: var(--surface-2);
    border-radius: 11px;
    padding: 8px 10px;
  }
  .check {
    flex: none;
    width: 20px;
    height: 20px;
    border: 1.5px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: #fff;
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .check.on { background: var(--accent); border-color: var(--accent); }
  .parked-text { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; color: var(--ink); }
  .parked-list li.done .parked-text { color: var(--ink-faint); text-decoration: line-through; }
  .parked-empty { margin: 0; padding-left: 2px; font-size: 12px; font-weight: 600; color: var(--ink-faint); }

  /* "Remove" — small red text at the right of each thought. This is its own class
     on purpose: the shared `.x` button is also used by the Lists and Blocked tabs,
     so restyling `.x` would have changed those too. */
  .remove {
    flex: none;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    color: #cf6b5e;
    cursor: pointer;
    padding: 0 2px;
    opacity: 0.8;
    transition: opacity 0.15s ease;
  }
  .remove:hover { opacity: 1; text-decoration: underline; }

  /* The inline "are you sure?" that replaces Remove once it's clicked. */
  .confirm { flex: none; display: flex; align-items: center; gap: 7px; }
  .confirm-q { font-size: 11px; font-weight: 700; color: var(--ink-soft); }
  .confirm-yes,
  .confirm-no {
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    padding: 0 1px;
  }
  .confirm-yes { color: #cf6b5e; }
  .confirm-no { color: var(--ink-soft); }
  .confirm-yes:hover,
  .confirm-no:hover { text-decoration: underline; }

  /* The two stat bars below the scene — minimal: an uppercase label and its value
     on one line, over a hairline track. Understated so the scene and pet stay the
     star; only the fill colour differs (blue Time, gold XP). */
  .stat-bars {
    display: flex;
    flex-direction: column;
    gap: 11px;
    margin-top: 4px;
  }
  .mbar { display: flex; flex-direction: column; gap: 5px; }
  .mbar-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }
  .mbar-lab {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mbar-val {
    flex: none;
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .mbar-track {
    height: 11px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 2px solid #2f2416; /* same chunky outline as the theme dots */
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.22);
    overflow: hidden;
  }
  .mbar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s ease;
  }
  .mbar-fill.tm { background: #5b9bd5; }
  .mbar-fill.xp { background: #f5b301; }
  @media (prefers-reduced-motion: reduce) {
    .mbar-fill { transition: none; }
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

  /* A site's bucket of saved links: a small heading with a count, then the links.
     Grouping them this way makes the substitution rule visible — you can see at a
     glance which sites you actually have a better answer ready for. */
  .bucket { display: flex; flex-direction: column; gap: 6px; }
  .bucket-head { display: flex; align-items: center; gap: 7px; padding-left: 2px; }
  .bucket-name { font-size: 12.5px; font-weight: 800; color: var(--ink); }
  .bucket-count {
    font-size: 10.5px;
    font-weight: 800;
    color: var(--accent-deep);
    background: var(--accent-tint);
    border-radius: 999px;
    padding: 1px 7px;
  }

  /* Live hint under the paste box: which bucket this link is about to land in. */
  .filed { font-size: 11.5px; color: var(--ink-soft); padding-left: 2px; margin-top: -3px; }
  .filed strong { font-weight: 800; color: var(--accent-deep); }

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

  /* Settings */
  .setting { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .setting-name { font-size: 13.5px; font-weight: 700; color: var(--ink); display: flex; flex-direction: column; gap: 1px; }
  .setting-note { font-size: 10.5px; font-weight: 600; color: var(--ink-faint); }
  .stepper {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--surface-2);
    border-radius: 999px;
    padding: 4px;
  }
  .stepper button {
    width: 30px; height: 30px;
    border: 0; border-radius: 999px;
    background: var(--surface);
    color: var(--accent-deep);
    font: inherit; font-size: 17px; font-weight: 700;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: filter 0.15s ease;
  }
  .stepper button:hover:not(:disabled) { filter: brightness(0.97); }
  .stepper button:disabled { opacity: 0.4; cursor: default; box-shadow: none; }

  /* On/off switch for "Companion on web pages". A checkbox styled as a sliding
     pill: track goes sage-green when on, grey when off, with a knob that slides. */
  .toggle-row { cursor: pointer; }
  .toggle {
    appearance: none; -webkit-appearance: none; margin: 0; flex: none;
    position: relative; width: 42px; height: 24px; border-radius: 999px;
    background: #cfcabb; box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.18);
    cursor: pointer; transition: background 0.15s ease;
  }
  .toggle::after {
    content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px;
    border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s ease;
  }
  .toggle:checked { background: var(--accent, #7a9b6e); }
  .toggle:checked::after { transform: translateX(18px); }
  @media (prefers-reduced-motion: reduce) {
    .toggle, .toggle::after { transition: none; }
  }
  .num {
    min-width: 58px;
    text-align: center;
    font-size: 15px; font-weight: 800; color: var(--ink);
  }
  .num small { font-size: 10.5px; font-weight: 700; color: var(--ink-soft); margin-left: 2px; }
  .hint { margin: 2px 0 0; font-size: 11.5px; color: var(--ink-faint); }
  .hint.no-top { margin: -3px 0 0; line-height: 1.45; }

  /* Companion picker — one tappable tile per animal, its sit pose as the icon. */
  /* Three tiles per row; a 4th (and beyond) wraps to the next row, left-aligned. */
  .pets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .pet {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 8px 10px;
    border: 1.5px solid var(--line);
    border-radius: var(--r);
    background: var(--surface-2);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.05s ease;
  }
  .pet:hover { border-color: var(--accent-tint); }
  .pet:active { transform: translateY(1px); }
  .pet.selected {
    border-color: var(--accent);
    background: var(--accent-tint);
  }
  /* A pet you haven't earned yet: dimmed, not clickable, with its XP price shown. */
  .pet.locked { cursor: not-allowed; opacity: 0.55; filter: grayscale(0.9); }
  .pet.locked:hover { border-color: var(--line); }
  .pet.locked:active { transform: none; }
  .pet .lock { font-size: 10.5px; font-weight: 700; color: var(--ink-soft); }
  .pet img {
    width: 56px;
    height: 56px;
    object-fit: contain;
    image-rendering: pixelated; /* keep the pixel-art crisp when scaled down */
  }
  .pet span { font-size: 12.5px; font-weight: 700; color: var(--ink); }

  /* Freedom-window status (banner on Focus, list on Blocked) */
  .freedom-banner {
    background: var(--accent-tint);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: var(--r);
    padding: 8px 10px 8px 13px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .fb-row { display: flex; align-items: center; gap: 8px; }
  .fb-text { flex: 1; min-width: 0; font-size: 12px; color: var(--accent-deep); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fb-text strong { font-weight: 800; }
  .fb-off {
    border: 0; background: var(--surface); color: var(--accent-deep);
    border-radius: 999px; padding: 4px 11px;
    font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer;
    box-shadow: var(--shadow-sm); transition: filter 0.15s ease;
  }
  .fb-off:hover { filter: brightness(0.97); }

  .allow-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .allow-list li {
    display: flex; align-items: center; gap: 8px;
    background: var(--accent-tint);
    border-radius: 11px;
    padding: 8px 10px 8px 12px;
  }
  .al-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .al-site { font-size: 13px; font-weight: 800; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .al-status { font-size: 11.5px; font-weight: 600; color: var(--accent-deep); }
</style>
