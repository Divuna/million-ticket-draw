/**
 * Spec 193 — čistá odměna za doporučení a KPI admin dashboardu (bez sítě).
 *
 * AdminReferralDashboard, AdminReferrals i zákaznický ReferralSection počítají
 * přes `src/lib/referralRewards.ts`. Částečně stornovaná odměna se musí
 * započítat jen v části, která zůstala; plně stornovaná a blokovaná = 0.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  netReferralReward,
  referralKpis,
  sumNetReferralRewards,
} from '../../src/lib/referralRewards';

const r = (reward_mc: number, reversal_target_mc: number, status: string, referrer = 'A', referred = 'X') => ({
  reward_mc, reversal_target_mc, status, referrer_user_id: referrer, referred_user_id: referred,
});

test.describe('193 čistá odměna za doporučení a KPI', () => {
  test('193a: čistá částka podle stavu', () => {
    expect(netReferralReward(r(15, 0, 'earned'))).toBe(15);
    expect(netReferralReward(r(15, 5, 'partially_reversed'))).toBe(10);
    expect(netReferralReward(r(15, 15, 'reversed'))).toBe(0);
    expect(netReferralReward(r(15, 0, 'blocked'))).toBe(0);
    expect(netReferralReward(r(5, 1.7, 'partially_reversed'))).toBe(3.3);
  });

  test('193b: KPI nepočítá hrubou částku částečně stornované odměny', () => {
    const rows = [
      r(15, 0, 'earned', 'A', 'B'),            // 15
      r(15, 5, 'partially_reversed', 'A', 'E'), // 10
      r(15, 5, 'partially_reversed', 'A', 'E'), // 10 (bonus téže platby)
      r(25, 25, 'reversed', 'A', 'B'),          // 0
      r(15, 0, 'blocked', 'H', 'I'),            // 0
      r(7.5, 0, 'earned', 'H', 'L'),            // 7,5
    ];
    const kpis = referralKpis(rows);
    expect(kpis.totalMC).toBe(42.5);
    expect(kpis.referrerCount).toBe(2);
    expect(kpis.payingReferred).toBe(3);
    expect(kpis.avgMC).toBe(21.3);
    expect(sumNetReferralRewards(rows)).toBe(42.5);
  });

  test('193c: dashboard i přehledy používají čistý výpočet', () => {
    const dashboard = readFileSync('src/pages/AdminReferralDashboard.tsx', 'utf8');
    expect(dashboard).toContain('referralKpis(rewards)');
    expect(dashboard).toContain('reversal_target_mc');
    expect(dashboard).not.toMatch(/r\.status === 'earned'/);

    const adminReferrals = readFileSync('src/pages/AdminReferrals.tsx', 'utf8');
    expect(adminReferrals).toContain('netReferralReward(rw)');
    expect(adminReferrals).toContain('sumNetReferralRewards(detailRewards)');

    const customer = readFileSync('src/components/ReferralSection.tsx', 'utf8');
    expect(customer).toContain('sumNetReferralRewards(');
    expect(customer).toContain('reversal_target_mc');
  });

  test('193d: migrace drží finální pravidla Fáze 5', () => {
    const sql = readFileSync('supabase/migrations/20260925100000_phase5_player_referral_rewards.sql', 'utf8');
    // Poměrné storno obou typů odměn z kumulativního podílu, max. 1 desetinné místo.
    expect(sql).toContain('round(r.reward_mc * v_cum, 1)');
    expect(sql).not.toMatch(/case when v_frac >= 1 then r\.reward_mc else 0 end/);
    // Pohledávka + umoření z budoucích odměn + auditní stopa.
    expect(sql).toContain('create table if not exists public.referral_shortfalls');
    expect(sql).toContain('create table if not exists public.referral_shortfall_repayments');
    expect(sql).toContain("'referral_shortfall_release'");
    // Připsání jen centrální lot cestou, nikdy try_credit_wallet_mc.
    expect(sql).toContain('public.wallet_credit_lot(');
    expect(sql).not.toMatch(/perform public\.try_credit_wallet_mc|select public\.try_credit_wallet_mc/);
  });
});
