// The floating on-page companion.
//
// While a focus session is running, this drops a small draggable pet onto the
// web page you're viewing — a "body double" that sits with you as you work. It
// only lives inside web pages (that's the limit of a browser extension: it can't
// paint over other desktop apps or special chrome:// pages), and each tab shows
// its own copy at the shared, remembered position.
//
// The whole widget lives in a Shadow DOM so the page's CSS can't touch it and our
// styles can't leak onto the page. It reads the timer, the chosen companion, and
// the saved position straight from storage, and re-renders whenever any change.
import { COMPANIONS, DEFAULT_COMPANION } from '@/lib/companions';
import { settings, timer, overlay } from '@/lib/storage';

const url = (p: string) => (browser.runtime.getURL as (s: string) => string)(p);

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    if (window.top !== window) return; // top-level page only, never inside iframes

    // --- the widget, isolated in a shadow root ---
    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed; z-index:2147483647; left:0; top:0; margin:0; padding:0;' +
      'display:none; cursor:grab; user-select:none; touch-action:none;';
    const shadow = host.attachShadow({ mode: 'open' });
    const img = document.createElement('img');
    img.draggable = false;
    img.alt = '';
    img.style.cssText =
      'display:block; width:100%; height:auto; image-rendering:pixelated;' +
      'pointer-events:none; -webkit-user-drag:none; filter:drop-shadow(0 3px 4px rgba(0,0,0,.28));';
    shadow.appendChild(img);
    (document.documentElement || document.body).appendChild(host);

    // --- companion sprite data ---
    let sprite: any = COMPANIONS[DEFAULT_COMPANION];
    let runURLs: string[] = [];
    let sitURL = '';
    let overlayW = 110;
    function loadSprite(key: string) {
      sprite = COMPANIONS[key] ?? COMPANIONS[DEFAULT_COMPANION];
      runURLs = sprite.run.map(url);
      sitURL = url(sprite.sit);
      overlayW = Math.round(sprite.width * 0.45); // ~half the popup size
      host.style.width = overlayW + 'px';
      for (const u of [...runURLs, sitURL]) new Image().src = u; // warm the cache
    }

    // --- state + animation ---
    let state = { status: 'idle', mode: 'focus' };
    let showOnPage = true; // the "Companion on web pages" setting — hides the pet when off
    let frame = 0;
    let anim: ReturnType<typeof setInterval> | undefined;
    const stopAnim = () => { if (anim) { clearInterval(anim); anim = undefined; } };

    function render() {
      // Show the pet whenever a session is on — focus OR break — so it keeps you
      // company through the whole cycle, not only while focusing. It runs when the
      // timer is ticking and sits when paused.
      const running = state.status === 'running';
      const active = showOnPage && (state.status === 'running' || state.status === 'paused');
      if (!active) { host.style.display = 'none'; stopAnim(); return; }
      host.style.display = 'block';
      if (running) {
        if (!anim) {
          anim = setInterval(() => {
            frame = (frame + 1) % runURLs.length;
            img.src = runURLs[frame];
          }, sprite.frameMs);
        }
      } else {
        stopAnim();
        img.src = sitURL; // paused: the pet sits and waits
      }
    }

    // --- placement ---
    function place(x: number, y: number) {
      const w = host.offsetWidth || overlayW;
      const h = host.offsetHeight || overlayW;
      const cx = Math.max(0, Math.min(window.innerWidth - w, x));
      const cy = Math.max(0, Math.min(window.innerHeight - h, y));
      host.style.left = cx + 'px';
      host.style.top = cy + 'px';
    }
    const defaultPos = () => ({ x: window.innerWidth - overlayW - 24, y: window.innerHeight - overlayW - 24 });

    // --- drag to reposition (saved so it persists and syncs across tabs) ---
    let dragging = false, moved = false, offX = 0, offY = 0;
    host.addEventListener('pointerdown', (e) => {
      dragging = true; moved = false;
      const r = host.getBoundingClientRect();
      offX = e.clientX - r.left; offY = e.clientY - r.top;
      host.setPointerCapture(e.pointerId);
      host.style.cursor = 'grabbing';
      e.preventDefault();
    });
    host.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      moved = true;
      place(e.clientX - offX, e.clientY - offY);
    });
    host.addEventListener('pointerup', async (e) => {
      if (!dragging) return;
      dragging = false;
      host.style.cursor = 'grab';
      try { host.releasePointerCapture(e.pointerId); } catch {}
      if (moved) {
        const r = host.getBoundingClientRect();
        await overlay.setValue({ x: r.left, y: r.top });
      }
    });
    window.addEventListener('resize', () => {
      const r = host.getBoundingClientRect();
      place(r.left, r.top);
    });

    // --- wire everything to storage ---
    (async () => {
      const [s, t, pos] = await Promise.all([settings.getValue(), timer.getValue(), overlay.getValue()]);
      showOnPage = s?.showOnPage ?? true;
      loadSprite(s?.companion ?? DEFAULT_COMPANION);
      const p = pos && pos.x != null ? pos : defaultPos();
      place(p.x, p.y);
      state = { status: t?.status ?? 'idle', mode: t?.mode ?? 'focus' };
      render();
    })();

    settings.watch((s) => { showOnPage = s?.showOnPage ?? true; loadSprite(s?.companion ?? DEFAULT_COMPANION); render(); });
    timer.watch((t) => { state = { status: t?.status ?? 'idle', mode: t?.mode ?? 'focus' }; render(); });
    overlay.watch((pos) => { if (pos && pos.x != null && !dragging) place(pos.x, pos.y); });
  },
});
