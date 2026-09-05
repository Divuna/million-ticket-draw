import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260905222500_shoptet_grace_accept_unknown_status.sql',
);

const migration = fs.readFileSync(migrationPath, 'utf8');

test.describe('Shoptet 15-minute grace — existing unpaid order', () => {
  test('accepts unknown status reported for an existing unpaid/pending order', () => {
    expect(migration).toContain("'unpaid', 'unknown', 'cancelled'");
  });

  test('unknown stays below the reward trigger and clears an active grace timer', () => {
    expect(migration).toContain("if not v_eligible then");
    expect(migration).toContain("- 'shoptet_paid_grace_started_at'");
    expect(migration).toContain("'below_trigger', true");
  });

  test('hard cancellation behavior is unchanged', () => {
    expect(migration).toContain("if v_status in ('cancelled', 'returned', 'not_picked_up') then");
    expect(migration).toContain('public.update_partner_order_reward_status');
  });
});
