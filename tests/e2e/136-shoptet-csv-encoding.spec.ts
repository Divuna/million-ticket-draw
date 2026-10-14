import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  charsetFromContentType,
  decodeCsvBody,
  DEFAULT_CHARSET,
} from '../../supabase/functions/import-shoptet-orders/encoding';
import { parseShoptetCsv } from '../../supabase/functions/import-shoptet-orders/csv';

/**
 * Spec 136 — Shoptet CSV charset decoding.
 *
 * Imports the SAME decoder and parser the Edge Function deploys, so there is no
 * second implementation to drift. No network, no DB, no emails.
 *
 * The bug this locks: the importer used `resp.text()`, which always decodes as
 * UTF-8 and ignores the charset the server declared. Shoptet serves a custom
 * order export as `application/csv; charset=windows-1250`, where "ř" is the
 * single byte 0xF8 — not a valid UTF-8 lead byte. Every Czech status therefore
 * arrived as mojibake, matched none of the lifecycle patterns, and fell to
 * `pending`, so the reward was silently never issued.
 *
 * Covers:
 *   136a) charset is read out of Content-Type, in all the shapes servers send it
 *   136b) a windows-1250 body decodes to the real Czech text
 *   136c) windows-1250 statuses reach the CORRECT lifecycle bucket end-to-end
 *   136d) UTF-8 exports are byte-for-byte unaffected
 *   136e) a missing charset keeps the previous UTF-8 behaviour
 *   136f) an unknown charset label falls back instead of taking the import down
 *   136g) the item-level camelCase export still parses under windows-1250
 *   136h) the importer no longer calls resp.text()
 */

// windows-1250 single-byte values for the Czech letters used in these fixtures.
const W1250: Record<string, number> = {
  'ř': 0xF8, 'í': 0xED, 'á': 0xE1, 'é': 0xE9, 'č': 0xE8, 'ě': 0xEC,
  'š': 0xB9, 'ž': 0xBE, 'ý': 0xFD, 'ú': 0xFA, 'ů': 0xF9, 'ó': 0xF3,
  'ň': 0xF2, 'ť': 0xBB, 'ď': 0xEF, 'Ř': 0xD8, 'Č': 0xC8, 'Ž': 0x8E,
};

/** Encodes a string the way Shoptet's windows-1250 export puts it on the wire. */
const toWindows1250 = (s: string): Uint8Array =>
  Uint8Array.from([...s].map((c) => {
    const b = W1250[c];
    if (b !== undefined) return b;
    const code = c.charCodeAt(0);
    // Anything outside the fixture's Czech set must be plain ASCII, otherwise the
    // fixture itself would be lying about what windows-1250 can carry.
    if (code > 0x7F) throw new Error(`fixture char not in the windows-1250 map: ${c}`);
    return code;
  }));

const toUtf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

const W1250_CT = 'application/csv; charset=windows-1250';
const UTF8_CT = 'application/csv; charset=utf-8';

// The real Shoptet item-level export shape, with Shoptet's own default camelCase
// column names — the same one the failing partner uses.
const HEADER =
  '"totalPriceWithVat";"email";"orderItemType";"orderItemName";' +
  '"orderItemAmount";"orderItemCode";"orderItemUnitDiscountPriceWithVat";' +
  '"code";"statusName";';

const csvWithStatus = (status: string) =>
  HEADER + '\n' +
  `"660,00";"a@onemil.cz";"product";"Odpadkovy kos";"1";"64";"310,00";"2026000003";"${status}";` + '\n';

test.describe('136 — Shoptet CSV charset decoding', () => {
  test('136a) charset is read out of Content-Type in every shape servers send', () => {
    expect(charsetFromContentType('application/csv; charset=windows-1250')).toBe('windows-1250');
    expect(charsetFromContentType('application/csv;charset=windows-1250')).toBe('windows-1250');
    expect(charsetFromContentType('application/csv;  charset = windows-1250')).toBe('windows-1250');
    expect(charsetFromContentType('application/csv; charset="windows-1250"')).toBe('windows-1250');
    // Case must not matter — servers send UTF-8, utf-8, Windows-1250 alike.
    expect(charsetFromContentType('text/csv; charset=UTF-8')).toBe('utf-8');
    expect(charsetFromContentType('text/csv; charset=Windows-1250')).toBe('windows-1250');
    // Nothing declared → null, so the caller falls back rather than inventing one.
    expect(charsetFromContentType('application/csv')).toBeNull();
    expect(charsetFromContentType('')).toBeNull();
    expect(charsetFromContentType(null)).toBeNull();
    expect(charsetFromContentType(undefined)).toBeNull();
  });

  test('136b) a windows-1250 body decodes to the real Czech text', () => {
    const bytes = toWindows1250('Nevyřízená');

    expect(decodeCsvBody(bytes, W1250_CT)).toBe('Nevyřízená');
    // And this is exactly what the old code did — the bug, pinned so nobody
    // "simplifies" the decoder back to plain UTF-8.
    expect(new TextDecoder('utf-8').decode(bytes)).not.toBe('Nevyřízená');
  });

  test('136c) windows-1250 statuses reach the correct bucket end-to-end', () => {
    // This export carries no `paid` column, so payment comes from statusName.
    const cases: Array<[string, string, string]> = [
      ['Nevyřízená', 'pending', 'unknown'],
      ['Vyřízená', 'completed', 'unknown'],
      ['Zaplaceno', 'pending', 'paid'],
      ['Nezaplaceno', 'cancelled', 'unpaid'],
      ['unpaid', 'cancelled', 'unpaid'],
      ['Odesláno', 'shipped', 'unknown'],
      ['Stornována', 'cancelled', 'unknown'],
    ];

    for (const [status, lifecycle, payment] of cases) {
      const decoded = decodeCsvBody(toWindows1250(csvWithStatus(status)), W1250_CT);
      const parsed = parseShoptetCsv(decoded);

      expect(parsed.orders, `${status}: one order expected`).toHaveLength(1);
      expect(parsed.orders[0].orderId).toBe('2026000003');
      expect(parsed.orders[0].total).toBe(660);
      expect(parsed.orders[0].lifecycle, `${status} lifecycle`).toBe(lifecycle);
      expect(parsed.orders[0].payment, `${status} payment`).toBe(payment);
    }
  });

  test('136d) UTF-8 exports are unaffected', () => {
    for (const [status, lifecycle, payment] of [
      ['Nevyřízená', 'pending', 'unknown'],
      ['Vyřízená', 'completed', 'unknown'],
      ['Zaplaceno', 'pending', 'paid'],
      ['Nezaplaceno', 'cancelled', 'unpaid'],
      ['unpaid', 'cancelled', 'unpaid'],
    ] as const) {
      const decoded = decodeCsvBody(toUtf8(csvWithStatus(status)), UTF8_CT);
      // Decoding a UTF-8 body as UTF-8 must be the identity function.
      expect(decoded).toBe(csvWithStatus(status));
      expect(parseShoptetCsv(decoded).orders[0].lifecycle).toBe(lifecycle);
      expect(parseShoptetCsv(decoded).orders[0].payment).toBe(payment);
    }
  });

  test('136e) a missing charset keeps the previous UTF-8 behaviour', () => {
    const body = csvWithStatus('Vyřízená');
    expect(DEFAULT_CHARSET).toBe('utf-8');
    expect(decodeCsvBody(toUtf8(body), 'application/csv')).toBe(body);
    expect(decodeCsvBody(toUtf8(body), null)).toBe(body);
    expect(decodeCsvBody(toUtf8(body), undefined)).toBe(body);
  });

  test('136f) an unknown charset label falls back instead of throwing', () => {
    const body = csvWithStatus('Vyřízená');
    // "win-1250" is not a WHATWG label; TextDecoder rejects it. Taking the whole
    // import down over a header typo would be worse than decoding as UTF-8.
    expect(() => decodeCsvBody(toUtf8(body), 'application/csv; charset=win-1250')).not.toThrow();
    expect(decodeCsvBody(toUtf8(body), 'application/csv; charset=win-1250')).toBe(body);
    expect(decodeCsvBody(toUtf8(body), 'application/csv; charset=totally-made-up')).toBe(body);
  });

  test('136g) the item-level camelCase export still parses under windows-1250', () => {
    const csv =
      HEADER + '\n' +
      '"660,00";"a@onemil.cz";"product";"Odpadkovy kos";"1";"64";"310,00";"2026000003";"Vyřízená";' + '\n' +
      '"660,00";"a@onemil.cz";"product";"Sneakersy";"1";"0011";"350,00";"2026000003";"Vyřízená";' + '\n' +
      '"660,00";"a@onemil.cz";"shipping";"AlzaBox";"1";"SHIPPING81";"0,00";"2026000003";"Vyřízená";' + '\n' +
      '"660,00";"a@onemil.cz";"billing";"Hotove";"1";"BILLING2";"0,00";"2026000003";"Vyřízená";' + '\n';

    const parsed = parseShoptetCsv(decodeCsvBody(toWindows1250(csv), W1250_CT));

    expect(parsed.isItemLevel).toBe(true);
    // Four rows are ONE order, and shipping/billing are not products.
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].items).toHaveLength(2);
    expect(parsed.orders[0].items.map((i) => i.code)).toEqual(['64', '0011']);
    expect(parsed.orders[0].items[0].unit_price_czk).toBe(310);
    expect(parsed.orders[0].lifecycle).toBe('completed');
  });

  test('136h) the importer decodes by charset and no longer calls resp.text()', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'supabase/functions/import-shoptet-orders/index.ts'),
      'utf8',
    );
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');

    // resp.text() is the bug itself — it must not come back.
    expect(code).not.toMatch(/resp\.text\(\)/);
    expect(code).toContain('decodeCsvBody(await resp.arrayBuffer()');
    expect(code).toContain('resp.headers.get("content-type")');
  });

  test('136i) the decoder never guesses an encoding on its own', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'supabase/functions/import-shoptet-orders/encoding.ts'),
      'utf8',
    );
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');

    // The only encodings it may use are the one the server declared and the
    // documented UTF-8 fallback. No sniffing, no byte-frequency heuristics.
    expect(code).toContain('charsetFromContentType(contentType)');
    expect(code).toContain('DEFAULT_CHARSET');
    expect(code).not.toMatch(/windows-125\d/); // no hardcoded charset in the logic
  });
});
