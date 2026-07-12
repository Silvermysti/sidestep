// URL + link RULES — pure functions, no side effects.
//
// Same idea as timer.js: given the same input these always return the same
// output and never touch storage or the browser. The background script uses
// them to decide "is this a distracting site?" and "which link do I serve
// next?"; the popup uses them to clean up pasted URLs.

// Pull the hostname out of a URL and drop a leading "www.".
// e.g. "https://www.youtube.com/watch?v=abc" -> "youtube.com"
// Returns null if the string is not a valid URL.
export function hostnameOf(urlString) {
  try {
    return new URL(urlString).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Turn the host of the page the user is on into the entry to add to the block
// list. We strip ONLY "www." and the common mobile prefixes ("m.", "mobile.") —
// not arbitrary subdomains — so blocking gemini.google.com blocks just that, not
// all of google.com. We don't need to collapse subdomains to cover them: a block
// on "youtube.com" already matches "m.youtube.com" etc. via isDistracting's
// subdomain check. The result shows as an editable chip, so the user can always
// broaden it (type "google.com") or narrow it themselves.
export function siteToBlock(host) {
  if (!host) return host;
  return host.replace(/^(?:www|m|mobile)\./i, '').toLowerCase();
}

// Is this host one of the user's distracting sites?
// We match the exact domain OR any subdomain of it, so "m.youtube.com" and
// "youtube.com" both count when the list contains "youtube.com".
export function isDistracting(host, sites) {
  if (!host || !Array.isArray(sites)) return false;
  return sites.some((site) => host === site || host.endsWith('.' + site));
}

// Which entry in `sites` does this host belong to? Returns the matching site
// (e.g. "youtube.com" for a visit to "m.youtube.com"), or the host itself if
// none matched. Used so a freedom window is keyed to the whole site family.
export function matchingSite(host, sites) {
  if (!host || !Array.isArray(sites)) return host;
  return sites.find((site) => host === site || host.endsWith('.' + site)) ?? host;
}

// --- Freedom windows (per-site allowance, Stage 3) -----------------------
//
// `allowances` is { site: expiry } where expiry is a timestamp (ms) or the
// string 'forever'. A window is active if it's 'forever' or its expiry is still
// in the future. We match a host against the allowance keys the same way as the
// block list, so "m.youtube.com" is covered by an allowance on "youtube.com".
export function activeAllowance(host, allowances, now = Date.now()) {
  if (!host || !allowances) return null;
  for (const [site, expiry] of Object.entries(allowances)) {
    if (host === site || host.endsWith('.' + site)) {
      if (expiry === 'forever' || (typeof expiry === 'number' && expiry > now)) {
        return { site, expiry };
      }
    }
  }
  return null;
}

// A saved link is an object { url, title }. Older saves may be a plain string,
// so these accessors tolerate both rather than forcing a data migration.
export function linkUrl(link) {
  return typeof link === 'string' ? link : (link?.url ?? '');
}
export function linkTitle(link) {
  return typeof link === 'string' ? '' : (link?.title ?? '');
}

// --- Links, bucketed by site ---------------------------------------------
//
// `lists` is { sites: { siteKey: [link, ...] }, cursors: { siteKey: n } }.
// A link's bucket comes from its OWN url, so saving never asks the user to pick
// a folder. That is the whole point of the new shape: the substitute we serve
// can come from the same site you just reached for.

// Which bucket does this link belong in? Its hostname, folded into a site group
// (so youtu.be and m.youtube.com both land in "youtube"). Null for a bad URL.
export function siteKeyOf(url) {
  const host = hostnameOf(linkUrl(url) || url);
  return host ? siteGroup(host).key : null;
}

// The links saved for one site bucket. Always an array — a bucket stored as
// anything other than a list (corrupted / half-migrated data) is treated as
// empty rather than trusted, so callers can safely loop over it.
export function linksForSite(lists, siteKey) {
  const links = lists?.sites?.[siteKey];
  return Array.isArray(links) ? links : [];
}

// Every bucket, as [{ key, label, links }], skipping empties. Sorted so the site
// with the most saved links comes first; that keeps the popup and the redirect
// menu stable rather than reordering on every save.
export function siteBuckets(lists) {
  return Object.entries(lists?.sites ?? {})
    .filter(([, links]) => Array.isArray(links) && links.length > 0)
    .map(([key, links]) => ({ key, label: siteLabel(key), links }))
    .sort((a, b) => b.links.length - a.links.length || a.key.localeCompare(b.key));
}

// Pick the NEXT link to serve for the site the user just reached for, and return
// an updated `lists` with THAT SITE's cursor advanced. Pure: it saves nothing —
// the caller decides whether to persist. Wraps back to the start after the last
// link in the bucket.
//
// If the user has nothing saved for this site, we fall back to any other site
// that does have links, so they still get a useful page instead of a dead end.
// Returns { link: null } only when nothing at all is saved.
export function serveNextLink(lists, host = '') {
  const key = host ? siteGroup(host).key : null;
  let links = key ? linksForSite(lists, key) : [];
  let bucket = key;

  if (links.length === 0) {
    const fallback = siteBuckets(lists)[0]; // biggest non-empty bucket
    if (!fallback) return { link: null, lists };
    bucket = fallback.key;
    links = fallback.links;
  }

  const idx = (lists?.cursors?.[bucket] ?? 0) % links.length;
  return {
    link: links[idx],
    lists: { ...lists, cursors: { ...(lists?.cursors ?? {}), [bucket]: idx + 1 } },
  };
}

// --- Allow-list matching -------------------------------------------------
//
// A blocked site is normally substituted. But if the EXACT page the user opened
// is one they saved as useful, we let it through. To compare reliably we reduce
// each URL to a stable "canonical key" first, so cosmetic differences (extra
// query params, www., trailing slash) don't cause a false miss.

// Pull a YouTube video id out of the common URL shapes, or null if it isn't one.
function youtubeVideoId(url, host) {
  if (host === 'youtu.be') return url.pathname.slice(1) || null; // youtu.be/<id>
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const m = url.pathname.match(/^\/(?:shorts|embed|v)\/([^/]+)/);
    if (m) return m[1];
  }
  return null;
}

// A stable identity for a URL. For the big single-page apps we key by the
// CONTENT id (video / post / reel / tweet), so cosmetic differences ("&t=30s",
// "?igshid=…", "m." or "old." subdomains, "www.", trailing slash) never cause a
// false miss. For any other site we fall back to host + path, ignoring the query
// string and trailing slash. Returns null for bad URLs.
export function canonicalKey(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const path = url.pathname.replace(/\/+$/, ''); // drop trailing slash

  // YouTube
  const videoId = youtubeVideoId(url, host);
  if (videoId) return 'yt:' + videoId;

  // Instagram — posts, reels, IGTV share one shortcode namespace.
  if (host === 'instagram.com' || host === 'm.instagram.com') {
    const c = path.match(/^\/(?:p|reel|reels|tv)\/([^/]+)/);
    if (c) return 'ig:' + c[1];
    const u = path.match(/^\/([^/]+)$/);
    if (u && !['explore', 'accounts', 'direct'].includes(u[1])) return 'ig:user:' + u[1].toLowerCase();
  }

  // X / Twitter — a tweet id is globally unique; treat both domains the same.
  if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.x.com' || host === 'mobile.twitter.com') {
    const s = path.match(/^\/[^/]+\/status\/(\d+)/);
    if (s) return 'x:status:' + s[1];
    const u = path.match(/^\/([^/]+)$/);
    if (u && !['home', 'explore', 'notifications', 'messages', 'search', 'i'].includes(u[1])) return 'x:user:' + u[1].toLowerCase();
  }

  // Reddit — the post id after /comments/ is unique; ignore the slug & subdomain.
  if (host === 'reddit.com' || host === 'old.reddit.com' || host === 'np.reddit.com' || host === 'm.reddit.com') {
    const p = path.match(/\/comments\/([a-z0-9]+)/i);
    if (p) return 'reddit:post:' + p[1].toLowerCase();
    const sub = path.match(/^\/r\/([^/]+)$/);
    if (sub) return 'reddit:sub:' + sub[1].toLowerCase();
  }

  return host + path;
}

// Build a fast lookup Set of the canonical keys for EVERY saved link across all
// site buckets. Membership tests on a Set are ~O(1) (hash-based), vs O(n) if we
// re-scanned the arrays on every navigation.
export function buildAllowedKeys(lists) {
  const keys = new Set();
  for (const links of Object.values(lists?.sites ?? {})) {
    if (!Array.isArray(links)) continue; // skip a corrupted/non-list bucket
    for (const link of links) {
      const k = canonicalKey(linkUrl(link));
      if (k) keys.add(k);
    }
  }
  return keys;
}

// --- Grouping for the redirect menu --------------------------------------
//
// The redirect landing page shows every saved link under the site it belongs to.
// These helpers are pure (no storage), so they are easy to test and reuse.

// The big platforms have several domains (youtu.be, m.youtube.com, twitter.com)
// that all mean the same place, so they fold into ONE bucket key with a properly
// capitalised name. Anything else buckets under its own plain hostname.
const SITE_LABELS = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  x: 'X',
  reddit: 'Reddit',
};

// The display name for a bucket key. The known platforms get their proper
// capitalisation; anything else shows as its plain hostname ("amazon.com"),
// which is honest and unambiguous — "Amazon.com" reads worse, and shortening it
// to "Amazon" would hide which domain it actually is.
export function siteLabel(key) {
  return SITE_LABELS[key] ?? key ?? '';
}

// Fold a hostname into its site group: a stable bucket key plus a display label.
export function siteGroup(host) {
  const h = (host || '').replace(/^www\./, '').toLowerCase();
  let key = h;
  if (h === 'youtube.com' || h === 'youtu.be' || h === 'm.youtube.com' || h === 'music.youtube.com') key = 'youtube';
  else if (h === 'instagram.com' || h === 'm.instagram.com') key = 'instagram';
  else if (h === 'x.com' || h === 'twitter.com' || h === 'mobile.x.com' || h === 'mobile.twitter.com') key = 'x';
  else if (h === 'reddit.com' || h === 'old.reddit.com' || h === 'np.reddit.com' || h === 'm.reddit.com') key = 'reddit';
  return { key, label: siteLabel(key) };
}

// The redirect menu: every non-empty site bucket, as [{ key, label, links }].
// The site the user just reached for (`priorityHost`) floats to the front, so
// the links most likely to answer the impulse are the ones they see first.
export function groupLinksBySite(lists, priorityHost = '') {
  const buckets = siteBuckets(lists);
  const priorityKey = priorityHost ? siteGroup(priorityHost).key : null;
  return buckets.sort((a, b) =>
    a.key === priorityKey ? -1 : b.key === priorityKey ? 1 : 0
  );
}

// --- Migration from the old topic folders --------------------------------
//
// Saves from before this change look like { currentTopic, topics: {name: [...]},
// cursor }. Topics are gone; every link is re-filed into the bucket for the site
// it actually lives on, dropping duplicates. Returns null when there is nothing
// to migrate, so the caller can avoid a pointless write.
export function migrateLists(stored) {
  if (!stored || typeof stored !== 'object') return null;
  if (!stored.topics) return null; // already the new shape

  const sites = { ...(stored.sites ?? {}) };
  const seen = new Set();
  for (const links of Object.values(sites)) {
    if (Array.isArray(links)) for (const l of links) seen.add(linkUrl(l));
  }

  for (const links of Object.values(stored.topics)) {
    if (!Array.isArray(links)) continue; // a corrupted topic — nothing to save
    for (const link of links) {
      const url = linkUrl(link);
      const key = siteKeyOf(url);
      if (!key || seen.has(url)) continue;
      seen.add(url);
      if (!Array.isArray(sites[key])) sites[key] = [];
      sites[key].push(typeof link === 'string' ? { url: link, title: '' } : link);
    }
  }
  return { sites, cursors: stored.cursors ?? {} };
}

// Tidy up a URL the user typed/pasted. Adds "https://" if they left off the
// scheme, and returns the canonical href. Returns null if it can't be a URL.
export function normalizeUrl(input) {
  const s = (input || '').trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : 'https://' + s;
  try {
    return new URL(withScheme).href;
  } catch {
    return null;
  }
}
