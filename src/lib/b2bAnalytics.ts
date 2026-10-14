const B2B_LANDING_PATH = '/pro-eshopy';
const PARTNER_REGISTER_PATH = '/partner/register';
const GA4_EVENT_NAME = 'b2b_partner_register_click';

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

export function initB2BAnalytics(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  const handleClick = (event: MouseEvent) => {
    if (window.location.pathname !== B2B_LANDING_PATH) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;

    const destination = new URL(anchor.href, window.location.origin);
    if (destination.origin !== window.location.origin) return;
    if (destination.pathname !== PARTNER_REGISTER_PATH) return;

    if (typeof window.gtag === 'function') {
      window.gtag('event', GA4_EVENT_NAME, {
        page_path: B2B_LANDING_PATH,
        link_url: `${destination.pathname}${destination.search}`,
        cta_text: normalizeText(anchor.textContent),
      });
    }
  };

  document.addEventListener('click', handleClick, true);

  return () => {
    document.removeEventListener('click', handleClick, true);
  };
}
