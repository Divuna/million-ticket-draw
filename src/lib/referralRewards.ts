/**
 * Čistá (skutečně zbývající) odměna za osobní doporučení.
 *
 * Odměna může být po refundaci doporučeného stornována celá (`reversed`) nebo
 * poměrně (`partially_reversed`); `reversal_target_mc` je součet stornovaných MIO.
 * Do součtů se proto nikdy nepočítá původní hrubá `reward_mc`, ale
 * `reward_mc − reversal_target_mc`. Blokované a plně stornované odměny = 0.
 */
export type ReferralRewardAmounts = {
  reward_mc: number | string | null;
  reversal_target_mc?: number | string | null;
  status: string;
};

export const COUNTED_REFERRAL_REWARD_STATUSES = ['earned', 'partially_reversed'] as const;

const roundMio = (value: number) => Math.round(value * 10) / 10;

export function isCountedReferralReward(reward: Pick<ReferralRewardAmounts, 'status'>): boolean {
  return (COUNTED_REFERRAL_REWARD_STATUSES as readonly string[]).includes(reward.status);
}

export function netReferralReward(reward: ReferralRewardAmounts): number {
  if (!isCountedReferralReward(reward)) return 0;
  const gross = Number(reward.reward_mc ?? 0);
  const reversed = Number(reward.reversal_target_mc ?? 0);
  return Math.max(0, roundMio(gross - reversed));
}

export function sumNetReferralRewards(rewards: ReferralRewardAmounts[]): number {
  return roundMio(rewards.reduce((sum, reward) => sum + netReferralReward(reward), 0));
}

export type ReferralKpiReward = ReferralRewardAmounts & {
  referrer_user_id: string | null;
  referred_user_id: string | null;
};

/** KPI admin dashboardu nad čistými částkami. */
export function referralKpis(rewards: ReferralKpiReward[]) {
  const counted = rewards.filter((reward) => isCountedReferralReward(reward) && netReferralReward(reward) > 0);
  const totalMC = sumNetReferralRewards(counted);
  const referrers = new Set<string>();
  const payingReferred = new Set<string>();
  for (const reward of counted) {
    if (reward.referrer_user_id) referrers.add(reward.referrer_user_id);
    if (reward.referred_user_id) payingReferred.add(reward.referred_user_id);
  }
  return {
    totalMC,
    referrerCount: referrers.size,
    payingReferred: payingReferred.size,
    avgMC: referrers.size > 0 ? roundMio(totalMC / referrers.size) : 0,
  };
}
