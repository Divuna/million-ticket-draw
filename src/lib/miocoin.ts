/**
 * MioCoin — the one-decimal rule, shared front-end helpers.
 *
 * Confirmed OneMil business rule (ONEMIL_BUSINESS_CONTEXT.md §8.1):
 *   * a MioCoin value never carries more than ONE decimal place
 *   * the minimum issuable partner reward is 0.5 MC
 *   * a manually entered MioCoin setting must be >= 0.5 with at most 1 decimal,
 *     and an invalid value is REJECTED — 1.25 must never silently become 1.3
 *
 * IMPORTANT — this module contains NO reward maths.
 * The partner reward is calculated exclusively by `public.compute_partner_reward`,
 * which already applies the single rounding on the order total. Nothing here may
 * be used to derive, re-round or "correct" a reward the server returned; these are
 * input validators and display formatters only.
 *
 * `public/shoptet-widget.js` carries a deliberate copy of the formatting logic
 * because it is standalone vanilla JS served into a partner storefront and cannot
 * import from src/. Keep the two in sync.
 */

/** Minimum issuable partner reward. Mirrors public.miocoin_min_partner_reward_mc(). */
export const MIN_PARTNER_REWARD_MC = 0.5;

/** Smallest step a manually entered MioCoin value may use. */
export const MIOCOIN_STEP = 0.1;

/**
 * Rounds to one decimal place the same way `round(numeric, 1)` does in Postgres
 * for the positive-only MioCoin domain: half away from zero (4.95 → 5.0).
 *
 * The `+ Number.EPSILON` scaling guards the classic binary-float artefact where
 * `4.95 * 10` is `49.499999999999996` and would otherwise round down to 4.9.
 */
export function roundMioCoin(value: number): number {
  if (!Number.isFinite(value)) return NaN;
  const sign = value < 0 ? -1 : 1;
  const scaled = Math.abs(value) * 10;
  return (sign * Math.round(scaled + Number.EPSILON * scaled)) / 10;
}

/** True when the value is already expressible with at most one decimal place. */
export function hasAtMostOneDecimal(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  return Math.abs(value - roundMioCoin(value)) < 1e-9;
}

/**
 * Validates a value a partner typed into a MioCoin field (global conversion,
 * per-product fixed reward, per-product ratio reward).
 *
 * Returns a Czech error message, or `null` when the value is acceptable. The DB
 * CHECK constraints enforce the same rule server-side — this is the friendly
 * first line, not the authority.
 */
export function validateManualRewardMc(value: number): string | null {
  if (!Number.isFinite(value)) {
    return 'Zadejte platný počet MioCoinů.';
  }
  if (value < MIN_PARTNER_REWARD_MC) {
    return `Minimální odměna je ${formatMioCoinNumber(MIN_PARTNER_REWARD_MC)} MioCoinu.`;
  }
  if (!hasAtMostOneDecimal(value)) {
    return 'MioCoiny mohou mít nejvýše jedno desetinné místo (např. 0,5 nebo 1,2).';
  }
  return null;
}

/** Convenience boolean form of {@link validateManualRewardMc}. */
export function isValidManualRewardMc(value: number): boolean {
  return validateManualRewardMc(value) === null;
}

/**
 * Number part only, Czech style: decimal comma, at most one decimal, and no
 * pointless trailing ",0" on whole numbers (5 stays "5", 4.9 becomes "4,9").
 */
export function formatMioCoinNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = roundMioCoin(value);
  return rounded.toLocaleString('cs-CZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

/**
 * Czech declension of "MioCoin".
 *   1 → MioCoin · 2–4 → MioCoiny · 0 and 5+ → MioCoinů · any decimal → MioCoinu
 */
export function mioCoinPlural(value: number): string {
  const rounded = roundMioCoin(value);
  if (!Number.isInteger(rounded)) return 'MioCoinu';
  const n = Math.abs(rounded);
  if (n === 1) return 'MioCoin';
  if (n >= 2 && n <= 4) return 'MioCoiny';
  return 'MioCoinů';
}

/** Full display string: "0,6 MioCoinu", "1 MioCoin", "3 MioCoiny", "5 MioCoinů". */
export function formatMioCoin(value: number): string {
  return `${formatMioCoinNumber(value)} ${mioCoinPlural(value)}`;
}
