const ATLASSIAN_SITE_URL_KEY = "qaira.atlassian_site_url";

function normalizeAtlassianSiteUrl(value?: string | null) {
  const candidate = String(value || "").trim();
  if (!candidate) return "";

  try {
    const url = new URL(candidate);
    if (!url.hostname.endsWith(".atlassian.net")) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function rememberAtlassianSiteUrl(value?: string | null) {
  const siteUrl = normalizeAtlassianSiteUrl(value);
  if (!siteUrl || typeof window === "undefined") return;
  window.localStorage.setItem(ATLASSIAN_SITE_URL_KEY, siteUrl);
}

export function readAtlassianSiteUrl() {
  if (typeof window === "undefined") return "";

  const stored = normalizeAtlassianSiteUrl(window.localStorage.getItem(ATLASSIAN_SITE_URL_KEY));
  if (stored) return stored;

  const ancestorOrigins = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  const candidates = [
    ...(ancestorOrigins ? Array.from(ancestorOrigins) : []),
    window.location.origin
  ];
  const embeddedSiteUrl = candidates.map(normalizeAtlassianSiteUrl).find(Boolean) || "";
  if (embeddedSiteUrl) rememberAtlassianSiteUrl(embeddedSiteUrl);
  return embeddedSiteUrl;
}

export function getJiraBrowseUrl(issueKey?: string | null, preferredUrl?: string | null) {
  const key = String(issueKey || "").trim();
  if (!key) return null;

  const preferredSiteUrl = normalizeAtlassianSiteUrl(preferredUrl);
  const siteUrl = preferredSiteUrl || readAtlassianSiteUrl();
  return siteUrl ? `${siteUrl}/browse/${encodeURIComponent(key)}` : null;
}
