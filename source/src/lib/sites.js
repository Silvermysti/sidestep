export function hostnameOf(urlString) {
  try {
    return new URL(urlString).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function siteToBlock(host) {
  if (!host) return host;
  return host.replace(/^(?:www|m|mobile)\./i, '').toLowerCase();
}

export function isDistracting(host, sites) {
  if (!host || !Array.isArray(sites)) return false;
  return sites.some((site) => host === site || host.endsWith('.' + site));
}

export function matchingSite(host, sites) {
  if (!host || !Array.isArray(sites)) return host;
  return sites.find((site) => host === site || host.endsWith('.' + site)) ?? host;
}

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
