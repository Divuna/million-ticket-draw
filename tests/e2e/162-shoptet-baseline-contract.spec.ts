/**
 * Spec 162 — Shoptet baseline: statický kontrakt (issue #289, část C)
 *
 * Spec 161 ověřuje chování proti stagingu. Tenhle spec hlídá, aby schválená
 * pravidla nezmizela ze zdrojáku — běží bez sítě, databáze i secretů, takže
 * chytí regresi i v běhu, kde staging není k dispozici.
 *
 * Zamyká:
 *   - baseline tabulka je interní (RLS bez policy, jen service_role),
 *   - ukládá se jen číslo objednávky, žádná zákaznická data,
 *   - `verify-shoptet-connection` nic nevydává,
 *   - aktivace nového napojení vyžaduje ověření,
 *   - baseline se aktivuje DŘÍV, než se zapne import,
 *   - importer baseline objednávku přeskočí a neztratí o ní auditní stopu,
 *   - stávající napojení se nikde nepřevádějí na baseline režim.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260907090000_shoptet_connection_baseline_orders.sql');
const verifyFn  = read('supabase/functions/verify-shoptet-connection/index.ts');
const approveFn = read('supabase/functions/approve-shoptet-connection/index.ts');
const importFn  = read('supabase/functions/import-shoptet-orders/index.ts');
const snapshotLib = read('supabase/functions/_shared/shoptetExportSnapshot.ts');
const config    = read('supabase/config.toml');

/** Kód bez komentářů — aby vysvětlující text nemohl splnit ani porušit assertion. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

test.describe('162 — Shoptet baseline kontrakt', () => {
  test('migrace zakládá baseline jako interní tabulku bez přístupu klienta', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.shoptet_connection_baseline_orders');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.shoptet_connection_baseline_orders FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT ALL ON TABLE public.shoptet_connection_baseline_orders TO service_role');
    // Žádná policy → deny-all pro anon i authenticated.
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]{0,120}shoptet_connection_baseline_orders/i);
  });

  test('baseline drží jen číslo objednávky, žádná zákaznická data', () => {
    const table = migration.slice(
      migration.indexOf('CREATE TABLE IF NOT EXISTS public.shoptet_connection_baseline_orders'),
      migration.indexOf('COMMENT ON TABLE public.shoptet_connection_baseline_orders'),
    );
    expect(table).toContain('external_order_id text NOT NULL');
    expect(table).not.toMatch(/email|customer|jmeno|name|phone|total|amount|price/i);
  });

  test('pending URL smí číst jen service_role', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_shoptet_pending_url(p_request_id uuid)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_shoptet_pending_url(uuid) FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_shoptet_pending_url(uuid) TO service_role');
  });

  test('migrace nesahá na odměny, peněženky, platby ani na stávající partnery', () => {
    const sql = codeOnly(migration).replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/\bUPDATE\s+public\.partners\b/i);
    expect(sql).not.toMatch(/\bINSERT\s+INTO\s+public\.shoptet_connection_baseline_orders\b/i); // žádný backfill
    expect(sql).not.toMatch(/wallets|payments|partner_reward_codes|partner_invoice|contests|tickets/i);
    expect(sql).not.toMatch(/\bcompute_partner_reward\b|\bcreate_partner_order_reward\b/i);
  });

  test('verify EF nic nevydává a nevrací nic tajného', () => {
    const code = codeOnly(verifyFn);
    // Žádná cesta k vydání odměny, kódu, e-mailu ani fakturace.
    expect(code).not.toContain('create_partner_order_reward');
    expect(code).not.toContain('schedule_shoptet_partner_reward_status');
    expect(code).not.toContain('update_partner_order_reward_status');
    expect(code).not.toContain('email_queue');
    expect(code).not.toContain('partner_reward_codes');
    expect(code).not.toContain('partner_invoice');
    // Zapisuje výhradně baseline a razítko ověření — žádná jiná tabulka.
    const writes = [...code.matchAll(/\.from\("([a-z_]+)"\)[\s\S]{0,40}?\.(insert|update|delete|upsert)\(/g)]
      .map((m) => m[1]);
    expect(writes.length).toBeGreaterThan(0);
    expect([...new Set(writes)].sort()).toEqual([
      'shoptet_connection_baseline_orders',
      'shoptet_connection_requests',
    ]);
    // URL se nikdy neloguje. Řetězcové literály se odstraní, aby text hlášky
    // („pending url unavailable") nebyl zaměněn za logování samotné proměnné.
    const withoutStrings = code.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
    expect(withoutStrings).not.toMatch(/console\.(log|info|warn|error)\([^)]*\burl\b/);
    // A nevrací se ani klientovi.
    expect(code).not.toMatch(/\burl\b\s*,?\s*\n?\s*\}\)/);
  });

  test('verify EF je jen pro vlastní odeslanou žádost o první napojení', () => {
    expect(verifyFn).toContain('.eq("partner_id", partner.id)');
    expect(verifyFn).toContain('.eq("status", "submitted")');
    expect(verifyFn).toContain('.eq("request_kind", "initial")');
    expect(config).toContain('[functions.verify-shoptet-connection]');
  });

  test('aktivace nového napojení vyžaduje úspěšné ověření', () => {
    expect(approveFn).toContain('verification_required');
    expect(approveFn).toMatch(
      /action === "approve" && requestKind === "initial" && !scr\.verified_at/,
    );
    // url_change běží nad živým napojením a ověření vyžadovat nesmí.
    expect(approveFn).not.toMatch(/requestKind === "url_change"[\s\S]{0,200}verification_required/);
  });

  test('závaznou baseline pořizuje až schválení, z čerstvého snímku exportu', () => {
    // Mezi partnerským ověřením a schválením může přibýt další objednávka. Ta
    // existovala před aktivací, takže baseline nesmí být jen kopie toho, co
    // vidělo ověření.
    expect(approveFn).toContain('snapshotShoptetExport(pendingUrl)');
    expect(approveFn).toContain('approvalSnapshot.orderIds.map');
    // Předběžná sada z ověření se zahodí a nahradí aktuální.
    expect(approveFn).toMatch(
      /\.from\("shoptet_connection_baseline_orders"\)\s*\n\s*\.delete\(\)\s*\n\s*\.eq\("request_id", request_id\)/,
    );
    // Snímek běží PŘED promote, aby neúspěch nesnědl pending Vault klíč.
    const snapshotAt = approveFn.indexOf('snapshotShoptetExport(pendingUrl)');
    const promoteAt = approveFn.indexOf('promote_shoptet_pending_url", {\n      p_request_id: request_id,\n      p_partner_id: scr.partner_id,\n    });\n    if (promoteErr) {\n      console.error("vault promote:');
    expect(snapshotAt).toBeGreaterThan(-1);
    expect(promoteAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeLessThan(promoteAt);
  });

  test('nepoužitelný export zastaví schválení fail-closed', () => {
    expect(approveFn).toContain('export_not_usable');
    expect(approveFn).toMatch(/if \(!snapshot\.usable\)[\s\S]{0,400}return err\(\s*409/);
    // Odmítnutí musí přijít dřív, než se zapne import.
    const refuseAt = approveFn.indexOf('export_not_usable');
    const enableAt = approveFn.indexOf('shoptet_import_enabled: true');
    expect(refuseAt).toBeLessThan(enableAt);
  });

  test('snapshot je fail-closed i pro neplatné řádky a prázdný export', () => {
    for (const reason of ['invalid_rows', 'no_usable_rows', 'export_empty', 'missing_headers', 'export_unreachable', 'export_http_error']) {
      expect(snapshotLib, reason).toContain(`fail("${reason}"`);
    }
    // Jediný neplatný řádek stačí — nevíme pak, co v exportu je.
    expect(snapshotLib).toMatch(/if \(rowsInvalid > 0\)[\s\S]{0,200}fail\("invalid_rows"/);
    // Ven jde jen seznam čísel objednávek a počty — žádná zákaznická data.
    const returnedType = snapshotLib.slice(
      snapshotLib.indexOf('export type ExportSnapshot'),
      snapshotLib.indexOf('const fail ='),
    );
    expect(returnedType).toContain('orderIds: string[]');
    // Kontrolují se názvy POLÍ, ne výskyt slova kdekoli — `rowsTotal` je počet,
    // ne částka, a komentář smí mluvit o objednávkách.
    const fields = [...returnedType.matchAll(/^\s{2}(\w+)\s*[?:]/gm)].map((m) => m[1]);
    expect(fields).toContain('orderIds');
    for (const field of fields) {
      expect(field, `pole ${field} nesmí nést zákaznická data`)
        .not.toMatch(/^(email|customer\w*|\w*Email|\w*Name|amount|price|total)$/i);
    }
    // URL se nikdy neloguje (řetězcové literály se odstraní, aby text hlášky
    // nebyl zaměněn za logování proměnné).
    const withoutStrings = snapshotLib.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
    expect(withoutStrings).not.toMatch(/console\.\w+\([^)]*\burl\b/);
  });

  test('nové ověření nejdřív zneplatní to předchozí', () => {
    // Bez toho by po dřívějším úspěchu zůstalo viset `verified_at` a admin by
    // schválil napojení nad exportem, který se mezitím rozbil.
    const invalidateAt = verifyFn.indexOf('verified_at: null, verified_order_count: null');
    const snapshotAt = verifyFn.indexOf('snapshotShoptetExport(url)');
    const stampAt = verifyFn.indexOf('verified_at: new Date().toISOString()');
    expect(invalidateAt).toBeGreaterThan(-1);
    expect(invalidateAt).toBeLessThan(snapshotAt);
    // Razítko se dává až po kompletním úspěchu.
    expect(stampAt).toBeGreaterThan(snapshotAt);
    // A předběžná baseline se maže hned na začátku, ne až v chybové větvi.
    const wipeAt = verifyFn.indexOf('.delete()\n    .eq("request_id", requestId)');
    expect(wipeAt).toBeGreaterThan(-1);
    expect(wipeAt).toBeLessThan(snapshotAt);
  });

  test('baseline se aktivuje dřív, než se zapne import', () => {
    const activateAt = approveFn.indexOf('.from("shoptet_connection_baseline_orders")');
    const enableAt = approveFn.indexOf('shoptet_import_enabled: true');
    expect(activateAt).toBeGreaterThan(-1);
    expect(enableAt).toBeGreaterThan(-1);
    // Cron běží každou minutu — opačné pořadí by otevřelo okno pro staré objednávky.
    expect(activateAt).toBeLessThan(enableAt);
    // Řádky se rovnou zapisují jako aktivní; `activated_at` je požadovaný
    // přesný okamžik aktivace, ne dodatečné doplnění.
    expect(approveFn).toContain('activated_at: activatedAt');
    expect(approveFn).toContain('const activatedAt = new Date().toISOString();');
  });

  test('importer čte jen aktivní baseline a při chybě fail-closed', () => {
    expect(importFn).toContain('.from("shoptet_connection_baseline_orders")');
    expect(importFn).toContain('.not("activated_at", "is", null)');
    expect(importFn).toContain('baseline_unavailable');
    // Bez jistoty o baseline se nesmí pokračovat.
    expect(importFn).toMatch(/baselineErr[\s\S]{0,200}status: "failed"/);
  });

  test('baseline objednávka se přeskočí dřív, než se o ní začne rozhodovat', () => {
    const loopStart = importFn.indexOf('for (const row of parsed.orders)');
    const skipAt = importFn.indexOf('baselineIds.has(orderId)');
    const dupAt = importFn.indexOf('mode === "dry_run" && existingIds.has(orderId)');
    expect(loopStart).toBeGreaterThan(-1);
    expect(skipAt).toBeGreaterThan(loopStart);
    // Před dedupem i před zařazením do validRows → nedostane se do žádné větve,
    // která vydává odměnu.
    expect(skipAt).toBeLessThan(dupAt);
    expect(importFn).toContain('action: "skip_baseline"');
  });

  test('audit skip_baseline přežije i živý běh a nepočítá se jako chyba', () => {
    expect(importFn).toMatch(/row\.action === "invalid" \|\| row\.action === "skip_baseline"/);
    expect(importFn).toContain('skipped_baseline: rowsSkippedBaseline');
    // Přeskočení baseline se nesmí počítat jako selhání — jinak by běh spadl do
    // `partial` a cron by ho opakoval donekonečna. Kontroluje se přesně větev
    // skipu, ne výskyt obou jmen ve výsledném souhrnu.
    const skipBranch = importFn.slice(
      importFn.indexOf('if (baselineIds.has(orderId))'),
      importFn.indexOf('mode === "dry_run" && existingIds.has(orderId)'),
    );
    expect(skipBranch).toContain('rowsSkippedBaseline++');
    expect(skipBranch).not.toContain('rowsFailed');
    expect(skipBranch).not.toContain('rowsInvalid');
  });

  test('nikde se stávající napojení nepřevádí na baseline režim', () => {
    for (const src of [migration, verifyFn, approveFn, importFn]) {
      expect(src).not.toMatch(/BOHEMIA[\s\S]{0,120}(INSERT|UPDATE)/i);
    }
    // Baseline vzniká výhradně v ověření nového napojení.
    expect(codeOnly(approveFn)).not.toContain('.from("shoptet_connection_baseline_orders")\n      .insert');
    expect(codeOnly(importFn)).not.toMatch(/shoptet_connection_baseline_orders[\s\S]{0,120}\.(insert|upsert)\(/);
  });
});
