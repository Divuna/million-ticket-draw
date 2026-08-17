import { buildPublicUrl } from '@/lib/publicAppUrl';

/**
 * The embed snippet a partner pastes into Shoptet → Vzhled a obsah → Editor HTML kódu.
 *
 * The format is NOT invented here — it is the one `public/shoptet-widget.js` already
 * documents and reads at runtime:
 *
 *   <script src="https://onemil.cz/shoptet-widget.js"
 *           data-onemil-partner="PARTNER-UUID" defer></script>
 *
 * The widget does `script.getAttribute('data-onemil-partner')` and bails out if it is
 * missing, so `data-onemil-partner` is the single identifier and it carries the plain
 * `partners.id`. There is deliberately no second id, no token and no per-shop key: the
 * partner id is a public identifier, and the preview endpoint it reaches only ever
 * returns the reward for a basket the customer is already looking at.
 *
 * The point of generating this in the dashboard is that the partner never has to find
 * their own id — pasting a wrong uuid would quote them someone else's rate.
 */

export const SHOPTET_WIDGET_PATH = '/shoptet-widget.js';

/** The public URL the storefront loads the widget from. */
export function getShoptetWidgetSrc(): string {
  // buildPublicUrl refuses localhost/preview origins and falls back to onemil.cz, so a
  // snippet copied out of a preview build still points at production — a partner must
  // never be handed a storefront tag aimed at a preview host.
  return buildPublicUrl(SHOPTET_WIDGET_PATH);
}

/**
 * Returns the ready-to-paste snippet, or null when there is no partner id to embed.
 * Null (rather than a snippet with an empty attribute) keeps a half-built tag off the
 * screen: the widget treats a missing id as "do nothing", so it would fail silently in
 * the partner's live shop.
 */
export function buildShoptetWidgetSnippet(partnerId: string | null | undefined): string | null {
  const id = (partnerId ?? '').trim();
  if (!id) return null;

  return `<script src="${getShoptetWidgetSrc()}" data-onemil-partner="${id}" defer></script>`;
}
