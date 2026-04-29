// Cookie consent + dynamic loader for GTM (which loads GA4 and Meta Pixel
// downstream). No tracking scripts run before the user grants consent.

export const CONSENT_STORAGE_KEY = 'cookie_consent';
export const CONSENT_OPEN_EVENT = 'cookie-consent:open';
export const CONSENT_CHANGE_EVENT = 'cookie-consent:change';

const GTM_ID = 'GTM-MK25MC9P';

export type Consent = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer: unknown[];
    __gtmLoaded?: boolean;
    fbq?: ((...args: unknown[]) => void) & { loaded?: boolean };
    __fbPixelInitialized?: boolean;
  }
}

const META_PIXEL_ID = '1412172897183369';

function initMetaPixelOnce() {
  if (typeof window === 'undefined') return;
  if (window.__fbPixelInitialized) return;
  if (typeof window.fbq !== 'function') return;
  window.__fbPixelInitialized = true;
  window.fbq('init', META_PIXEL_ID);
  window.fbq('track', 'PageView');
}

export function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Consent) : null;
  } catch {
    return null;
  }
}

function loadGtmOnce() {
  if (typeof window === 'undefined') return;
  if (window.__gtmLoaded) return;
  window.__gtmLoaded = true;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(s);

  // noscript fallback (in body, per HTML5 rules)
  const ns = document.createElement('noscript');
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${GTM_ID}`;
  iframe.height = '0';
  iframe.width = '0';
  iframe.style.display = 'none';
  iframe.style.visibility = 'hidden';
  ns.appendChild(iframe);
  document.body.appendChild(ns);
}

export function applyConsent(c: Consent) {
  try {
    window.dataLayer = window.dataLayer || [];

    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        ad_storage: c.marketing ? 'granted' : 'denied',
        ad_user_data: c.marketing ? 'granted' : 'denied',
        ad_personalization: c.marketing ? 'granted' : 'denied',
        analytics_storage: c.analytics ? 'granted' : 'denied',
      });
    }

    window.dataLayer.push({
      event: 'cookie_consent_update',
      consent_analytics: c.analytics,
      consent_marketing: c.marketing,
    });

    // Inject GTM only when at least one tracking category is granted.
    if (c.analytics || c.marketing) {
      loadGtmOnce();
    }
  } catch (e) {
    console.error('[consent] applyConsent failed', e);
  }
}

export function saveConsent(c: Consent) {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(c));
  } catch (e) {
    console.error('[consent] save failed', e);
  }
  applyConsent(c);
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: c }));
  } catch {
    // ignore
  }
}

export function openConsentSettings() {
  try {
    window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
  } catch {
    // ignore
  }
}
