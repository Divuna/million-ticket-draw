import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 158 — Shoptet paid rewards wait 15 minutes before issuance.
 *
 * Production finding (05. 09. 2026): order 2026000008 was immediately moved to
 * `issued` and its customer e-mail was queued when Shoptet changed to paid. When
 * the same order was changed back to unpaid a few minutes later, the issued code
 * and queued e-mail remained. This spec locks the intended safety window:
 *
 * paid/eligible -> pending for 15 min -> issue + email only if still eligible;
 * below trigger during the window -> clear timer, issue nothing;
 * re-qualifying later -> a fresh full 15-minute window.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('--'))
    .join('\n');

const migration = read('supabase/migrations/20260905230000_shoptet_reward_15min_grace.sql');
const migrationCode = codeOnly(migration);
const importer = read('supabase/functions/import-shoptet-orders/index.ts');
const importerCode = codeOnly(importer);

test.describe('158 — Shoptet 15-minute reward grace', () => {
  test('158a) first qualifying transition only schedules a pending reward', () => {
    expect(migrationCode).toContain('schedule_shoptet_partner_reward_status');
    expect(migrationCode).toContain("'shoptet_paid_grace_started_at', v_started_at");
    expect(migrationCode).toContain("'status', 'pending'");
    expect(migrationCode).toContain("'grace_pending', true");
    expect(migrationCode).toContain("interval '15 minutes'");

    const scheduler = migrationCode.slice(
      migrationCode.indexOf('create or replace function public.schedule_shoptet_partner_reward_status'),
      migrationCode.indexOf('create or replace function public.finalize_shoptet_partner_reward_grace'),
    );
    expect(scheduler).not.toContain('insert into public.email_queue');
  });

  test('158b) dropping below the trigger during grace clears the timer', () => {
    expect(migrationCode).toContain("- 'shoptet_paid_grace_started_at'");
    expect(migrationCode).toContain("'below_trigger', true");
    expect(migrationCode).toContain("when 'paid' then v_status in ('paid', 'delivered', 'completed')");
    expect(migrationCode).toContain("when 'shipped' then v_status in ('delivered', 'completed')");
    expect(migrationCode).toContain("when 'completed' then v_status = 'completed'");
  });

  test('158c) re-qualifying starts fresh unless eligibility was continuous', () => {
    expect(migrationCode).toContain('if v_previous_eligible and nullif');
    expect(migrationCode).toContain('v_started_at := v_now;');
    expect(migrationCode).toContain("v_previous_status := lower(coalesce(v_code.metadata->>'order_status', 'pending'))");
  });

  test('158d) only the finalizer reuses the existing issuance and email path', () => {
    expect(migrationCode).toContain('finalize_shoptet_partner_reward_grace');
    expect(migrationCode).toContain("c.status = 'pending'");
    expect(migrationCode).toContain("c.metadata->>'source_detail' = 'shoptet_import'");
    expect(migrationCode).toContain("p.shoptet_import_enabled is true");
    expect(migrationCode).toContain("<= now() - interval '15 minutes'");
    expect(migrationCode).toContain('public.update_partner_order_reward_status(');

    // Generic Partner API issuance itself is deliberately not replaced here.
    expect(migrationCode).not.toContain('create or replace function public.update_partner_order_reward_status');
  });

  test('158e) the finalizer runs every minute and is idempotently scheduled', () => {
    expect(migrationCode).toContain("jobname = 'finalize_shoptet_reward_grace_1min'");
    expect(migrationCode).toContain("cron.unschedule('finalize_shoptet_reward_grace_1min')");
    expect(migrationCode).toContain("'finalize_shoptet_reward_grace_1min'");
    expect(migrationCode).toContain("'* * * * *'");
  });

  test('158f) importer no longer issues a Shoptet reward directly', () => {
    expect(importerCode).toContain('schedule_shoptet_partner_reward_status');
    expect(importerCode).not.toContain('admin.rpc("update_partner_order_reward_status"');
    expect(importerCode).toContain('const shouldSyncStatus = outcome === "duplicate" || willIssue || willCancel;');
    expect(importerCode).toContain('const rpcStatus = toRpcStatus(row.lifecycle, row.payment);');
  });

  test('158g) existing rows are synchronised even when they fall below trigger', () => {
    // A duplicate is the normal shape of a paid order seen again after Shoptet
    // changes its status. It must reach the scheduler even when shouldIssue=false,
    // otherwise paid -> unpaid could never clear the timer.
    const statusBlock = importerCode.slice(importerCode.indexOf('const willIssue'));
    expect(statusBlock).toContain('outcome === "duplicate" || willIssue || willCancel');
    expect(statusBlock.indexOf('schedule_shoptet_partner_reward_status')).toBeGreaterThan(
      statusBlock.indexOf('shouldSyncStatus'),
    );
  });

  test('158h) security is service-role only and there is no wallet/payment mutation', () => {
    expect(migrationCode).toContain(
      'revoke all on function public.schedule_shoptet_partner_reward_status(uuid, text, text) from public, anon, authenticated',
    );
    expect(migrationCode).toContain(
      'grant execute on function public.schedule_shoptet_partner_reward_status(uuid, text, text) to service_role',
    );
    expect(migrationCode).toContain(
      'grant execute on function public.finalize_shoptet_partner_reward_grace() to service_role',
    );
    expect(migrationCode).not.toMatch(/\bUPDATE public\.(wallets|payments|contests)\b/i);
  });
});
