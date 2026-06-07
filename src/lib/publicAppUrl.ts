const PRODUCTION_APP_URL = 'https://onemil.cz';

function isUnsafePublicOrigin(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost') ||
    normalized.includes('lovable.app') ||
    normalized.includes('lovableproject.com') ||
    normalized.includes('preview--')
  );
}

export function getPublicAppUrl(): string {
  const configuredUrl = import.meta.env.VITE_APP_URL?.trim();

  if (!configuredUrl) {
    return PRODUCTION_APP_URL;
  }

  try {
    const parsed = new URL(configuredUrl);

    if (parsed.protocol !== 'https:' || isUnsafePublicOrigin(parsed.hostname)) {
      return PRODUCTION_APP_URL;
    }

    return parsed.origin.replace(/\/$/, '');
  } catch {
    return PRODUCTION_APP_URL;
  }
}

export function buildPublicUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${getPublicAppUrl()}${normalizedPath}`;
}
