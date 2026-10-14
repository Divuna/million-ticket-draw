import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseShoptetCsv,
  shouldIssue,
  toRpcStatus,
  type OrderLifecycle,
  type PaymentState,
} from '../../supabase/functions/import-shoptet-orders/csv';

/**
 * Spec 159 — a paid Shoptet order reverted to unpaid must cancel the 15-minute
 * grace window.
 *
 * PRODUCTION BUG (05. 09. 2026, confirmed in `shoptet_import_row_log`):
 * PR #393 started re-synchronising EVERY existing Shoptet order so that a
 * revert below the trigger clears a running grace timer. But `toRpcStatus`
 * still mapped "pending lifecycle, not paid" to the placeholder `'unknown'`,
 * a status `schedule_shoptet_partner_reward_status` rightly rejects. Result:
 *
 *   * every affected order logged `status_update_failed / unsupported_order_status`
 *     once per minute (orders 2026000001, 2026000002, 2026000007, 2026000008,
 *     2026000009 — 9 to 14 times each),
 *   * every import run went `partial`,
 *   * and critically: the revert to unpaid was NEVER recorded, so
 *     `shoptet_paid_grace_started_at` kept running and the reward stayed queued
 *     for issuance on an order the shop had put back to unpaid.
 *
 * The fix maps that case to the truthful `'unpaid'`, which the RPC already
 * handles as below-trigger. The RPC is deliberately NOT widened to accept
 * `'unknown'`: rejecting a meaningless status is the correct guard, and writing
 * it into `metadata.order_status` would corrupt the previous-status comparison
 * that the fresh-window rule depends on.
 *
 * Locks the full cycle:
 *   unpaid -> paid -> grace -> unpaid -> timer removed -> paid again
 *          -> fresh 15 min -> issued exactly once
 *
 * Static source + shared-parser contract. No network, no DB, no e-mails.
 */

// git on Windows checks SQL out with CRLF; normalise so multi-line anchors hold.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');
const grace = read('supabase/migrations/20260905230000_shoptet_reward_15min_grace.sql');
const importer = read('supabase/functions/import-shoptet-orders/index.ts');

// The 9-column vereonika export — the real shape order 2026000009 arrives in,
// plus the `paid` column BOHEMIA-style exports carry.
const HEADER =
  '"code";"statusName";"paid";"totalPriceWithVat";"email";' +
  '"orderItemType";"orderItemName";"orderItemAmount";"orderItemCode";"orderItemUnitDiscountPriceWithVat";';

const snapshot = (statusName: string, paid: string) =>
  HEADER + '\n' +
  `"2026000009";"${statusName}";"${paid}";"970,00";"zakaznik@onemil.cz";` +
  '"product";"Kos";"1";"64";"485,00";' + '\n';

/** Parses one export snapshot down to the two axes the importer works with. */
function axesOf(csv: string): { lifecycle: OrderLifecycle; payment: PaymentState } {
  const parsed = parseShoptetCsv(csv);
  expect(parsed.orders).toHaveLength(1);
  return { lifecycle: parsed.orders[0].lifecycle, payment: parsed.orders[0].payment };
}

const UNPAID = snapshot('Nevyřízená', '0');
const PAID = snapshot('Nevyřízená', '1');

test.describe('159 — paid -> unpaid revert cancels the grace window', () => {
  // ── the mapping bug itself ───────────────────────────────────────────────
  test('159a) an unpaid order maps to `unpaid`, never to a placeholder', () => {
    const { lifecycle, payment } = axesOf(UNPAID);
    expect(lifecycle).toBe('pending');
    expect(payment).toBe('unpaid');
    expect(toRpcStatus(lifecycle, payment)).toBe('unpaid');
    expect(toRpcStatus(lifecycle, payment)).not.toBe('unknown');
  });

  test('159b) the mapping is TOTAL and every output is a status the RPC accepts', () => {
    // The accepted set is read out of the deployed migration, so this breaks if
    // either side of the contract moves.
    const guard = grace.match(/v_status not in \(([^)]*)\)/);
    expect(guard).not.toBeNull();
    const accepted = [...guard![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(accepted).toContain('unpaid');
    // The placeholder must NOT have been whitelisted as a workaround.
    expect(accepted).not.toContain('unknown');

    const lifecycles: OrderLifecycle[] = ['pending', 'shipped', 'completed', 'cancelled'];
    const payments: PaymentState[] = ['paid', 'unpaid', 'unknown'];
    for (const lifecycle of lifecycles) {
      for (const payment of payments) {
        expect(accepted, `${lifecycle}/${payment}`).toContain(toRpcStatus(lifecycle, payment));
      }
    }
  });

  // ── the full cycle, step by step ─────────────────────────────────────────
  test('159c) unpaid -> paid -> unpaid -> paid produces the right status at every step', () => {
    const threshold = 'paid';
    const steps = [UNPAID, PAID, UNPAID, PAID].map(axesOf);

    // 1) unpaid: below the trigger, nothing is issued.
    expect(shouldIssue(steps[0].lifecycle, steps[0].payment, threshold)).toBe(false);
    expect(toRpcStatus(steps[0].lifecycle, steps[0].payment)).toBe('unpaid');

    // 2) paid: qualifies, so the grace window starts.
    expect(shouldIssue(steps[1].lifecycle, steps[1].payment, threshold)).toBe(true);
    expect(toRpcStatus(steps[1].lifecycle, steps[1].payment)).toBe('paid');

    // 3) back to unpaid: this is the step that used to fail. It must produce a
    //    status the RPC accepts so the timer is actually cleared.
    expect(shouldIssue(steps[2].lifecycle, steps[2].payment, threshold)).toBe(false);
    expect(toRpcStatus(steps[2].lifecycle, steps[2].payment)).toBe('unpaid');

    // 4) paid again: qualifies again, and the RPC starts a brand-new window
    //    because the recorded previous status is now 'unpaid' (see 159f).
    expect(shouldIssue(steps[3].lifecycle, steps[3].payment, threshold)).toBe(true);
    expect(toRpcStatus(steps[3].lifecycle, steps[3].payment)).toBe('paid');
  });

  test('159d) an existing order is re-synchronised even while below the trigger', () => {
    // Without the duplicate arm the revert would never reach the RPC at all.
    expect(importer).toContain('outcome === "duplicate" || willIssue || willCancel');
    expect(importer).toContain('schedule_shoptet_partner_reward_status');
  });

  // ── what the deployed RPC does with those statuses ───────────────────────
  test('159e) a below-trigger status deletes the running grace timer', () => {
    const belowTrigger = grace.slice(grace.indexOf('if not v_eligible then'));
    expect(belowTrigger).toContain("- 'shoptet_paid_grace_started_at'");
    expect(belowTrigger).toContain("'order_status', v_status");
    expect(belowTrigger).toContain("'below_trigger', true");
    // No issuance and no e-mail on this path.
    const untilNextBranch = belowTrigger.slice(0, belowTrigger.indexOf('if v_previous_eligible'));
    expect(untilNextBranch).not.toContain('update_partner_order_reward_status');
    expect(untilNextBranch).not.toContain('email_queue');
  });

  test('159f) becoming eligible again starts a FRESH window, it does not resume', () => {
    // The old start time is only reused when the PREVIOUS recorded status was
    // itself eligible. After a revert the previous status is 'unpaid', so the
    // else-branch resets the clock to now().
    expect(grace).toContain(
      "if v_previous_eligible and nullif(v_code.metadata->>'shoptet_paid_grace_started_at', '') is not null then",
    );
    expect(grace).toContain('v_started_at := v_now;');
    expect(grace).toContain("v_previous_status := lower(coalesce(v_code.metadata->>'order_status', 'pending'));");
    expect(grace).toContain("'grace_until', v_started_at + interval '15 minutes'");
  });

  test('159g) issuance needs 15 continuous minutes AND a still-eligible status', () => {
    const finalize = grace.slice(grace.indexOf('function public.finalize_shoptet_partner_reward_grace'));
    expect(finalize).toContain("(c.metadata->>'shoptet_paid_grace_started_at')::timestamptz <= now() - interval '15 minutes'");
    // A cleared timer is NULL, so a reverted order can never be picked up.
    expect(finalize).toContain("nullif(c.metadata->>'shoptet_paid_grace_started_at', '') is not null");
    // The order status is re-checked against the trigger at issuance time too.
    expect(finalize).toContain("when 'paid' then c.metadata->>'order_status' in ('paid', 'delivered', 'completed')");
  });

  test('159h) issued exactly once — the finalizer only ever touches pending codes', () => {
    const finalize = grace.slice(grace.indexOf('function public.finalize_shoptet_partner_reward_grace'));
    expect(finalize).toContain("where c.status = 'pending'");
    // Concurrent runs cannot double-issue the same row.
    expect(finalize).toContain('for update of c skip locked');
    // A code that already left 'pending' is short-circuited in the scheduler.
    expect(grace).toContain("if v_code.status <> 'pending' then");
    expect(grace).toContain("'already_finalized', true");
  });

  // ── things this fix must not disturb ─────────────────────────────────────
  test('159i) cancelled / returned / not_picked_up keep the existing behaviour', () => {
    expect(grace).toContain("if v_status in ('cancelled', 'returned', 'not_picked_up') then");
    expect(grace).toContain('return public.update_partner_order_reward_status(p_partner_id, v_order_id, v_status);');
    // A cancelled order still maps to 'cancelled' regardless of the paid flag.
    expect(toRpcStatus('cancelled', 'paid')).toBe('cancelled');
    expect(shouldIssue('cancelled', 'paid', 'paid')).toBe(false);
  });

  test('159j) the other triggers are unaffected', () => {
    // shipped / completed thresholds still ignore payment alone...
    expect(shouldIssue('pending', 'paid', 'shipped')).toBe(false);
    expect(shouldIssue('shipped', 'unpaid', 'shipped')).toBe(true);
    expect(shouldIssue('shipped', 'unpaid', 'completed')).toBe(false);
    expect(shouldIssue('completed', 'unpaid', 'completed')).toBe(true);
    // ...and a paid-but-unshipped order reports 'paid', which the RPC then
    // measures against the partner's own threshold.
    expect(toRpcStatus('pending', 'paid')).toBe('paid');
    expect(toRpcStatus('shipped', 'unpaid')).toBe('delivered');
    expect(toRpcStatus('completed', 'unpaid')).toBe('completed');
  });

  test('159k) an export with no payment column still behaves as before', () => {
    const noPaidCol =
      '"code";"statusName";"totalPriceWithVat";"email";' +
      '"orderItemType";"orderItemName";"orderItemAmount";"orderItemCode";"orderItemUnitDiscountPriceWithVat";' + '\n' +
      '"2026000009";"Nevyřízená";"970,00";"zakaznik@onemil.cz";' +
      '"product";"Kos";"1";"64";"485,00";' + '\n';
    const { lifecycle, payment } = axesOf(noPaidCol);
    expect(payment).toBe('unknown');
    expect(shouldIssue(lifecycle, payment, 'paid')).toBe(false);
    // Still a real status, so a legacy export can never fail the run either.
    expect(toRpcStatus(lifecycle, payment)).toBe('unpaid');
  });

  test('159l) no reward is issued and no e-mail is created while below the trigger', () => {
    // The importer never enqueues customer e-mail itself; that only happens
    // inside update_partner_order_reward_status, which the below-trigger path
    // never calls (159e) and the finalizer only reaches after 15 minutes (159g).
    expect(importer).not.toContain('.from("email_queue")');
    expect(grace).toContain("'grace_pending', false");
  });
});
