import { expect, test } from '@playwright/test';
import { failureMessage } from '../../supabase/functions/import-shoptet-orders/rowLogMessage';

/**
 * Spec 138 — Shoptet import row-log failure message.
 *
 * Regression test for a read-only production audit finding (05. 09. 2026):
 * `shoptet_import_row_log` rows for `create_failed` / `status_update_failed`
 * were written with `message: null` unconditionally, so a repeatedly-failing
 * order (confirmed root cause: `create_partner_order_reward` returning
 * `{ success: false, error: 'items_required_for_reward_mode' }` for a
 * partner whose `reward_mode` requires item-level data their CSV export
 * does not provide) was undiagnosable from the database alone.
 *
 * Imports the SAME `failureMessage` module the Edge Function deploys, so
 * there is no second implementation to drift. No network, no DB.
 */

test.describe('138 — Shoptet row-log failure message', () => {
  test('138a) prefers the RPC structured error over a Postgres error', () => {
    const message = failureMessage(
      { message: 'connection reset' },
      { success: false, error: 'items_required_for_reward_mode' },
    );
    expect(message).toBe('items_required_for_reward_mode');
  });

  test('138b) falls back to the Postgres-level error when the RPC returned no structured result', () => {
    const message = failureMessage({ message: 'duplicate key value violates unique constraint' }, null);
    expect(message).toBe('duplicate key value violates unique constraint');
  });

  test('138c) falls back to the Postgres-level error when the result has no error field', () => {
    const message = failureMessage({ message: 'timeout' }, { success: false });
    expect(message).toBe('timeout');
  });

  test('138d) never returns null/empty — unknown_error is the last resort', () => {
    expect(failureMessage(null, null)).toBe('unknown_error');
    expect(failureMessage(undefined, undefined)).toBe('unknown_error');
    expect(failureMessage({ message: '' }, { success: false, error: '' })).toBe('unknown_error');
  });

  test('138e) ignores the result payload when it is not an object', () => {
    const message = failureMessage({ message: 'network error' }, 'not-an-object');
    expect(message).toBe('network error');
  });
});
