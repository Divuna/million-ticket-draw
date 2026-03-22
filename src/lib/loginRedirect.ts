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
