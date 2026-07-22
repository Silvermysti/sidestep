<script>
  import { onMount, tick } from 'svelte';
  import { browser } from '#imports';
  import { settings, timer, allowances, parkingLot, progress as progressStore } from '@/lib/storage';
  import { parkThought } from '@/lib/parking';
  import { durationMs, formatMs, getRemainingMs, totalCycles } from '@/lib/timer';
  import { COMPANIONS, COMPANION_KEYS, DEFAULT_COMPANION, isUnlocked } from '@/lib/companions';
  import { hostnameOf, normalizeUrl, siteToBlock } from '@/lib/sites';
  import { THEMES, THEME_KEYS, DEFAULT_THEME, isThemeUnlocked } from '@/lib/themes';

  let tab = $state('focus');

  let t = $state(null);
  let s = $state(null);
  let al = $state(null);
  let prog = $state(null);
  let pl = $state([]);
  let parkDraft = $state('');
  let adding = $state(false);
  let parkInput = $state();
  let confirmAt = $state(null);
  let now = $state(Date.now());
  let siteDraft = $state('');

  onMount(() => {
    (async () => {
      t = await timer.getValue();
      s = await settings.getValue();
      al = await allowances.getValue();
      prog = await progressStore.getValue();
      pl = await parkingLot.getValue();
    })();

    for (const c of Object.values(COMPANIONS)) {
      for (const src of [...c.run, c.sit, c.sleep]) { const im = new Image(); im.src = src; }
    }

    const unwatchT = timer.watch((v) => (t = v));
    const unwatchS = settings.watch((v) => (s = v));
    const unwatchA = allowances.watch((v) => (al = v));
    const unwatchProg = progressStore.watch((v) => (prog = v));
    const unwatchP = parkingLot.watch((v) => (pl = v));
    const ticker = setInterval(() => (now = Date.now()), 250);

    return () => {
      unwatchT();
      unwatchS();
      unwatchA();
      unwatchProg();
      unwatchP();
      clearInterval(ticker);
    };
  });

  async function toggleAdd() {
    adding = !adding;
    if (adding) {
      await tick();
      parkInput?.focus();
    } else {
      parkDraft = '';
    }
  }

  async function addThought() {
    if (!(await parkThought(parkDraft))) return;
    parkDraft = '';
    adding = false;
  }
  async function toggleParked(i) {
    await parkingLot.setValue(pl.map((p, idx) => (idx === i ? { ...p, done: !p.done } : p)));
  }

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

  let remaining = $derived(t && s ? getRemainingMs(t, now) : 0);
  let total = $derived(t && s ? durationMs(t.mode, s) : 1);
  let progress = $derived(total > 0 ? Math.min(1, 1 - remaining / total) : 0);
  let isFocus = $derived(t?.mode === 'focus');

  let companion = $derived(s?.companion ?? DEFAULT_COMPANION);
  let sprite = $derived(COMPANIONS[companion]);

  let xp = $derived(prog?.xp ?? 0);

  let theme = $derived(
    s?.theme && THEMES[s.theme] && (prog == null || isThemeUnlocked(s.theme, xp)) ? s.theme : DEFAULT_THEME
  );
  let scene = $derived(THEMES[theme]);
  function pickTheme(key) {
    if (key === theme || !isThemeUnlocked(key, xp)) return;
    saveSettings({ theme: key });
  }

  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.mode = isFocus ? 'focus' : 'break';
  });

  const UNLOCKS = [
    ...COMPANION_KEYS.map((k) => COMPANIONS[k]),
    ...THEME_KEYS.map((k) => THEMES[k]),
  ]
    .filter((u) => u.unlockAt > 0)
    .sort((a, b) => a.unlockAt - b.unlockAt);

  let nextLock = $derived(UNLOCKS.find((u) => xp < u.unlockAt) ?? null);
  let prevUnlock = $derived(
    UNLOCKS.map((u) => u.unlockAt).filter((u) => u <= xp).reduce((a, b) => Math.max(a, b), 0)
  );
  let xpFill = $derived(nextLock ? Math.min(1, (xp - prevUnlock) / (nextLock.unlockAt - prevUnlock)) : 1);
  let xpLead = $derived(
    nextLock ? `XP · ${nextLock.label} in ${Math.max(0, Math.ceil(nextLock.unlockAt - xp))}m` : 'XP · all unlocked'
  );
  let xpValue = $derived(nextLock ? `${Math.floor(xp)} / ${nextLock.unlockAt}` : `${Math.floor(xp)} XP`);

  const BASE_GRASS_S = 9.2;
  let grassSeconds = $derived((BASE_GRASS_S / (sprite.grassSpeed ?? 1)).toFixed(3));

  let bunnyFrame = $state(0);
  let bunnyRunning = $derived(t?.status === 'running' && isFocus);
  let bunnyActive = $derived((t?.status === 'running' || t?.status === 'paused') && isFocus);
  let sleeping = $derived(t?.mode === 'break' && t?.status !== 'idle');
  let petPose = $derived(
    bunnyRunning ? sprite.run[bunnyFrame % sprite.run.length] : sleeping ? sprite.sleep : sprite.sit
  );

  $effect(() => {
    if (!bunnyRunning) { bunnyFrame = 0; return; }
    const frames = sprite.run.length;
    const id = setInterval(() => { bunnyFrame = (bunnyFrame + 1) % frames; }, sprite.frameMs);
    return () => clearInterval(id);
  });

  let sites = $derived(s?.distractingSites ?? []);

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

  function saveSettings(patch) {
    return settings.setValue($state.snapshot({ ...s, ...patch }));
  }

  async function addSite() {
    const host = hostnameOf(normalizeUrl(siteDraft) ?? '');
    if (!host || sites.includes(host)) { siteDraft = ''; return; }
    await saveSettings({ distractingSites: [...sites, host] });
    siteDraft = '';
  }

  async function removeSite(host) {
    await saveSettings({ distractingSites: sites.filter((x) => x !== host) });
  }

  async function blockCurrentSite() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const host = siteToBlock(hostnameOf(tab?.url ?? '') ?? '');
    if (!host || sites.includes(host)) return;
    await saveSettings({ distractingSites: [...sites, host] });
  }

  const FOCUS_STEPS = [1, 5, 10, 15, 20, 25, 30, 45, 60, 90];
  const BREAK_STEPS = [1, 3, 5, 10, 15, 20, 30];
  const CYCLE_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 'continuous'];

  async function stepMinutes(field, dir) {
    const steps = field === 'focusMinutes' ? FOCUS_STEPS : BREAK_STEPS;
    const current = s[field];
    let nearest = 0;
    for (let i = 1; i < steps.length; i++) {
      if (Math.abs(steps[i] - current) < Math.abs(steps[nearest] - current)) nearest = i;
    }

    const onPreset = steps[nearest] === current;
    const next = onPreset ? nearest + dir : nearest;
    const i = Math.max(0, Math.min(steps.length - 1, next));

    await saveSettings({ [field]: steps[i] });

    if (t.status === 'idle') send('reset');
  }

  async function stepCycles(dir) {
    const at = CYCLE_STEPS.indexOf(s.cycles);
    const from = at === -1 ? CYCLE_STEPS.indexOf(4) : at;
    const i = Math.max(0, Math.min(CYCLE_STEPS.length - 1, at === -1 ? from : from + dir));
    await saveSettings({ cycles: CYCLE_STEPS[i] });
  }

  async function pickCompanion(key) {
    if (key === companion) return;
    if (!isUnlocked(key, xp)) return;
    await saveSettings({ companion: key });
  }

  let cycles = $derived(s ? s.cycles : 4);
  let cycleLabel = $derived(cycles === 'continuous' ? '∞' : String(cycles));

  let roundLabel = $derived(
    !t || !s || t.status === 'idle'
      ? ''
      : cycles === 'continuous'
        ? `Round ${t.cycle ?? 1}`
        : `Round ${t.cycle ?? 1} of ${totalCycles(s)}`
  );

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

      <div class="themes">
        {#each THEME_KEYS as key}
          <button
            class="theme-dot"
            class:selected={theme === key}
            class:locked={!isThemeUnlocked(key, xp)}
            disabled={!isThemeUnlocked(key, xp)}
            style="--dot: {THEMES[key].dot}"
            onclick={() => pickTheme(key)}
            title={isThemeUnlocked(key, xp)
              ? `${THEMES[key].label} theme`
              : `${THEMES[key].label} theme · unlocks at ${THEMES[key].unlockAt} XP`}
            aria-label={isThemeUnlocked(key, xp)
              ? `${THEMES[key].label} theme`
              : `${THEMES[key].label} theme, locked until ${THEMES[key].unlockAt} XP`}
            aria-pressed={theme === key}
          ></button>
        {/each}
      </div>
    </div>

    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'focus'} class:active={tab === 'focus'} onclick={() => (tab = 'focus')}>Focus</button>
      <button role="tab" aria-selected={tab === 'blocked'} class:active={tab === 'blocked'} onclick={() => (tab = 'blocked')}>Blocked</button>
      <button role="tab" aria-selected={tab === 'companions'} class:active={tab === 'companions'} onclick={() => (tab = 'companions')}>Companion</button>
      <button role="tab" aria-selected={tab === 'settings'} class:active={tab === 'settings'} onclick={() => (tab = 'settings')}>Settings</button>
    </div>
  </header>

  {#if t && s}

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

      <div class="habitat" style="--habitat-bg: {scene.bg}; --habitat-size: {scene.zoom ?? 'cover'}; --habitat-pos: {scene.pos ?? 'center'}; --grass-img: url({scene.grass}); --grass-tile: {scene.tile}px; --grass-bottom: {scene.grassBottom ?? '-3%'}; --grass-height: {scene.grassHeight ?? '55%'}">
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
          <div class="pet-wrap" style="width:{sprite.width}px">
            <img class="bunny-sprite" src={petPose} alt="" draggable="false" />
            {#if sleeping}
              <img class="z z1" src="/scene/z.png" alt="" />
              <img class="z z2" src="/scene/z.png" alt="" />
              <img class="z z3" src="/scene/z.png" alt="" />
            {/if}
          </div>
        </div>

        <div class="ground" class:active={bunnyActive} class:running={bunnyRunning} style="animation-duration: {grassSeconds}s"></div>
      </div>

      <div class="stat-bars">
        <div class="mbar">
          <div class="mbar-head">
            <span class="mbar-lab">Time</span>
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

    {#if tab === 'companions'}
      <section class="card">
        <div class="card-head">
          <span class="card-label">Your companions</span>
        </div>

        <label class="setting toggle-row">
          <span class="setting-name">Companion on web pages</span>
          <input
            class="toggle"
            type="checkbox"
            checked={s.showOnPage ?? true}
            onchange={(e) => saveSettings({ showOnPage: e.currentTarget.checked })}
          />
        </label>

        <div class="mbar">
          <div class="mbar-head">
            <span class="mbar-lab">{xpLead}</span>
            <span class="mbar-val">{xpValue}</span>
          </div>
          <div class="mbar-track"><div class="mbar-fill xp" style="width: {xpFill * 100}%"></div></div>
        </div>

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

        <p class="hint">Your focus buddy runs alongside you here, and naps on the block page when you step past a distraction. Keep focusing to earn XP and unlock the rest.</p>
      </section>
    {/if}

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

  .themes { display: flex; align-items: center; gap: 6px; margin-left: auto; padding-right: 2px; }
  .theme-dot {
    width: 17px;
    height: 17px;
    padding: 0;
    border: 2px solid var(--outline);
    border-radius: 50%;
    background: var(--dot);
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.22);
    cursor: pointer;
    transition: transform 0.1s ease;
  }
  .theme-dot:hover:not(.locked) { transform: translateY(-1px); }
  .theme-dot.locked {
    cursor: not-allowed;
    opacity: 0.4;
    filter: grayscale(0.85);
    box-shadow: none;
  }
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
    transition: background-color 0.35s ease, border-color 0.35s ease;
  }
  .tabs button {
    flex: 1;
    border: 0;
    border-radius: 9px;
    padding: 7px 2px;
    font: inherit;

    font-size: 11.5px;
    white-space: nowrap;
    font-weight: 700;
    color: var(--ink-soft);
    background: transparent;
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  }
  .tabs button.active {
    background: var(--surface);
    color: var(--accent-deep);
    box-shadow: var(--shadow-sm);
  }

  .card {
    background: var(--surface);
    border-radius: var(--r-lg);

    box-shadow: var(--shadow);
    padding: 15px;
    transition: background-color 0.35s ease, border-color 0.35s ease, color 0.35s ease;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .card-head { display: flex; align-items: center; gap: 8px; }
  .card-label {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.3px;
    color: var(--accent-deep);
  }

  .habitat {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 5;
    border-radius: var(--r-lg);
    border: 1.5px solid var(--edge);

    background: var(--habitat-bg, url(/scene/background.png)) var(--habitat-pos, center) / var(--habitat-size, cover) no-repeat;

    box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.18), var(--shadow);
    overflow: hidden;
    transition: background 0.35s ease, border-color 0.35s ease;
  }

  .hud { position: absolute; top: 22px; left: 0; right: 0; text-align: center; z-index: 1; }
  .time {
    font-family: 'Fredoka', 'Nunito', sans-serif;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: 56px;
    line-height: 1;
    letter-spacing: 1px;
    color: var(--ink);

    text-shadow: 0 2px 3px rgba(0, 0, 0, 0.14);
  }
  .status { margin-top: 4px; font-size: 12px; font-weight: 600; color: var(--ink-soft); }

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

  .bunny-slot {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 20%;
    z-index: 1;
    display: flex;
    justify-content: center;
  }
  .pet-wrap { position: relative; }
  .bunny-sprite {
    display: block;
    width: 100%;
    height: auto;
    user-select: none;
    -webkit-user-drag: none;
  }
  .z {
    position: absolute;
    image-rendering: pixelated;
    opacity: 0;
    animation: zrise 3.9s ease-in-out infinite;
    pointer-events: none;
  }
  .z1 { left: 47%; top: 2%;   width: 12px; animation-delay: 0s; }
  .z2 { left: 57%; top: -14%; width: 16px; animation-delay: 1.3s; }
  .z3 { left: 68%; top: -32%; width: 20px; animation-delay: 2.6s; }
  @keyframes zrise {
    0%   { opacity: 0; transform: translateY(6px) scale(0.7); }
    18%  { opacity: 1; }
    55%  { opacity: 1; }
    100% { opacity: 0; transform: translateY(-18px) scale(1.05); }
  }
  @media (prefers-reduced-motion: reduce) {
    .z { animation: none; opacity: 0.85; }
  }

  .ground {
    position: absolute;
    left: 0;
    right: 0;
    bottom: var(--grass-bottom, -3%);
    height: var(--grass-height, 55%);

    background-image: var(--grass-img, url(/scene/grass.png));
    background-repeat: repeat-x;
    background-size: var(--grass-tile, 1571px) 100%;
    background-position: left top;
  }

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

  .parked {
    background: var(--surface);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow);
    padding: 13px 14px;
    transition: background-color 0.35s ease, border-color 0.35s ease, color 0.35s ease;
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

  .add {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 50%;
    background: var(--accent-tint);
    color: var(--accent-deep);
    font: inherit;
    font-size: 18px;
    font-weight: 800;
    line-height: 1;
    padding: 0;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .add:hover { background: var(--accent); color: var(--on-accent, #fff); }
  .add:active { transform: scale(0.92); }
  .add.open { transform: rotate(45deg); }
  .add.open:active { transform: rotate(45deg) scale(0.92); }
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
    height: 12px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 2px solid var(--outline);
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.22);
    overflow: hidden;
    transition: background-color 0.35s ease, border-color 0.35s ease;
  }
  .mbar-fill {
    height: 100%;
    border-radius: 999px;

    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.32), inset 0 -3px 4px rgba(0, 0, 0, 0.16);
    transition: width 0.3s ease, background-color 0.35s ease;
  }
  .mbar-fill.tm { background: var(--bar-time); }
  .mbar-fill.xp { background: var(--bar-xp); }
  @media (prefers-reduced-motion: reduce) {
    .mbar-fill { transition: none; }
  }

  .controls { display: flex; gap: 9px; }
  .controls button {
    flex: 1;
    border-radius: var(--r);
    padding: 11px 0;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    border: 2px solid transparent;

    transition: transform 0.06s ease, box-shadow 0.06s ease, filter 0.15s ease, background 0.15s ease;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent, #fff);

    border-color: color-mix(in srgb, var(--accent) 58%, #000);

    box-shadow: 0 4px 0 color-mix(in srgb, var(--accent) 58%, #000), 0 0 16px var(--glow, transparent);
  }
  .primary:hover:not(:disabled) { filter: brightness(1.05); }
  .primary:active { transform: translateY(3px); box-shadow: 0 1px 0 color-mix(in srgb, var(--accent) 58%, #000), 0 0 16px var(--glow, transparent); }
  .ghost {
    background: var(--surface);
    color: var(--ink);
    border-color: var(--edge);
    box-shadow: 0 4px 0 var(--edge);
  }
  .ghost:hover:not(:disabled) { background: var(--surface-2); }
  .ghost:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 var(--edge); }
  .controls button:disabled { opacity: 0.5; cursor: default; box-shadow: none; transform: none; }

  .row { display: flex; gap: 7px; }
  .inp {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 13px;
    color: var(--ink);
    background: var(--surface-2);
    border: 1.5px solid var(--line);
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

  .chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: flex; align-items: center; gap: 3px;
    background: var(--chip, var(--surface-2));
    border-radius: 999px;
    padding: 5px 7px 5px 12px;
    font-size: 12.5px; font-weight: 700; color: var(--chip-ink, var(--ink));
  }
  .chip .x { color: var(--chip-ink, var(--ink-faint)); opacity: 0.75; }
  .chip .x:hover { opacity: 1; }

  .x {
    border: 0; background: transparent; color: var(--ink-faint);
    cursor: pointer; font-size: 17px; line-height: 1; padding: 0 3px;
    transition: color 0.15s ease;
  }
  .x:hover { color: #cf6b5e; }

  .empty { font-size: 12.5px; color: var(--ink-faint); padding: 2px 0; }

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

  .pets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .pet {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 8px 10px;
    border: 1.5px solid var(--edge);
    border-radius: var(--r);
    background: var(--surface-2);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.05s ease;
  }
  .pet:hover { border-color: var(--accent); }
  .pet:active { transform: translateY(1px); }
  .pet.selected {
    border-color: var(--accent);
    background: var(--accent-tint);
  }

  .pet.locked { cursor: not-allowed; opacity: 0.55; filter: grayscale(0.9); }
  .pet.locked:hover { border-color: var(--edge); }
  .pet.locked:active { transform: none; }
  .pet .lock { font-size: 10.5px; font-weight: 700; color: var(--ink-soft); }
  .pet img {
    width: 56px;
    height: 56px;
    object-fit: contain;
    image-rendering: pixelated;
  }
  .pet span { font-size: 12.5px; font-weight: 700; color: var(--ink); }

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
