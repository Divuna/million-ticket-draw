import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DELTA_OVERLAP_MINUTES,
  computeDeltaFrom,
  formatShoptetUpdateTime,
  withUpdateTimeFrom,
} from '../../supabase/functions/import-shoptet-orders/delta';
import { parseShoptetCsv } from '../../supabase/functions/import-shoptet-orders/csv';

/**
 * Spec 135 — Shoptet delta import (updateTimeFrom).
 *
 * Imports the SAME delta module the Edge Function deploys, so there is no second
 * implementation to drift. No network, no DB, no e-mails.
 *
 * Covers:
 *   135a) updateTimeFrom appended to a URL that already has query parameters
 *   135b) …and to a URL with no query parameters
 *   135c) patternId / partnerId / hash survive byte-for-byte
 *   135d) first import (no history) → no parameter, full export
 *   135e) normal subsequent import → cutoff = last ok run minus the overlap
 *   135f) the safety overlap is a real, non-zero window
 *   135g) only a successful live run may advance the watermark
 *   135h) re-reading the same order yields the same external_order_id (dedup key)
 *   135i) a status change on an existing order is carried through
 *   135j) BOHEMIA-style legacy export is unaffected by delta
 *   135k) vereonika-style item-level export is unaffected by delta
 *   135l) Shoptet's current camelCase item names still parse under delta
 *   135m) the URL / hash never reaches a log or a database row
 *   135n) the overlap guard survives the 1-minute cron
 */

// A realistic Shoptet permanent export link. The hash deliberately contains the
// characters that a URLSearchParams round-trip would corrupt ('+', '=', '/').
const PERMALINK =
  'https://vereonika.myshoptet.com/export/orders.csv' +
  '?patternId=3&partnerId=42&hash=aB+cD/eF12gH=';

test.describe('135 — Shoptet delta import (updateTimeFrom)', () => {
  test('135a) appends updateTimeFrom to a URL that already has query params', () => {
    const url = withUpdateTimeFrom(PERMALINK, new Date('2026-08-17T09:05:00Z'));

    // Documented Shoptet format: YYYY-MM-DD HH:MM:SS (space percent-encoded).
    expect(url).toContain('&updateTimeFrom=2026-08-17%2009%3A05%3A00');
    // Exactly one occurrence — never a second, ambiguous copy.
    expect(url.match(/updateTimeFrom=/g)).toHaveLength(1);
  });

  test('135b) appends updateTimeFrom to a URL with no query params', () => {
    const bare = 'https://vereonika.myshoptet.com/export/orders.csv';
    const url = withUpdateTimeFrom(bare, new Date('2026-08-17T09:05:00Z'));

    // Must open the query string with '?', not '&'.
    expect(url).toBe(`${bare}?updateTimeFrom=2026-08-17%2009%3A05%3A00`);

    // A trailing '?' must not produce '?&'.
    const trailing = withUpdateTimeFrom(`${bare}?`, new Date('2026-08-17T09:05:00Z'));
    expect(trailing).not.toContain('?&');
  });

  test('135c) existing permanent-link params survive byte-for-byte', () => {
    const url = withUpdateTimeFrom(PERMALINK, new Date('2026-08-17T09:05:00Z'));

    // The original prefix must be untouched — this is what a URLSearchParams
    // round-trip would have mangled ('+' → '%20', '=' → '%3D').
    expect(url.startsWith(PERMALINK)).toBe(true);
    expect(url).toContain('hash=aB+cD/eF12gH=');
    expect(url).toContain('patternId=3');
    expect(url).toContain('partnerId=42');

    // Replacing an existing updateTimeFrom must also leave the rest intact.
    const again = withUpdateTimeFrom(url, new Date('2026-08-17T10:00:00Z'));
    expect(again.match(/updateTimeFrom=/g)).toHaveLength(1);
    expect(again).toContain('updateTimeFrom=2026-08-17%2010%3A00%3A00');
    expect(again).toContain('hash=aB+cD/eF12gH=');
  });

  test('135d) first import without history downloads the full export', () => {
    // No successful live run yet → no cutoff → caller omits the parameter.
    expect(computeDeltaFrom(null)).toBeNull();
    expect(computeDeltaFrom(undefined)).toBeNull();
    // An unparseable timestamp must also fail safe to a full export, never to
    // "epoch" or "now" (which would skip every older order).
    expect(computeDeltaFrom('not-a-timestamp')).toBeNull();
  });

  test('135e) a normal subsequent import asks only for the delta window', () => {
    const lastOk = '2026-08-17T09:20:00.000Z';
    const from = computeDeltaFrom(lastOk);

    expect(from).not.toBeNull();
    // Anchored on the last ok run's started_at, minus the safety overlap.
    expect(from!.toISOString()).toBe('2026-08-17T09:05:00.000Z');
    expect(formatShoptetUpdateTime(from!)).toBe('2026-08-17 09:05:00');
  });

  test('135f) the safety overlap is a real, non-zero window', () => {
    const lastOk = '2026-08-17T09:20:00.000Z';
    const from = computeDeltaFrom(lastOk)!;
    const overlapMs = Date.parse(lastOk) - from.getTime();

    expect(DELTA_OVERLAP_MINUTES).toBeGreaterThan(0);
    expect(overlapMs).toBe(DELTA_OVERLAP_MINUTES * 60 * 1000);
    // Must comfortably exceed the 1-minute cron interval, otherwise an order
    // changed during a run could fall between two windows.
    expect(overlapMs).toBeGreaterThan(60 * 1000);
  });

  test('135g) only a successful live run may advance the watermark', () => {
    // The Edge Function filters on mode='live' AND status='ok'. Assert the query
    // it actually issues, so a future edit cannot quietly widen it: a dry run or
    // a partial/failed run must never move the cutoff forward.
    const src = readFileSync(
      join(process.cwd(), 'supabase/functions/import-shoptet-orders/index.ts'),
      'utf8',
    );
    const watermark = src.slice(src.indexOf('let deltaFrom'), src.indexOf('const { data: run,'));

    expect(watermark).toContain(`.eq("mode", "live")`);
    expect(watermark).toContain(`.eq("status", "ok")`);
    // started_at, never finished_at — an order changed mid-run must be re-offered.
    expect(watermark).toContain('started_at');
    expect(watermark).not.toContain('finished_at');
    // Dry runs keep downloading everything.
    expect(watermark).toContain('if (mode === "live")');
  });

  test('135h) re-reading the same order yields a stable dedup key', () => {
    const csv = [
      'code;email;total;status',
      '2026000001;a@onemil.cz;500;Zaplaceno',
    ].join('\n');

    // Two consecutive delta windows overlap, so the same order legitimately
    // appears twice. It must resolve to the identical external_order_id, which is
    // what create_partner_order_reward dedups on (advisory lock + unique index).
    const first = parseShoptetCsv(csv);
    const second = parseShoptetCsv(csv);

    expect(first.orders[0].orderId).toBe('2026000001');
    expect(second.orders[0].orderId).toBe(first.orders[0].orderId);
    expect(second.orders[0].total).toBe(first.orders[0].total);
  });

  test('135i) a status change on an already-imported order is carried through', () => {
    const before = parseShoptetCsv(
      ['code;email;total;status', '2026000001;a@onemil.cz;500;Zaplaceno'].join('\n'),
    );
    // The order re-enters the delta export because its status changed — that is
    // precisely what updateTimeFrom (update time, not creation time) selects on.
    const after = parseShoptetCsv(
      ['code;email;total;status', '2026000001;a@onemil.cz;500;Vyřízená'].join('\n'),
    );

    // "Zaplaceno" is payment, not a lifecycle stage; "Vyřízená" is the lifecycle move.
    expect(before.orders[0].lifecycle).toBe('pending');
    expect(before.orders[0].payment).toBe('paid');
    expect(after.orders[0].lifecycle).toBe('completed');
    expect(after.orders[0].orderId).toBe(before.orders[0].orderId);
  });

  test('135j) BOHEMIA-style legacy export is unaffected by delta', () => {
    const parsed = parseShoptetCsv(
      [
        'code;email;total;status',
        '2026000004;a@onemil.cz;750;Zaplaceno',
        '2026000005;b@onemil.cz;120;Vyřízená',
      ].join('\n'),
    );

    expect(parsed.isItemLevel).toBe(false);
    expect(parsed.orders).toHaveLength(2);
    // No items → create_partner_order_reward gets p_items=null → the legacy
    // whole-order calculation stays byte-for-byte identical.
    expect(parsed.orders[0].items).toEqual([]);
    expect(parsed.invalidRows).toHaveLength(0);
  });

  test('135k) vereonika-style item-level export is unaffected by delta', () => {
    const parsed = parseShoptetCsv(
      [
        [
          'Kód objednávky',
          'E-mail',
          'Stav',
          'Cena objednávky celkem',
          'Položka objednávky - kód',
          'Položka objednávky - název',
          'Položka objednávky - množství',
          'Položka objednávky - cena s daní za jednotku po slevě',
        ].join(';'),
        '2026000010;a@onemil.cz;Zaplaceno;500;SKU-1;Krém;2;150',
        '2026000010;a@onemil.cz;Zaplaceno;500;SKU-2;Sérum;1;200',
      ].join('\n'),
    );

    expect(parsed.isItemLevel).toBe(true);
    // One order with two items — never two orders.
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].items).toHaveLength(2);
    expect(parsed.orders[0].items[0].code).toBe('SKU-1');
  });

  test('135l) Shoptet default camelCase item names still parse under delta', () => {
    const parsed = parseShoptetCsv(
      [
        'code;email;status;total;orderItemCode;orderItemName;orderItemAmount;orderItemUnitPriceWithVat',
        '2026000020;a@onemil.cz;Zaplaceno;300;SKU-9;Mýdlo;3;100',
      ].join('\n'),
    );

    expect(parsed.isItemLevel).toBe(true);
    expect(parsed.orders).toHaveLength(1);
    // The item column must not hijack the order code.
    expect(parsed.orders[0].orderId).toBe('2026000020');
    expect(parsed.orders[0].items[0].code).toBe('SKU-9');
  });

  test('135m) the export URL and hash never reach a log or a database row', () => {
    const src = readFileSync(
      join(process.cwd(), 'supabase/functions/import-shoptet-orders/index.ts'),
      'utf8',
    );

    // The only console call must be the generic error line, with no URL in it.
    const logged = src.match(/console\.\w+\([^)]*\)/g) ?? [];
    for (const call of logged) {
      expect(call).not.toContain('url');
      expect(call).not.toContain('fetchUrl');
      expect(call).not.toContain('hash');
    }

    // The delta cutoff may be returned (it is just a timestamp); the URL never is.
    expect(src).toContain('delta_from');
    expect(src).not.toMatch(/(delta_url|export_url:|fetch_url|url: fetchUrl)/);

    // Nothing writes the URL into shoptet_import_runs / shoptet_import_row_log.
    // Compare on identifiers only: string literals are stripped first, so a static
    // error code like "export_url_unavailable" is correctly ignored while an
    // actual `url` / `fetchUrl` reference is not.
    const stripLiterals = (s: string) => s.replace(/"[^"]*"|'[^']*'/g, '""');
    const finalizeCalls = src.match(/finalize\(\{[^}]*\}\)/g) ?? [];
    expect(finalizeCalls.length).toBeGreaterThan(0);
    for (const call of finalizeCalls) {
      expect(stripLiterals(call)).not.toMatch(/\b(url|fetchUrl)\b/);
    }
  });

  test('135n) the overlap guard survives the 1-minute cron', () => {
    const ef = readFileSync(
      join(process.cwd(), 'supabase/functions/import-shoptet-orders/index.ts'),
      'utf8',
    );
    // Edge Function side: a partner with a live 'running' row is skipped, not run
    // a second time in parallel.
    expect(ef).toContain('already_running');
    expect(ef).toContain(`.eq("status", "running")`);

    // Cron side: the new schedule is 1 minute and the orchestrator — including its
    // own overlap guard — is deliberately left untouched.
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260817120000_shoptet_auto_import_1min.sql'),
      'utf8',
    );
    expect(migration).toContain(`'* * * * *'`);
    expect(migration).toContain('shoptet_auto_import_1min');
    // The orchestrator must not be redefined here — its guard stays as deployed.
    expect(migration).not.toMatch(/create or replace function public\.run_shoptet_cron_imports/i);
  });
});
