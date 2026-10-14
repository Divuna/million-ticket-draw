import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseShoptetCsv,
  mapLifecycle,
  mapPaymentFlag,
  paymentFromStatusName,
  shouldIssue,
  toRpcStatus,
  findColExact,
  PAYMENT_HEADER_CANDIDATES,
  type OrderLifecycle,
  type PaymentState,
} from '../../supabase/functions/import-shoptet-orders/csv';
import { decodeCsvBody } from '../../supabase/functions/import-shoptet-orders/encoding';

/**
 * Spec 137 — real payment state and the three reward triggers.
 *
 * Imports the SAME parser the Edge Function deploys. No network, no DB, no emails.
 *
 * A Shoptet order carries TWO independent facts and the old model collapsed them
 * into one, which made the real production case unrepresentable: order 2026000003
 * is "Nevyřízená" (not processed) AND paid=1 at the same time. `statusName` is the
 * shop's workflow, `paid` is whether the money arrived.
 *
 * The partner picks exactly one trigger and it is honoured literally:
 *   paid      → the money arrived
 *   shipped   → dispatched or fulfilled; payment alone is not enough
 *   completed → fulfilled only
 *
 * Covers:
 *   137a) the `paid` column is read defensively
 *   137b) the payment column is matched EXACTLY (amountPaid must not win)
 *   137c) trigger `paid`
 *   137d) trigger `shipped`
 *   137e) trigger `completed`
 *   137f) a cancelled order never issues, even carrying paid=1
 *   137g) paid → shipped → completed yields AT MOST ONE issuance
 *   137h) an export without `paid` stays backward compatible
 *   137i) BOHEMIA full export and vereonika 9-column export, UTF-8 and windows-1250
 *   137j) the importer reads both axes and never re-derives them
 */

const W1250: Record<string, number> = {
  'ř': 0xF8, 'í': 0xED, 'á': 0xE1, 'é': 0xE9, 'č': 0xE8, 'ě': 0xEC, 'ů': 0xF9, 'ý': 0xFD,
};
const toWindows1250 = (s: string): Uint8Array =>
  Uint8Array.from([...s].map((c) => W1250[c] ?? c.charCodeAt(0)));

// vereonika sro — the real 9-column export, no payment column.
const VEREONIKA_HEADER =
  '"totalPriceWithVat";"email";"orderItemType";"orderItemName";"orderItemAmount";' +
  '"orderItemCode";"orderItemUnitDiscountPriceWithVat";"code";"statusName";';

const vereonikaCsv = (status: string) =>
  VEREONIKA_HEADER + '\n' +
  `"660,00";"a@onemil.cz";"product";"Kos";"1";"64";"310,00";"2026000003";"${status}";` + '\n';

// The recommended 10-field export: the same shape plus `paid`.
const TEN_FIELD_HEADER =
  '"code";"statusName";"paid";"totalPriceWithVat";"email";"orderItemType";' +
  '"orderItemName";"orderItemAmount";"orderItemCode";"orderItemUnitDiscountPriceWithVat";';

const tenFieldCsv = (status: string, paid: string) =>
  TEN_FIELD_HEADER + '\n' +
  `"2026000003";"${status}";"${paid}";"660,00";"a@onemil.cz";"product";"Kos";"1";"64";"310,00";` + '\n';

// BOHEMIA — the full standard export, where priceToPay / amountPaid / paid sit
// side by side. amountPaid is EMPTY even on a genuinely paid order.
const BOHEMIA_HEADER =
  '"code";"statusName";"email";"totalPriceWithVat";"priceToPay";"amountPaid";"paid";' +
  '"itemCode";"itemAmount";"itemUnitPriceWithVat";';

const bohemiaCsv = (status: string, paid: string) =>
  BOHEMIA_HEADER + '\n' +
  `"2026000003";"${status}";"a@onemil.cz";"660,00";"660,00";"";"${paid}";"64";"1";"310,00";` + '\n';

const firstOrder = (csv: string) => parseShoptetCsv(csv).orders[0];

test.describe('137 — payment state and the three reward triggers', () => {
  test('137a) the `paid` column is read defensively', () => {
    // Verified on production: Shoptet writes "1" when paid and EMPTY when not.
    expect(mapPaymentFlag('1')).toBe('paid');
    expect(mapPaymentFlag('')).toBe('unpaid');
    // Not observed on production, handled anyway rather than trusting a small sample.
    expect(mapPaymentFlag('0')).toBe('unpaid');
    expect(mapPaymentFlag('false')).toBe('unpaid');
    expect(mapPaymentFlag('true')).toBe('paid');
    // Anything unrecognised withholds the reward rather than granting it.
    expect(mapPaymentFlag('maybe')).toBe('unpaid');
    expect(mapPaymentFlag('   ')).toBe('unpaid');
  });

  test('137b) the payment column is matched EXACTLY, so amountPaid cannot win', () => {
    // A substring search for "paid" hits `amountPaid` first, and amountPaid is
    // empty even on a paid order — that would read every order as unpaid.
    const headers = ['code', 'priceToPay', 'amountPaid', 'paid'];
    expect(findColExact(headers, PAYMENT_HEADER_CANDIDATES)).toBe(3);

    // End-to-end through the real BOHEMIA column layout.
    const order = firstOrder(bohemiaCsv('Nevyřízená', '1'));
    expect(order.payment, 'must come from `paid`, not `amountPaid`').toBe('paid');

    // And a genuinely unpaid order in the same layout.
    expect(firstOrder(bohemiaCsv('Nevyřízená', '')).payment).toBe('unpaid');
  });

  test('137c) trigger `paid` — the real payment flag decides', () => {
    // The reported production order: not processed yet, but the money arrived.
    const paidOrder = firstOrder(tenFieldCsv('Nevyřízená', '1'));
    expect(paidOrder.lifecycle).toBe('pending');
    expect(paidOrder.payment).toBe('paid');
    expect(shouldIssue(paidOrder.lifecycle, paidOrder.payment, 'paid')).toBe(true);

    // Same order, not paid → withheld.
    const unpaidOrder = firstOrder(tenFieldCsv('Nevyřízená', ''));
    expect(shouldIssue(unpaidOrder.lifecycle, unpaidOrder.payment, 'paid')).toBe(false);

    // Already fulfilled and paid → issues.
    const done = firstOrder(tenFieldCsv('Vyřízená', '1'));
    expect(shouldIssue(done.lifecycle, done.payment, 'paid')).toBe(true);

    // Cash on delivery: fulfilled, no payment flag → still issues, because the
    // order has moved past the payment stage. Withholding here would be wrong.
    const cod = firstOrder(tenFieldCsv('Vyřízená', ''));
    expect(cod.payment).toBe('unpaid');
    expect(shouldIssue(cod.lifecycle, cod.payment, 'paid')).toBe(true);
  });

  test('137d) trigger `shipped` — payment alone is never enough', () => {
    expect(shouldIssue('shipped', 'unknown', 'shipped')).toBe(true);
    expect(shouldIssue('completed', 'unknown', 'shipped')).toBe(true);

    // The whole point of this trigger: money is not dispatch.
    expect(shouldIssue('pending', 'paid', 'shipped')).toBe(false);
    expect(shouldIssue('pending', 'unknown', 'shipped')).toBe(false);

    const shipped = firstOrder(tenFieldCsv('Odesláno', ''));
    expect(shipped.lifecycle).toBe('shipped');
    expect(shouldIssue(shipped.lifecycle, shipped.payment, 'shipped')).toBe(true);

    const paidButUnshipped = firstOrder(tenFieldCsv('Nevyřízená', '1'));
    expect(shouldIssue(paidButUnshipped.lifecycle, paidButUnshipped.payment, 'shipped')).toBe(false);
  });

  test('137e) trigger `completed` — only fulfilment counts', () => {
    expect(shouldIssue('completed', 'unknown', 'completed')).toBe(true);
    expect(shouldIssue('shipped', 'unknown', 'completed')).toBe(false);
    expect(shouldIssue('pending', 'paid', 'completed')).toBe(false);
    expect(shouldIssue('pending', 'unknown', 'completed')).toBe(false);

    const done = firstOrder(tenFieldCsv('Vyřízená', ''));
    expect(shouldIssue(done.lifecycle, done.payment, 'completed')).toBe(true);
  });

  test('137f) a cancelled order never issues, even carrying paid=1', () => {
    const cancelled = firstOrder(tenFieldCsv('Stornována', '1'));
    expect(cancelled.lifecycle).toBe('cancelled');
    expect(cancelled.payment).toBe('paid');

    // Cancelled is checked FIRST, so payment can never override it.
    for (const threshold of ['paid', 'shipped', 'completed']) {
      expect(shouldIssue(cancelled.lifecycle, cancelled.payment, threshold)).toBe(false);
    }
    // The importer sends the cancel transition, not an issuing one.
    expect(toRpcStatus(cancelled.lifecycle, cancelled.payment)).toBe('cancelled');
  });

  test('137g) paid → shipped → completed yields AT MOST ONE issuance', () => {
    // One order walking the whole lifecycle, partner on the `paid` trigger.
    const steps: Array<[string, string]> = [
      ['Nevyřízená', '1'],  // paid
      ['Odesláno', '1'],    // then shipped
      ['Vyřízená', '1'],    // then completed
    ];

    const transitions = steps.map(([status, paid]) => {
      const o = firstOrder(tenFieldCsv(status, paid));
      return {
        issues: shouldIssue(o.lifecycle, o.payment, 'paid'),
        rpc: toRpcStatus(o.lifecycle, o.payment),
      };
    });

    // Every step qualifies — the importer will call the RPC each time.
    expect(transitions.map((t) => t.issues)).toEqual([true, true, true]);
    // …with an escalating transition, never a duplicate creation.
    expect(transitions.map((t) => t.rpc)).toEqual(['paid', 'delivered', 'completed']);

    // The single-issuance guarantee does NOT live in the parser — it is enforced
    // by the DB. Pin the two mechanisms that provide it so neither is removed:
    //   1. create_partner_order_reward is idempotent per (partner, order) and
    //      computes `coins` exactly once,
    //   2. update_partner_order_reward_status only moves pending → issued, so
    //      re-sending a later transition is a no-op.
    const issuance = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260818100200_partner_reward_issuance_one_decimal.sql'),
      'utf8',
    ).replace(/\r\n/g, '\n');

    expect(issuance).toContain('pg_advisory_xact_lock');
    expect(issuance).toMatch(/'duplicate',\s*true/);
    expect(issuance).toContain("v_was_pending := (v_row.status = 'pending');");
    expect(issuance).toContain("v_new_status := 'issued';");
    // The customer e-mail is enqueued only on the first pending → issued move.
    expect(issuance).toContain("(v_metadata->>'customer_email_enqueued_at') IS NULL");
  });

  test('137h) an export without `paid` stays backward compatible', () => {
    // vereonika's real export today: no payment column at all.
    expect(findColExact(
      ['totalPriceWithVat', 'email', 'code', 'statusName'],
      PAYMENT_HEADER_CANDIDATES,
    )).toBe(-1);

    const order = firstOrder(vereonikaCsv('Nevyřízená'));
    expect(order.lifecycle).toBe('pending');
    expect(order.payment, 'no column → we genuinely do not know').toBe('unknown');
    expect(shouldIssue(order.lifecycle, order.payment, 'paid')).toBe(false);

    // A legacy shop that signals payment only through statusName must keep
    // working exactly as before — nothing may become MORE aggressive or MORE
    // conservative just because the column is absent.
    const legacyPaid = firstOrder(vereonikaCsv('Zaplaceno'));
    expect(legacyPaid.payment).toBe('paid');
    expect(shouldIssue(legacyPaid.lifecycle, legacyPaid.payment, 'paid')).toBe(true);
    expect(shouldIssue(legacyPaid.lifecycle, legacyPaid.payment, 'shipped')).toBe(false);

    const legacyUnpaid = firstOrder(vereonikaCsv('Nezaplaceno'));
    expect(legacyUnpaid.lifecycle).toBe('cancelled');
    expect(paymentFromStatusName('Nezaplaceno')).toBe('unpaid');

    // Fulfilment still issues without any payment signal.
    const legacyDone = firstOrder(vereonikaCsv('Vyřízená'));
    expect(shouldIssue(legacyDone.lifecycle, legacyDone.payment, 'paid')).toBe(true);
  });

  test('137i) both real exports, in both encodings', () => {
    // vereonika, windows-1250, no payment column.
    const v = parseShoptetCsv(
      decodeCsvBody(toWindows1250(vereonikaCsv('Nevyřízená')), 'application/csv; charset=windows-1250'),
    ).orders[0];
    expect(v.lifecycle).toBe('pending');
    expect(v.payment).toBe('unknown');
    expect(v.total).toBe(660);
    expect(v.items).toHaveLength(1);

    // BOHEMIA, UTF-8, payment column present and set.
    const b = parseShoptetCsv(
      decodeCsvBody(new TextEncoder().encode(bohemiaCsv('Nevyřízená', '1')), 'application/csv; charset=utf-8'),
    ).orders[0];
    expect(b.lifecycle).toBe('pending');
    expect(b.payment).toBe('paid');
    expect(shouldIssue(b.lifecycle, b.payment, 'paid')).toBe(true);

    // The 10-field recommendation, windows-1250, paid set.
    const t = parseShoptetCsv(
      decodeCsvBody(toWindows1250(tenFieldCsv('Nevyřízená', '1')), 'application/csv; charset=windows-1250'),
    ).orders[0];
    expect(t.lifecycle).toBe('pending');
    expect(t.payment).toBe('paid');
    expect(t.items).toHaveLength(1);
    expect(t.items[0].code).toBe('64');
  });

  test('137j) the importer reads both axes and never re-derives them', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'supabase/functions/import-shoptet-orders/index.ts'),
      'utf8',
    );
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

    // The conflated field must stay gone.
    expect(code).not.toMatch(/shoptetStatus/);
    // Both axes come straight off the parsed row.
    expect(code).toContain('shouldIssue(row.lifecycle, row.payment, triggerThreshold)');
    expect(code).toContain('toRpcStatus(row.lifecycle, row.payment)');
    expect(code).toContain(`row.lifecycle === "cancelled"`);
    // The importer must not re-read the raw status or the paid column itself —
    // that would be a second source of truth.
    expect(code).not.toMatch(/statusName/);
    expect(code).not.toMatch(/mapLifecycle|mapPaymentFlag|paymentFromStatusName/);
  });

  test('137k) lifecycle and payment are genuinely independent', () => {
    // Every combination the two axes can produce must be representable — this is
    // exactly what the old single `shoptetStatus` could not do.
    const seen = new Set<string>();
    for (const [status, paid] of [
      ['Nevyřízená', '1'], ['Nevyřízená', ''],
      ['Odesláno', '1'], ['Odesláno', ''],
      ['Vyřízená', '1'], ['Vyřízená', ''],
      ['Stornována', '1'], ['Stornována', ''],
    ] as const) {
      const o = firstOrder(tenFieldCsv(status, paid));
      seen.add(`${o.lifecycle}/${o.payment}`);
    }

    expect(seen).toContain('pending/paid');   // the case that was impossible before
    expect(seen).toContain('pending/unpaid');
    expect(seen).toContain('shipped/paid');
    expect(seen).toContain('completed/paid');
    expect(seen).toContain('cancelled/paid');
    expect(seen.size).toBe(8);
  });
});
