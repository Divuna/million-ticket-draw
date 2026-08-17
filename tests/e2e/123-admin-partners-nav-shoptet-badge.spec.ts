import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Kontraktní test nového Shoptet self-service flow:
 * partner se ručně schvaluje jen jednou. Schválený partner pak připojí Shoptet
 * samoobslužně; export se technicky ověří a při úspěchu se napojení aktivuje
 * rovnou bez druhého admin schválení.
 *
 * Žádný SQL, žádný deploy, žádná mutace dat — jen ověření zdrojového kódu.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const nav = read('src/components/admin/AdminContextSubNav.tsx');
const partnersPage = read('src/pages/AdminPartners.tsx');
const submitFn = read('supabase/functions/submit-shoptet-connection/index.ts');
const importerParserFacade = read('supabase/functions/import-shoptet-orders/csv.ts');
const sharedParser = read('supabase/functions/_shared/shoptetCsv.ts');

test.describe('123 — Shoptet se po technické validaci aktivuje bez druhého admin schválení', () => {
  test('admin navigace už nepočítá čekající Shoptet žádosti', () => {
    expect(nav).not.toContain('pendingShoptetRequestsCount');
    expect(nav).not.toContain('shoptet-requests-changed');
    expect(nav).not.toContain('"shoptet_connection_requests"');
    expect(nav).toContain('const pendingPartnersNavCount = pendingPartnerRegistrationsCount;');
  });

  test('admin Partneři už nemá Shoptet approval tab ani approve/reject caller', () => {
    expect(partnersPage).not.toContain('Shoptet žádosti');
    expect(partnersPage).not.toContain('handleShoptetApprove');
    expect(partnersPage).not.toContain('handleShoptetReject');
    expect(partnersPage).not.toContain('approve-shoptet-connection');
    expect(partnersPage).not.toContain('shoptetRequests');
  });

  test('submit endpoint vyžaduje schváleného partnera a používá jediný sdílený CSV parser', () => {
    expect(submitFn).toContain('partner.status !== "approved"');
    expect(submitFn).toContain('parseShoptetCsv');
    expect(submitFn).toContain('../_shared/shoptetCsv.ts');
    expect(submitFn).toContain('probeExportUrl');
    expect(importerParserFacade).toContain('export * from "../_shared/shoptetCsv.ts"');
    expect(sharedParser).toContain('export function parseShoptetCsv');
  });

  test('po validaci endpoint aktivuje Vault + partnera + request bez mezistavu submitted', () => {
    expect(submitFn).toContain('store_shoptet_pending_url');
    expect(submitFn).toContain('promote_shoptet_pending_url');
    expect(submitFn).toContain('shoptet_customer_delivery: "onemil"');
    expect(submitFn).toContain('shoptet_import_enabled: true');
    expect(submitFn).toContain('status: "active"');
    expect(submitFn).not.toContain('status: "submitted"');
  });

  test('aktivace sama nespouští live import ani nevydává MioCoin odměny', () => {
    expect(submitFn).not.toContain('create_partner_order_reward');
    expect(submitFn).not.toContain('update_partner_order_reward_status');
    expect(submitFn).not.toContain('mode: "live"');
  });

  test('chybný export končí před Vault store a vrací konkrétní chyby', () => {
    const probePos = submitFn.indexOf('const probe = await probeExportUrl(url)');
    const storePos = submitFn.indexOf('store_shoptet_pending_url');
    expect(probePos).toBeGreaterThan(0);
    expect(storePos).toBeGreaterThan(probePos);
    expect(submitFn).toContain('export_url_unreachable');
    expect(submitFn).toContain('export_invalid_format');
    expect(submitFn).toContain('export_empty');
    expect(submitFn).toContain('export_too_large');
  });
});
