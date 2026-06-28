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

// Is this host one of the user's distracting sites?
// We match the exact domain OR any subdomain of it, so "m.youtube.com" and
// "youtube.com" both count when the list contains "youtube.com".
export function isDistracting(host, sites) {
  if (!host) return false;
  return sites.some((site) => host === site || host.endsWith('.' + site));
}

// Which entry in `sites` does this host belong to? Returns the matching site
// (e.g. "youtube.com" for a visit to "m.youtube.com"), or the host itself if
// none matched. Used so a freedom window is keyed to the whole site family.
export function matchingSite(host, sites) {
  if (!host) return host;
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

// The links saved under the topic we're currently exploring.
export function currentLinks(lists) {
  const topic = lists.currentTopic || 'General';
  return lists.topics[topic] ?? [];
}

// Pick the NEXT link to serve (sequential, like a to-do list) and return an
// updated `lists` with the cursor advanced. Pure: it does not save anything —
// the caller decides whether to persist the new lists. Wraps back to the start
// after the last link. Returns { link: null } when the topic has no links.
export function serveNextLink(lists) {
  const links = currentLinks(lists);
  if (links.length === 0) return { link: null, lists };
  const idx = (lists.cursor ?? 0) % links.length;
  return { link: links[idx], lists: { ...lists, cursor: idx + 1 } };
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
// topics. Membership tests on a Set are ~O(1) (hash-based), vs O(n) if we
// re-scanned the arrays on every navigation.
export function buildAllowedKeys(lists) {
  const keys = new Set();
  for (const links of Object.values(lists.topics ?? {})) {
    for (const link of links) {
      const k = canonicalKey(linkUrl(link));
      if (k) keys.add(k);
    }
  }
  return keys;
}

// --- Grouping for the redirect menu --------------------------------------
//
// The redirect landing page shows every saved link grouped by the SITE it
// belongs to, then by topic. These two helpers are pure (no storage), so they
// are easy to test and reuse.

// Fold a hostname into a friendly site "group". The big platforms have several
// domains (youtu.be, m.youtube.com, twitter.com) that all mean the same place,
// so we map them to one key + display label. Anything else groups under its own
// plain hostname.
export function siteGroup(host) {
  const h = (host || '').replace(/^www\./, '').toLowerCase();
  if (h === 'youtube.com' || h === 'youtu.be' || h === 'm.youtube.com' || h === 'music.youtube.com')
    return { key: 'youtube', label: 'YouTube' };
  if (h === 'instagram.com' || h === 'm.instagram.com')
    return { key: 'instagram', label: 'Instagram' };
  if (h === 'x.com' || h === 'twitter.com' || h === 'mobile.x.com' || h === 'mobile.twitter.com')
    return { key: 'x', label: 'X' };
  if (h === 'reddit.com' || h === 'old.reddit.com' || h === 'np.reddit.com' || h === 'm.reddit.com')
    return { key: 'reddit', label: 'Reddit' };
  return { key: h, label: h };
}

// Build the redirect menu from saved lists: links grouped by site, then topic.
// Returns: [ { key, label, topics: [ { topic, links: [...] } ] }, ... ].
// `priorityHost` (the site the user just reached for) is floated to the front
// when the user has saved links for it.
export function groupLinksBySite(lists, priorityHost = '') {
  const sites = new Map(); // key -> { key, label, topics: Map(topic -> links[]) }
  const topics = lists?.topics ?? {};
  for (const [topic, links] of Object.entries(topics)) {
    for (const link of links) {
      const host = hostnameOf(linkUrl(link));
      if (!host) continue;
      const { key, label } = siteGroup(host);
      if (!sites.has(key)) sites.set(key, { key, label, topics: new Map() });
      const entry = sites.get(key);
      if (!entry.topics.has(topic)) entry.topics.set(topic, []);
      entry.topics.get(topic).push(link);
    }
  }
  const result = [...sites.values()].map((s) => ({
    key: s.key,
    label: s.label,
    topics: [...s.topics.entries()].map(([topic, links]) => ({ topic, links })),
  }));
  // Float the site the user reached for to the front, if present.
  const priorityKey = siteGroup(priorityHost).key;
  result.sort((a, b) => (a.key === priorityKey ? -1 : b.key === priorityKey ? 1 : 0));
  return result;
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
