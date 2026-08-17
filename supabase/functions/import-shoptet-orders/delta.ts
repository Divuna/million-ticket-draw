// Delta (incremental) fetch support for import-shoptet-orders.
//
// Pure, dependency-free helpers so they run unchanged in Deno (the Edge Function)
// and can be imported directly by the Playwright specs. There must be exactly one
// implementation — never re-implement this logic in a test fixture.
//
// ── Why ──────────────────────────────────────────────────────────────────────
// Until now every scheduled run downloaded the partner's ENTIRE order export.
// That is why the cron could only run every 15 minutes. Shoptet's permanent order
// export accepts an `updateTimeFrom` parameter that limits the export to orders
// created or changed since a given time, and Shoptet's own documentation states:
//
//   "Pokud stahujete objednávky více než jednou za 15 minut, lze využít pouze
//    tento způsob stažení objednávek."
//   (podpora.shoptet.cz/export-objednavek/)
//
// So `updateTimeFrom` is not merely an optimisation — it is the supported way to
// poll faster than every 15 minutes.
//
// Documented formats: `YYYY-MM-DD` or `YYYY-MM-DD HH:MM:SS`. We always send the
// precise form.
//
// ── Timezone: why we send UTC ────────────────────────────────────────────────
// Shoptet does NOT document which timezone `updateTimeFrom` is interpreted in.
// That ambiguity is only dangerous in one direction, so we pick the value that is
// safe under BOTH readings. Our timestamps are UTC; Czech local time is UTC+1/+2.
//
//   * We send UTC and Shoptet reads UTC   → exact window. Correct.
//   * We send UTC and Shoptet reads local → the cutoff lands 1–2 h EARLIER than
//     intended, so we fetch a little extra. Harmless: re-reading an order is
//     idempotent (create_partner_order_reward dedups on external_order_id).
//
// Sending Czech local time would invert this: under a UTC reading the cutoff would
// land 1–2 h in the FUTURE and we would silently miss orders. Over-fetching is
// recoverable, under-fetching loses rewards — so UTC it is.
export const DELTA_OVERLAP_MINUTES = 15;

/** Formats a Date as Shoptet's `YYYY-MM-DD HH:MM:SS`, in UTC (see note above). */
export function formatShoptetUpdateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
}

/**
 * Computes the `updateTimeFrom` cutoff from the last safely-completed live import.
 *
 * `lastOkStartedAt` must be the **started_at** of the most recent live run that
 * finished with status 'ok' — never finished_at. An order changed while that run
 * was mid-flight may or may not have made it into its export snapshot, so anchoring
 * on started_at guarantees such an order is re-offered on the next run.
 *
 * Returns null when the partner has no successful live run yet. The caller then
 * omits the parameter entirely and downloads the full export, exactly as before —
 * so a brand-new partner can never skip older orders.
 */
export function computeDeltaFrom(
  lastOkStartedAt: string | null | undefined,
  overlapMinutes: number = DELTA_OVERLAP_MINUTES,
): Date | null {
  if (!lastOkStartedAt) return null;
  const t = Date.parse(lastOkStartedAt);
  if (!Number.isFinite(t)) return null; // unparseable → fall back to a full export
  return new Date(t - overlapMinutes * 60 * 1000);
}

/**
 * Appends (or replaces) `updateTimeFrom` on a Shoptet permanent export URL.
 *
 * Deliberately string-based rather than going through `new URL()` /
 * `URLSearchParams`. Round-tripping through URLSearchParams re-encodes the whole
 * query string — a '+' inside a signature would come back as '%20' and a '='
 * would be re-escaped — which would corrupt the permanent link's `hash`. Editing
 * the raw string leaves `patternId`, `partnerId` and `hash` byte-for-byte intact.
 */
export function withUpdateTimeFrom(rawUrl: string, from: Date): string {
  const value = encodeURIComponent(formatShoptetUpdateTime(from));

  // Keep the parameter in the query, never after a '#'.
  const hashIdx = rawUrl.indexOf("#");
  const base = hashIdx >= 0 ? rawUrl.slice(0, hashIdx) : rawUrl;
  const fragment = hashIdx >= 0 ? rawUrl.slice(hashIdx) : "";

  // If the stored URL already carries the parameter (e.g. a partner pasted one),
  // overwrite it in place instead of appending a second, ambiguous copy.
  const existing = /([?&])updateTimeFrom=[^&]*/i;
  if (existing.test(base)) {
    // Function replacer so a '$' in the value can never be read as a backreference.
    return base.replace(existing, (_m, lead: string) => `${lead}updateTimeFrom=${value}`) + fragment;
  }

  const qIdx = base.indexOf("?");
  const sep = qIdx < 0 ? "?" : base.endsWith("?") || base.endsWith("&") ? "" : "&";
  return `${base}${sep}updateTimeFrom=${value}${fragment}`;
}
