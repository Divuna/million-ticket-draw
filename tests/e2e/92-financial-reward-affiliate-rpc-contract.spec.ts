import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const repoPath = (path: string) => resolve(process.cwd(), path);

const migrationPath = 'supabase/migrations/20260718210230_restrict_financial_reward_affiliate_rpc_access.sql';

function listFiles(root: string): string[] {
  const absoluteRoot = repoPath(root);
  const result: string[] = [];

  for (const entry of readdirSync(absoluteRoot)) {
    const absolute = join(absoluteRoot, entry);
    const relative = absolute.slice(process.cwd().length + 1).replaceAll('\\', '/');

    if (
      relative.includes('/node_modules/')
      || relative.startsWith('node_modules/')
      || relative.startsWith('dist/')
      || relative.startsWith('.cursor/')
      || relative.startsWith('.git/')
      || relative.startsWith('playwright-report/')
      || relative.startsWith('test-results/')
    ) {
      continue;
    }

    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      result.push(...listFiles(relative));
    } else if (/\.(ts|tsx|js|mjs|cjs|sql|md)$/.test(relative)) {
      result.push(relative);
    }
  }

  return result;
}

test.describe('financial reward and affiliate RPC access contract', () => {
  test('legacy direct partner reward-code creation is service-role only', () => {
    const migration = read(migrationPath);
    const signature = 'public.generate_partner_reward_code(uuid, integer, text, citext, jsonb)';

    expect(migration).toContain(`ALTER FUNCTION ${signature}`);
    expect(migration).toContain('SET search_path TO public, extensions, pg_temp');
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
  });

  test('supported partner order issuance stays behind service-role Edge Functions', () => {
    const partnerActivate = read('supabase/functions/partner-activate/index.ts');
    const importShoptetOrders = read('supabase/functions/import-shoptet-orders/index.ts');
    const orderRewardMigration = read('supabase/migrations/20260613200849_partner_order_api_crypto_schema_fix.sql');

    for (const edgeFunction of [partnerActivate, importShoptetOrders]) {
      expect(edgeFunction).toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(edgeFunction).toContain('create_partner_order_reward');
      expect(edgeFunction).not.toContain('generate_partner_reward_code');
    }

    expect(orderRewardMigration).toContain('REVOKE ALL ON FUNCTION public.create_partner_order_reward(uuid, text, numeric, citext, jsonb) FROM PUBLIC, anon, authenticated');
    expect(orderRewardMigration).toContain('GRANT EXECUTE ON FUNCTION public.create_partner_order_reward(uuid, text, numeric, citext, jsonb) TO service_role');
  });

  test('frontend does not call reward-code issuance RPC directly', () => {
    const disallowedFrontendCallers = listFiles('src').filter((file) => {
      if (file === 'src/integrations/supabase/types.ts') {
        return false;
      }

      return read(file).includes('generate_partner_reward_code');
    }).sort();

    expect(disallowedFrontendCallers).toEqual([]);
  });

  test('affiliate commission recalculation is no longer executable by anon but keeps admin and cron paths', () => {
    const migration = read(migrationPath);
    const signature = 'public.calculate_affiliate_commissions_for_month(date)';

    expect(migration).toContain(`ALTER FUNCTION ${signature}`);
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);

    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.calculate_affiliate_commissions_for_month');
    expect(read('supabase/migrations/20260608_affiliate_company_commissions_cron.sql')).toContain('calculate_affiliate_commissions_for_month');
    expect(read('supabase/migrations/20260609_b2b_commissions_per_invoice.sql')).toContain('NOT public.is_admin()');
  });
});
