/** Central deny-list shared by every path that can discover or save a website. */
export const NON_OFFICIAL_WEBSITE_HOST_SUFFIXES = [
  "sluzby.cz", "firmy.cz", "zivefirmy.cz", "najisto.cz", "najisto.centrum.cz",
  "edb.cz", "detail.cz", "merk.cz", "kurzy.cz", "rejstrik-firem.kurzy.cz",
  "justice.cz", "or.justice.cz", "ares.gov.cz", "obchodnirejstrik.cz", "businessinfo.cz",
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "youtube.com", "youtu.be", "tiktok.com", "pinterest.com", "google.com",
  "google.cz", "goo.gl", "maps.app.goo.gl", "mapy.cz", "seznam.cz",
  "heureka.cz", "zbozi.cz", "glami.cz", "yelp.com", "foursquare.com",
  "wikipedia.org", "wikiwand.com", "duckduckgo.com", "bing.com",
  "mediar.cz", "mam.cz", "marketingsales.cz", "e15.cz", "idnes.cz",
  "novinky.cz", "seznamzpravy.cz", "aktualne.cz", "denik.cz", "forbes.cz",
  "hn.cz", "ihned.cz", "root.cz", "lupa.cz", "zive.cz", "cnews.cz",
  "penize.cz", "podnikatel.cz", "mesec.cz",
] as const;

export interface NonOfficialWebsiteMatch {
  host: string;
  matchedRule: string;
  reason: "non_official_third_party";
}

export function normalizedWebsiteHost(rawUrl: string): string | null {
  try {
    const value = rawUrl.trim();
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

export function nonOfficialWebsiteMatch(rawUrl: string): NonOfficialWebsiteMatch | null {
  const host = normalizedWebsiteHost(rawUrl);
  if (!host) return null;
  const matchedRule = NON_OFFICIAL_WEBSITE_HOST_SUFFIXES.find(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
  return matchedRule ? { host, matchedRule, reason: "non_official_third_party" } : null;
}

export function isNonOfficialWebsiteUrl(rawUrl: string): boolean {
  return nonOfficialWebsiteMatch(rawUrl) !== null;
}

export function registrableDomainOf(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  return labels.length <= 2 ? labels.join(".") : labels.slice(-2).join(".");
}
