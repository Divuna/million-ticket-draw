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
});
