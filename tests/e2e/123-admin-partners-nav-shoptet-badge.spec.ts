import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Kontraktní test (statická kontrola zdroje) — počet čekajících Shoptet žádostí
 * musí být vidět přímo u položky "Partneři" v horní druhé admin navigaci
 * (AdminContextSubNav), ne jen uvnitř záložky "Shoptet žádosti" na /admin/partners.
 *
 * Žádný SQL, žádný deploy, žádná mutace dat — jen ověření zdrojového kódu.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const nav = read('src/components/admin/AdminContextSubNav.tsx');
const partnersPage = read('src/pages/AdminPartners.tsx');
// Načítání počtů se přesunulo do sdíleného hooku (refaktor hierarchických badge,
// 24. 08. 2026). Nav si výsledek už jen vykresluje, kontrola zdroje dat platí dál.
const counts = read('src/hooks/useAdminUsersPendingCounts.ts');

test.describe('123 — admin Partneři nav badge počítá čekající Shoptet žádosti', () => {
  test('nav has a pending Shoptet requests count from the same source as the Shoptet žádosti tab', () => {
    // Stejná tabulka a stejný filtr jako `shoptetRequests` v AdminPartners.tsx
    // (`.from("shoptet_connection_requests").eq("status", "submitted")`).
    expect(counts).toContain('pendingShoptetRequestsCount');
    expect(counts).toContain('"shoptet_connection_requests"');
    expect(counts).toContain('.eq("status", "submitted")');
  });

  test('Partneři badge combines partner registrations and Shoptet requests, without a second unrelated logic', () => {
    expect(nav).toContain('pendingPartnersNavCount');
    expect(counts).toContain('pendingPartnerRegistrationsCount + pendingShoptetRequestsCount');
    expect(nav).toMatch(/item\.path === "\/admin\/partners"\s*&&\s*pendingPartnersNavCount > 0/);
  });

  test('badge updates immediately after approve/reject via a shared event, plus polling fallback', () => {
    expect(counts).toContain('shoptet-requests-changed');
    expect(counts).toMatch(/addEventListener\("shoptet-requests-changed"/);
    expect(counts).toMatch(/setInterval\(loadPendingShoptetRequestsCount, 60_000\)/);

    // AdminPartners.tsx must fire the event after both admin actions succeed.
    expect(partnersPage).toMatch(
      /handleShoptetApprove[\s\S]*?await loadShoptetRequests\(\);\s*\n\s*window\.dispatchEvent\(new Event\("shoptet-requests-changed"\)\);/,
    );
    expect(partnersPage).toMatch(
      /handleShoptetReject[\s\S]*?await loadShoptetRequests\(\);\s*\n\s*window\.dispatchEvent\(new Event\("shoptet-requests-changed"\)\);/,
    );
  });

  test('existing Shoptet žádosti tab badge is untouched', () => {
    expect(partnersPage).toContain('shoptetRequests.length > 0');
    expect(partnersPage).toContain('{shoptetRequests.length}');
  });
});
