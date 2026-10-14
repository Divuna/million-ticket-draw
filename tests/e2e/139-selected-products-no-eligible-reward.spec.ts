import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyCreateOutcome, skipsStatusUpdate } from '../../supabase/functions/import-shoptet-orders/createOutcome';

/**
 * Spec 139 — `selected_products`: an order without a selected product is a
 * normal order, not a failure.
 *
 * Production finding (05. 09. 2026, BOHEMIA INFINITY): after the partner was
 * repointed to an item-level Shoptet export, every single one-minute cron run
 * ended `partial` because one order kept failing with `reward_amount_too_low`.
 * The order simply contained no product the partner had selected — there was
 * nothing wrong with it. `create_partner_order_reward` had a single gate
 * (`v_coins < v_min_mc`) and could not tell the two cases apart.
 *
 * The business rule being locked here:
 *   * order HAS a selected product          -> reward is computed from those products,
 *   * order has NO selected product         -> no reward, no code, no e-mail, NO error,
 *   * selected product but reward < minimum -> still `reward_amount_too_low`.
 *
 * Static source + shared-module contract — no network, no DB, no e-mails.
 * The importer half imports the SAME module the Edge Function deploys, so the
 * tested classification and the deployed classification cannot drift.
 */

// git on Windows checks these out with CRLF; normalise so multi-line anchors hold.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

/** Strips comments so "must not contain" assertions test real code, not safety notes. */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('--'))
    .join('\n');

const migration = read('supabase/migrations/20260906090000_partner_reward_no_eligible_products.sql');
const migrationCode = codeOnly(migration);
const importer = read('supabase/functions/import-shoptet-orders/index.ts');
const importerCode = codeOnly(importer);

test.describe('139 — selected_products without an eligible product', () => {
  // ── 1) no matching product -> no reward, no error ────────────────────────
  test('139a) the engine reports how many items actually earned a reward', () => {
    // Additive diagnostics only — this is what lets the caller distinguish
    // "nothing selected" from "selected but too small".
    expect(migrationCode).toContain("'eligible_items',  v_eligible");
    expect(migrationCode).toContain("'counted_items',   v_counted");
    // Counted only when a rule or the global rate applied, never for 'no_rule'.
    expect(migrationCode).toContain("IF v_applied <> 'no_rule' THEN");
    expect(migrationCode).toContain('v_eligible := v_eligible + 1;');
  });

  test('139b) no eligible product returns success WITHOUT creating a reward code', () => {
    const gate = migrationCode.slice(migrationCode.indexOf("computed_from' = 'items'"));
    expect(gate).toContain("coalesce((v_reward->>'eligible_items')::integer, 0) = 0");
    // success:true so the importer does not count it as a failure...
    expect(gate).toContain("'success', true");
    expect(gate).toContain("'skipped', true");
    expect(gate).toContain("'reason', 'no_eligible_products'");
    // ...and it returns BEFORE any code generation or INSERT.
    const returnIdx = migrationCode.indexOf("'reason', 'no_eligible_products'");
    const insertIdx = migrationCode.indexOf('INSERT INTO public.partner_reward_codes');
    expect(returnIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(returnIdx);
  });

  // ── 2) matching product -> normal reward ─────────────────────────────────
  test('139c) the reward calculation itself is untouched — still one engine, one rounding', () => {
    // No second calculation was introduced anywhere in the fix.
    expect(migrationCode).toContain('v_total_mc := v_total_mc + v_item_mc;');
    // Single rounding on the summed total, exactly as before.
    expect(migrationCode.match(/v_coins\s+:= round\(v_total_mc, 1\);/g) ?? []).toHaveLength(2);
    // The issuance RPC still delegates to the shared engine and nowhere else.
    expect(migrationCode).toContain('v_reward := public.compute_partner_reward(p_partner_id, v_order_total, p_items);');
    expect(migrationCode.match(/compute_partner_reward\(/g) ?? []).toHaveLength(2);
  });

  test('139d) whole_shop is completely unaffected', () => {
    // whole_shop returns computed_from='order_total', and the new gate only ever
    // fires on the items branch — so a whole_shop partner can never be skipped.
    expect(migrationCode).toContain("'computed_from',   'order_total'");
    expect(migrationCode).toContain("IF v_reward->>'computed_from' = 'items'");
    // The whole_shop return must NOT carry the new keys (shape unchanged).
    const wholeShopReturn = migrationCode.slice(
      migrationCode.indexOf("'computed_from',   'order_total'"),
      migrationCode.indexOf("IF NOT v_has_items THEN"),
    );
    expect(wholeShopReturn).not.toContain('eligible_items');
  });

  // ── 3) eligible product but under the minimum -> still an error ──────────
  test('139e) reward_amount_too_low survives unchanged, and runs AFTER the skip gate', () => {
    expect(migrationCode).toContain("'error', 'reward_amount_too_low'");
    expect(migrationCode).toContain('IF v_coins IS NULL OR v_coins < v_min_mc THEN');
    // Ordering is the whole point: skip first, minimum second. Reversed, an
    // order with no selected product would still be reported as too low.
    const skipIdx = migrationCode.indexOf("'reason', 'no_eligible_products'");
    const tooLowIdx = migrationCode.indexOf("'error', 'reward_amount_too_low'");
    expect(skipIdx).toBeGreaterThan(-1);
    expect(tooLowIdx).toBeGreaterThan(skipIdx);
    // The minimum itself still has a single source.
    expect(migrationCode).toContain('public.miocoin_min_partner_reward_mc()');
  });

  test('139f) an order with no items at all is still an error, not a silent skip', () => {
    // "no items" and "items but none selected" are different problems.
    expect(migrationCode).toContain("'error',       'items_required_for_reward_mode'");
  });

  // ── 4) Shoptet live import: skipped order must not break the run ─────────
  test('139g) classifyCreateOutcome separates all four outcomes', () => {
    expect(classifyCreateOutcome(null, { success: true, skipped: true, reason: 'no_eligible_products' }))
      .toBe('skipped_no_reward');
    expect(classifyCreateOutcome(null, { success: true, duplicate: true })).toBe('duplicate');
    expect(classifyCreateOutcome(null, { success: true, code: 'ABC', coins: 1.1 })).toBe('created');
    // A genuine too-low reward is still a failure.
    expect(classifyCreateOutcome(null, { success: false, error: 'reward_amount_too_low' })).toBe('failed');
    expect(classifyCreateOutcome({ message: 'connection reset' }, null)).toBe('failed');
    expect(classifyCreateOutcome(null, null)).toBe('failed');
    expect(classifyCreateOutcome(null, 'not-an-object')).toBe('failed');
  });

  test('139h) only an explicit skipped:true is treated as a skip', () => {
    expect(classifyCreateOutcome(null, { success: true })).toBe('created');
    expect(classifyCreateOutcome(null, { success: true, skipped: false })).toBe('created');
    // A duplicate that somehow also carries skipped must stay a duplicate.
    expect(classifyCreateOutcome(null, { success: true, duplicate: true, skipped: true })).toBe('duplicate');
  });

  test('139i) a skipped order never gets a status update — there is no code to move', () => {
    expect(skipsStatusUpdate('skipped_no_reward')).toBe(true);
    expect(skipsStatusUpdate('failed')).toBe(true);
    expect(skipsStatusUpdate('created')).toBe(false);
    expect(skipsStatusUpdate('duplicate')).toBe(false);
  });

  test('139j) the importer counts a skip outside rows_failed, so the run stays ok', () => {
    expect(importerCode).toContain('classifyCreateOutcome(createErr, createResult)');
    expect(importerCode).toContain('rowsSkippedNoReward++');
    expect(importerCode).toContain("action: \"skip_no_reward\"");
    expect(importerCode).toContain("result: \"no_eligible_products\"");

    // The skip branch must return early, before the status-update call that
    // would otherwise fail with "no reward code" and re-inflate rows_failed.
    const skipBranch = importerCode.slice(
      importerCode.indexOf('if (outcome === "skipped_no_reward")'),
      importerCode.indexOf('if (outcome === "duplicate")'),
    );
    expect(skipBranch).toContain('continue;');
    expect(skipBranch).not.toContain('rowsFailed++');
    expect(skipBranch).not.toContain('rowsCreated++');
    expect(skipBranch).not.toContain('update_partner_order_reward_status');

    // Run status is still derived only from invalid + failed rows, and the new
    // counter is deliberately not part of either.
    expect(importerCode).toContain('status: rowsInvalid > 0 || rowsFailed > 0 ? "partial" : "ok"');
    expect(importerCode).not.toContain('rowsFailed += rowsSkippedNoReward');
  });

  test('139k) a skipped order enqueues no customer e-mail', () => {
    // Customer e-mails are enqueued by update_partner_order_reward_status when a
    // code goes pending -> issued. The skip branch never reaches it, and the
    // importer has no other enqueue path.
    const liveBlock = importerCode.slice(importerCode.indexOf('if (mode === "live")'));
    expect(liveBlock).not.toContain('email_queue');
    expect(importerCode).not.toContain('.from("email_queue")');
  });

  // ── 5) issuance timing must not move ─────────────────────────────────────
  test('139l) reward_trigger_status behaviour is untouched', () => {
    // The fix changes WHETHER a code is created, never WHEN it is issued.
    expect(importerCode).toContain('shouldIssue(row.lifecycle, row.payment, triggerThreshold)');
    expect(importerCode).toContain('reward_trigger_status');
    // The migration must not touch the issuance threshold at all.
    expect(migrationCode).not.toContain('reward_trigger_status');
    expect(migrationCode).not.toContain('update_partner_order_reward_status');
    // New codes are still born `pending`; nothing is auto-issued here.
    expect(migrationCode).toContain("'pending', v_metadata");
  });

  test('139m) the migration touches only the two reward functions', () => {
    const created = migrationCode.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g) ?? [];
    expect(created).toHaveLength(2);
    expect(created.join('\n')).toContain('compute_partner_reward');
    expect(created.join('\n')).toContain('create_partner_order_reward');
    // No schema churn, no grant changes, no data migration, no cron.
    expect(migrationCode).not.toMatch(/\bALTER TABLE\b/);
    expect(migrationCode).not.toMatch(/\bDROP\b/);
    expect(migrationCode).not.toMatch(/\bGRANT\b/);
    expect(migrationCode).not.toMatch(/\bREVOKE\b/);
    expect(migrationCode).not.toMatch(/\bcron\./);
    expect(migrationCode).not.toMatch(/\bUPDATE public\.(wallets|payments|contests|partners)\b/);
  });
});
