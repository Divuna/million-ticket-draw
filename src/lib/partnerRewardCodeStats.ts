/**
 * Partner dashboard "vydané / aktivované MioCoiny" aggregation.
 *
 * A `partner_reward_codes` row only represents a real, spendable entitlement
 * once it reaches `issued` (customer can redeem it) or `activated` (customer
 * already redeemed it). `pending` (order not yet eligible — no entitlement
 * exists yet) and `cancelled` (the order was cancelled/returned — the
 * entitlement never materialized) must never be counted as "vydané", or the
 * partner sees an inflated number that includes MioCoins nobody ever
 * received.
 *
 * This is the single source of truth for that rule — both the top-level
 * dashboard stats and the weekly report must call this, not re-implement the
 * filter, so the two can never drift apart again.
 */

const ISSUED_STATUSES = new Set(["issued", "activated"]);

/** True for `issued` and `activated` — the two statuses that represent a real entitlement. */
export function isIssuedRewardCodeStatus(status: string): boolean {
  return ISSUED_STATUSES.has(status);
}

export interface PartnerRewardCodeStatsInput {
  coins: number | string | null;
  status: string;
}

export interface PartnerRewardCodeStats {
  issuedCount: number;
  issuedCoins: number;
  activatedCount: number;
  activatedCoins: number;
}

/**
 * Aggregates a list of `partner_reward_codes` rows (any date range — the
 * caller pre-filters by period for weekly reports) into the four numbers the
 * partner dashboard shows.
 *
 * - `issuedCount`/`issuedCoins`  — status `issued` OR `activated` only.
 * - `activatedCount`/`activatedCoins` — status `activated` only (unchanged).
 */
export function aggregatePartnerRewardCodeStats(
  codes: PartnerRewardCodeStatsInput[],
): PartnerRewardCodeStats {
  let issuedCount = 0;
  let issuedCoins = 0;
  let activatedCount = 0;
  let activatedCoins = 0;

  for (const code of codes) {
    const coins = Number(code.coins || 0);

    if (isIssuedRewardCodeStatus(code.status)) {
      issuedCount += 1;
      issuedCoins += coins;
    }

    if (code.status === "activated") {
      activatedCount += 1;
      activatedCoins += coins;
    }
  }

  return { issuedCount, issuedCoins, activatedCount, activatedCoins };
}
