// URL + SITE RULES — pure functions, no side effects.
//
// Same idea as timer.js: given the same input these always return the same
// output and never touch storage or the browser. The background script uses
// them to decide "is this a distracting site?" and "does it have a freedom
// window right now?"; the popup uses them to clean up typed hostnames.

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
