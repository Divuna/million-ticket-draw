/**
 * Spec 167 — partner dashboard "vydané" MioCoiny počítají jen reálný nárok
 *
 * Řeší nález z auditu partnerského účtu: `PartnerDashboard.tsx` počítal
 * `totalIssued`/`totalIssuedCoins` (a stejnou chybou i týdenní
 * `issued_count`/`issued_coins`) jako součet PŘES VŠECHNY stavy
 * `partner_reward_codes`, včetně `pending` (nárok ještě nevznikl) a
 * `cancelled` (nárok nikdy nevznikl). Partner tak viděl nafouknuté číslo,
 * které zahrnovalo MioCoiny, které žádný zákazník nikdy nedostal.
 *
 * Oprava: `src/lib/partnerRewardCodeStats.ts` — jediný zdroj pravdy pro
 * "vydané" (status `issued` NEBO `activated`) a "aktivované" (jen
 * `activated`), sdílený mezi celkovými statistikami i týdenním přehledem.
 *
 * Toto je statický unit test čisté funkce — neběží proti databázi, nemění
 * fakturaci, reward engine, Shoptet import ani žádná produkční data.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  aggregatePartnerRewardCodeStats,
  isIssuedRewardCodeStatus,
} from '../../src/lib/partnerRewardCodeStats';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test.describe('167 partnerReward code stats — issued/activated aggregation', () => {
  test('167a směs issued/activated/pending/cancelled — vydané počítá jen issued+activated', () => {
    const codes = [
      { coins: 10, status: 'issued' },
      { coins: 20, status: 'activated' },
      { coins: 30, status: 'pending' },
      { coins: 40, status: 'cancelled' },
    ];

    const result = aggregatePartnerRewardCodeStats(codes);

    // Vydané: jen issued (10) + activated (20) = 30, počet 2.
    expect(result.issuedCount).toBe(2);
    expect(result.issuedCoins).toBe(30);

    // Aktivované: beze změny, jen skutečně aktivované.
    expect(result.activatedCount).toBe(1);
    expect(result.activatedCoins).toBe(20);
  });

  test('167b pending a cancelled samotné nedají žádné vydané ani aktivované', () => {
    const codes = [
      { coins: 100, status: 'pending' },
      { coins: 200, status: 'cancelled' },
    ];

    const result = aggregatePartnerRewardCodeStats(codes);

    expect(result.issuedCount).toBe(0);
    expect(result.issuedCoins).toBe(0);
    expect(result.activatedCount).toBe(0);
    expect(result.activatedCoins).toBe(0);
  });

  test('167c prázdný seznam vrátí samé nuly', () => {
    const result = aggregatePartnerRewardCodeStats([]);
    expect(result).toEqual({
      issuedCount: 0,
      issuedCoins: 0,
      activatedCount: 0,
      activatedCoins: 0,
    });
  });

  test('167d coins jako string (PostgREST numeric) se sčítá číselně, ne zřetězením', () => {
    // PostgREST vrací `numeric` jako string — sčítání bez Number() by dalo "1020".
    const codes = [
      { coins: '10' as unknown as number, status: 'issued' },
      { coins: '20' as unknown as number, status: 'activated' },
    ];

    const result = aggregatePartnerRewardCodeStats(codes);

    expect(result.issuedCoins).toBe(30);
    expect(result.activatedCoins).toBe(20);
  });

  test('167e isIssuedRewardCodeStatus — přesně issued a activated, nic jiného', () => {
    expect(isIssuedRewardCodeStatus('issued')).toBe(true);
    expect(isIssuedRewardCodeStatus('activated')).toBe(true);
    expect(isIssuedRewardCodeStatus('pending')).toBe(false);
    expect(isIssuedRewardCodeStatus('cancelled')).toBe(false);
    expect(isIssuedRewardCodeStatus('expired')).toBe(false);
  });

  test('167f týdenní report v PartnerDashboard.tsx používá stejnou funkci, ne vlastní filtr', () => {
    const page = read('src/pages/PartnerDashboard.tsx');

    // Import sdíleného zdroje pravdy.
    expect(page).toContain("aggregatePartnerRewardCodeStats } from '@/lib/partnerRewardCodeStats'");

    // Týdenní blok musí volat stejnou funkci nad weekCodes.
    const weeklyBlockStart = page.indexOf('Generate weekly reports for last 4 weeks');
    expect(weeklyBlockStart).toBeGreaterThan(-1);
    const weeklyBlock = page.slice(weeklyBlockStart, weeklyBlockStart + 800);
    expect(weeklyBlock).toContain('aggregatePartnerRewardCodeStats(weekCodes)');

    // Stará chyba se nesmí vrátit: žádné .length / plošný .reduce přes
    // weekCodes/codesData bez filtru na stav.
    expect(page).not.toMatch(/weekCodes\.length/);
    expect(page).not.toMatch(/codesData\.length/);
  });
});
