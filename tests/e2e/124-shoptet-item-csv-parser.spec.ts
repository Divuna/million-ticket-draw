import { expect, test } from '@playwright/test';
import {
  parseShoptetCsv,
  isNonProductItemType,
  shouldIssue,
  mapStatus,
} from '../../supabase/functions/import-shoptet-orders/csv';

/**
 * Spec 124 — Shoptet item-level CSV parser.
 *
 * Imports the SAME parser module the Edge Function deploys, so there is no second
 * implementation to drift. No network, no DB, no emails.
 *
 * Covers:
 *   124a) legacy header-only export keeps one-row-per-order behaviour
 *   124b) item-level export groups rows into ONE order with items[]
 *   124c) shipping / payment / coupon lines are filtered out
 *   124d) after-discount unit price wins over the plain unit price
 *   124e) English item columns never hijack order-header detection
 *   124f) continuation rows with a blank order code attach to the previous order
 *   124g) invalid orders are still rejected per order, not per item row
 *   124i) Shoptet's own DEFAULT column names (orderItemCode, …) parse identically
 *   124j) default names do not let an item column hijack the order code
 *   124k) the discounted default price wins over the plain default price
 *   124n) "Nevyřízená" never maps to completed (negated state must not issue)
 *   124o) the negation guard is narrow — nevyzvednuto still cancels
 *   124p) "Nezaplaceno" / "unpaid" never map to paid (they cancel)
 */

// Real Shoptet Czech column names, as offered by the custom order export.
const H_ITEM = [
  'Kód objednávky',
  'E-mail',
  'Stav',
  'Cena objednávky celkem',
  'Položka objednávky - typ',
  'Položka objednávky - kód',
  'Položka objednávky - název',
  'Položka objednávky - množství',
  'Položka objednávky - cena s daní za jednotku po slevě',
].join(';');

test.describe('124 — Shoptet item-level CSV parser', () => {
  test('124a) legacy header-only export still yields one order per row', () => {
    const csv = [
      'code;email;total;status',
      '2026000001;a@onemil.cz;500;Zaplaceno',
      '2026000002;b@onemil.cz;250;Vyřízená',
    ].join('\n');

    const parsed = parseShoptetCsv(csv);

    expect(parsed.isItemLevel, 'no item column → legacy path').toBe(false);
    expect(parsed.orders).toHaveLength(2);
    expect(parsed.orders[0].orderId).toBe('2026000001');
    expect(parsed.orders[0].total).toBe(500);
    expect(parsed.orders[0].shoptetStatus).toBe('paid');
    expect(parsed.orders[1].shoptetStatus).toBe('completed');
    // Legacy orders carry no items → create_partner_order_reward gets p_items=null
    // and the whole-shop calculation stays byte-for-byte identical.
    expect(parsed.orders[0].items).toEqual([]);
    expect(parsed.invalidRows).toHaveLength(0);
  });

  test('124b) item-level export groups 3 rows into ONE order with 3 items', () => {
    const csv = [
      H_ITEM,
      '2026000010;a@onemil.cz;Zaplaceno;1247;produkt;ABC123;Parfém do auta;2;249',
      '2026000010;a@onemil.cz;Zaplaceno;1247;produkt;XYZ999;Něco jiného;1;500',
      '2026000010;a@onemil.cz;Zaplaceno;1247;produkt;QQQ111;Třetí věc;1;249',
    ].join('\n');

    const parsed = parseShoptetCsv(csv);

    expect(parsed.isItemLevel).toBe(true);
    expect(parsed.orders, 'three product rows are ONE order, not three').toHaveLength(1);

    const order = parsed.orders[0];
    expect(order.orderId).toBe('2026000010');
    expect(order.total).toBe(1247);
    expect(order.customerEmail).toBe('a@onemil.cz');
    expect(order.shoptetStatus).toBe('paid');
    expect(order.items).toHaveLength(3);
    expect(order.items[0]).toEqual({
      code: 'ABC123',
      name: 'Parfém do auta',
      quantity: 2,
      unit_price_czk: 249,
    });
  });

  test('124b2) two different orders stay two orders', () => {
    const csv = [
      H_ITEM,
      '2026000010;a@onemil.cz;Zaplaceno;498;produkt;ABC123;Parfém;2;249',
      '2026000011;b@onemil.cz;Odesláno;500;produkt;XYZ999;Jiné;1;500',
    ].join('\n');

    const parsed = parseShoptetCsv(csv);

    expect(parsed.orders).toHaveLength(2);
    expect(parsed.orders[0].items).toHaveLength(1);
    expect(parsed.orders[1].items).toHaveLength(1);
    expect(parsed.orders[1].shoptetStatus).toBe('shipped');
  });

  test('124c) shipping, payment and coupon lines are excluded from items', () => {
    const csv = [
      H_ITEM,
      '2026000020;a@onemil.cz;Zaplaceno;800;produkt;ABC123;Parfém;1;600',
      '2026000020;a@onemil.cz;Zaplaceno;800;doprava;PPL;Doprava PPL;1;99',
      '2026000020;a@onemil.cz;Zaplaceno;800;platba;CARD;Platba kartou;1;0',
      '2026000020;a@onemil.cz;Zaplaceno;800;sleva;KUPON10;Slevový kupón;1;-50',
    ].join('\n');

    const parsed = parseShoptetCsv(csv);

    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].items, 'only the real product survives').toHaveLength(1);
    expect(parsed.orders[0].items[0].code).toBe('ABC123');

    // Direct unit checks on the type filter.
    expect(isNonProductItemType('doprava')).toBe(true);
    expect(isNonProductItemType('shipping')).toBe(true);
    expect(isNonProductItemType('platba')).toBe(true);
    expect(isNonProductItemType('slevový kupón')).toBe(true);
    expect(isNonProductItemType('produkt')).toBe(false);
    // Unknown/blank type is treated as a product on purpose — under-counting would
    // pay the customer less than the widget promised.
    expect(isNonProductItemType('')).toBe(false);
    expect(isNonProductItemType('neznamy typ')).toBe(false);
  });

  test('124d) after-discount unit price wins over the plain unit price', () => {
    const headers = [
      'Kód objednávky',
      'E-mail',
      'Stav',
      'Cena objednávky celkem',
      'Položka objednávky - kód',
      'Položka objednávky - cena s daní za jednotku',
      'Položka objednávky - cena s daní za jednotku po slevě',
    ].join(';');
    const csv = [headers, '2026000030;a@onemil.cz;Zaplaceno;200;ABC123;500;200'].join('\n');

    const parsed = parseShoptetCsv(csv);

    expect(
      parsed.orders[0].items[0].unit_price_czk,
      'confirmed rule E: ratio rewards use the real after-discount price',
    ).toBe(200);
  });

  test('124e) English item columns do not hijack order-header detection', () => {
    // "Order item - code" contains both "order" and "code", which are order-header
    // candidates. Without the exclusion set the importer would group by product.
    const headers = [
      'Order item - code',
      'Order item - amount',
      'code',
      'email',
      'total',
      'status',
    ].join(';');
    const csv = [
      headers,
      'ABC123;2;2026000040;a@onemil.cz;498;paid',
      'XYZ999;1;2026000040;a@onemil.cz;498;paid',
    ].join('\n');

    const parsed = parseShoptetCsv(csv);

    expect(parsed.isItemLevel).toBe(true);
    expect(parsed.orders, 'grouped by order code, not by product code').toHaveLength(1);
    expect(parsed.orders[0].orderId).toBe('2026000040');
    expect(parsed.orders[0].items).toHaveLength(2);
    expect(parsed.orders[0].items[0].quantity).toBe(2);
  });

  test('124f) continuation rows with a blank order code attach to the previous order', () => {
    const csv = [
      H_ITEM,
      '2026000050;a@onemil.cz;Zaplaceno;748;produkt;ABC123;Parfém;2;249',
      ';;;;produkt;XYZ999;Druhá položka;1;250',
    ].join('\n');

    const parsed = parseShoptetCsv(csv);

    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].items).toHaveLength(2);
    expect(parsed.invalidRows, 'the continuation row must not count as invalid').toHaveLength(0);
  });

  test('124g) invalid orders are rejected per order, and valid ones still parse', () => {
    const csv = [
      H_ITEM,
      // missing email → invalid order
      '2026000060;;Zaplaceno;500;produkt;ABC123;Parfém;1;500',
      // valid order with two items
      '2026000061;b@onemil.cz;Zaplaceno;498;produkt;ABC123;Parfém;2;249',
      '2026000061;b@onemil.cz;Zaplaceno;498;produkt;XYZ999;Jiné;1;0',
    ].join('\n');

    const parsed = parseShoptetCsv(csv);

    expect(parsed.invalidRows).toHaveLength(1);
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].orderId).toBe('2026000061');
    expect(parsed.orders[0].items).toHaveLength(2);
  });

  // ── Shoptet's own default column names ──────────────────────────────────────
  // A partner who exports with the stock column set gets camelCase headers with no
  // separator. Every older candidate contains a space, dash or underscore, so none
  // of them could match: the export parsed as legacy, items[] came back empty and
  // the order silently fell back to the whole-order rate.

  // Header copied from a real default Shoptet item export.
  const H_DEFAULT = [
    'code',
    'statusName',
    'totalPriceWithVat',
    'email',
    'orderItemType',
    'orderItemName',
    'orderItemAmount',
    'orderItemCode',
    'orderItemUnitDiscountPriceWithVat',
  ].join(';');

  test('124i) default Shoptet column names produce one order with items[]', () => {
    const csv = [
      H_DEFAULT,
      '2026000123;Zaplacená;930;zakaznik@onemil.cz;product;Stolní lampička Tiny Tim;1;DS99987698;310',
      '2026000123;Zaplacená;930;zakaznik@onemil.cz;product;Odpadkový koš CURVER 25L;2;64;310',
      '2026000123;Zaplacená;930;zakaznik@onemil.cz;shipping;Balíkovna;1;SHIP-1;0',
    ].join('\n');

    const parsed = parseShoptetCsv(csv);

    expect(parsed.isItemLevel, 'orderItemCode is recognised as an item column').toBe(true);
    expect(parsed.missingHeaders).toEqual([]);
    expect(parsed.invalidRows).toHaveLength(0);

    // Three rows, one order — grouping is unchanged.
    expect(parsed.orders).toHaveLength(1);
    const order = parsed.orders[0];
    expect(order.orderId).toBe('2026000123');
    expect(order.total).toBe(930);
    expect(order.customerEmail).toBe('zakaznik@onemil.cz');
    expect(order.shoptetStatus).toBe('paid');

    // Shipping is filtered by the same isNonProductItemType rule as the Czech export.
    expect(order.items).toEqual([
      { code: 'DS99987698', name: 'Stolní lampička Tiny Tim', quantity: 1, unit_price_czk: 310 },
      { code: '64', name: 'Odpadkový koš CURVER 25L', quantity: 2, unit_price_czk: 310 },
    ]);
  });

  test('124j) "code" resolves to the order, never to orderItemCode', () => {
    // The order candidate "code" is a substring of "orderItemCode". Item columns are
    // detected first and excluded, so the order code must still win — otherwise the
    // importer would group by product and create one order per line.
    const csv = [
      H_DEFAULT,
      '2026000200;Vyřízená;100;c@onemil.cz;product;Věc;1;SKU-ABC;100',
    ].join('\n');

    const parsed = parseShoptetCsv(csv);

    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].orderId).toBe('2026000200');
    expect(parsed.orders[0].orderId).not.toBe('SKU-ABC');
    expect(parsed.orders[0].items[0].code).toBe('SKU-ABC');
  });

  test('124k) discounted default price wins; plain default price is the fallback', () => {
    // Both columns present → the after-discount one is authoritative, exactly as
    // with the Czech pair.
    const both = [
      'code;statusName;totalPriceWithVat;email;orderItemCode;orderItemAmount;orderItemUnitPriceWithVat;orderItemUnitDiscountPriceWithVat',
      '2026000300;Zaplacená;180;d@onemil.cz;SKU-1;1;250;180',
    ].join('\n');
    expect(parseShoptetCsv(both).orders[0].items[0].unit_price_czk).toBe(180);

    // Only the plain column → used as the fallback rather than leaving the price 0,
    // which would have paid a ratio-rule partner nothing.
    const plainOnly = [
      'code;statusName;totalPriceWithVat;email;orderItemCode;orderItemAmount;orderItemUnitPriceWithVat',
      '2026000301;Zaplacená;250;e@onemil.cz;SKU-2;1;250',
    ].join('\n');
    expect(parseShoptetCsv(plainOnly).orders[0].items[0].unit_price_czk).toBe(250);
  });

  test('124l) a default-name export without item columns stays on the legacy path', () => {
    // The stock order-level export (no item columns) must keep behaving exactly as
    // before: no items[], whole-order rate, byte-for-byte identical reward input.
    const csv = [
      'code;statusName;totalPriceWithVat;email',
      '2026000400;Zaplacená;500;f@onemil.cz',
    ].join('\n');

    const parsed = parseShoptetCsv(csv);

    expect(parsed.isItemLevel).toBe(false);
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].orderId).toBe('2026000400');
    expect(parsed.orders[0].total).toBe(500);
    expect(parsed.orders[0].items).toEqual([]);
  });

  test('124h) status taxonomy and trigger thresholds are unchanged', () => {
    expect(mapStatus('Vyřízená')).toBe('completed');
    expect(mapStatus('Odesláno')).toBe('shipped');
    expect(mapStatus('Zaplaceno')).toBe('paid');
    expect(mapStatus('Storno')).toBe('cancelled');
    expect(mapStatus('Nová')).toBe('pending');

    expect(shouldIssue('completed', 'completed')).toBe(true);
    expect(shouldIssue('shipped', 'completed')).toBe(false);
    expect(shouldIssue('shipped', 'shipped')).toBe(true);
    expect(shouldIssue('paid', 'shipped')).toBe(false);
    expect(shouldIssue('paid', 'paid')).toBe(true);
    expect(shouldIssue('pending', 'paid')).toBe(false);
    expect(shouldIssue('cancelled', 'paid')).toBe(false);
  });

  test('124n) "Nevyřízená" is NOT "Vyřízená" — a negated state never issues', () => {
    // Regression lock for a live production bug. Every pattern in mapStatus is a
    // SUBSTRING match, so "Nevyřízená" (= NOT processed) matched `vyriz` inside
    // ne-VYRIZ-ena and mapped to `completed`. Because `completed` issues at every
    // trigger threshold, brand-new untouched orders were rewarded immediately —
    // three such orders were issued on production before this was caught.
    expect(mapStatus('Nevyřízená')).toBe('pending');
    expect(mapStatus('Nevyřízené')).toBe('pending');
    expect(mapStatus('nevyřízená')).toBe('pending');

    // The positive state must be untouched — this is the pair that has to differ.
    expect(mapStatus('Vyřízená')).toBe('completed');
    expect(mapStatus('Vyřízeno')).toBe('completed');
    expect(mapStatus('Nevyřízená')).not.toBe(mapStatus('Vyřízená'));

    // And the negated state must not reward at any threshold.
    for (const threshold of ['paid', 'shipped', 'completed']) {
      expect(shouldIssue(mapStatus('Nevyřízená'), threshold)).toBe(false);
    }
    expect(shouldIssue(mapStatus('Vyřízená'), 'paid')).toBe(true);
  });

  test('124p) "Nezaplaceno" / "unpaid" are NOT "Zaplaceno" / "paid"', () => {
    // Same defect class as 124n, on the paid pair. `zaplac` matched inside
    // ne-ZAPLAC-eno and `paid` inside un-PAID, and because the paid branch ran
    // before the cancelled branch, the `nezaplac` and `unpaid` entries already
    // listed under cancelled were dead code. An explicitly UNPAID order therefore
    // mapped to `paid` and issued the reward at the 'paid' threshold.
    expect(mapStatus('Nezaplaceno')).toBe('cancelled');
    expect(mapStatus('nezaplaceno')).toBe('cancelled');
    expect(mapStatus('Nezaplaceno / čeká na platbu')).toBe('cancelled');
    expect(mapStatus('unpaid')).toBe('cancelled');

    // The positive counterparts must be untouched — these are the pairs that
    // have to differ.
    expect(mapStatus('Zaplaceno')).toBe('paid');
    expect(mapStatus('Zaplacená')).toBe('paid');
    expect(mapStatus('paid')).toBe('paid');
    expect(mapStatus('Nezaplaceno')).not.toBe(mapStatus('Zaplaceno'));
    expect(mapStatus('unpaid')).not.toBe(mapStatus('paid'));

    // A negated-payment order must never issue at any threshold, and must never
    // be silently left pending either — it belongs in cancelled.
    for (const threshold of ['paid', 'shipped', 'completed']) {
      expect(shouldIssue(mapStatus('Nezaplaceno'), threshold)).toBe(false);
      expect(shouldIssue(mapStatus('unpaid'), threshold)).toBe(false);
    }
    expect(shouldIssue(mapStatus('Zaplaceno'), 'paid')).toBe(true);
  });

  test('124o) the guard is narrow — dead-order negations still cancel', () => {
    // "nevyzvednuto" / "nezaplaceno" are negations too, but they mean the order is
    // DEAD, not merely unhandled. They must keep falling through to `cancelled`,
    // so the guard deliberately does not list their stems.
    expect(mapStatus('Nevyzvednuto')).toBe('cancelled');
    expect(mapStatus('Nevyzvednutá zásilka')).toBe('cancelled');

    // Other "not yet positive" negations map to pending for the same reason as
    // Nevyřízená — they would otherwise match dokon / dorucen / odeslan.
    expect(mapStatus('Nedokončeno')).toBe('pending');
    expect(mapStatus('Nedoručeno')).toBe('pending');
    expect(mapStatus('Neodesláno')).toBe('pending');

    // The guard is word-anchored, so it can never fire mid-word.
    expect(mapStatus('Stornována')).toBe('cancelled');
    expect(mapStatus('Zrušena')).toBe('cancelled');
    expect(mapStatus('Vráceno')).toBe('cancelled');
  });
});
