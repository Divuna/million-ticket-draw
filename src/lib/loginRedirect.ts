/**
 * Safe redirect target after login (same-origin path only; prevents open redirects).
 */
export function getSafeRedirectPath(raw: string | null): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decoded)) return null;
  return decoded;
}

/** Login URL with ?redirect= current path (pathname + search). */
export function buildLoginRedirectUrl(pathnameAndSearch: string): string {
  const path = pathnameAndSearch.startsWith('/')
    ? pathnameAndSearch
    : `/${pathnameAndSearch}`;
  return `/login?redirect=${encodeURIComponent(path)}`;
}

/**
 * Register URL that forwards the affiliate `ref` query param, if present,
 * from the current location (e.g. homepage reached via the /i/:refCode
 * short link). Only `ref` is forwarded — a deliberate whitelist, not a
 * blind pass-through of the whole query string, so an unrelated param
 * (e.g. a `redirect` value) can never leak into the registration page.
 */
export function buildRegisterUrl(search: string): string {
  const ref = new URLSearchParams(search).get('ref')?.trim();
  if (!ref) return '/register';
  return `/register?ref=${encodeURIComponent(ref)}`;
}
