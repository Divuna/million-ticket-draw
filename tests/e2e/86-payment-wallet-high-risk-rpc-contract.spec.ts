import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const repoPath = (path: string) => resolve(process.cwd(), path);

const migrationPath = 'supabase/migrations/20260718161622_restrict_payment_wallet_high_risk_rpc.sql';

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

test.describe('high-risk payment and wallet RPC contract', () => {
  test('legacy unlock_ticket is no longer directly executable by public client roles', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('ALTER FUNCTION public.unlock_ticket(uuid, uuid) SET search_path TO public');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.unlock_ticket(uuid, uuid) FROM PUBLIC');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.unlock_ticket(uuid, uuid) FROM anon');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.unlock_ticket(uuid, uuid) FROM authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.unlock_ticket(uuid, uuid) TO service_role');
  });

  test('ensure_wallet_exists remains available but is scoped to the authenticated user or service role', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.ensure_wallet_exists(p_user_id uuid)');
    expect(migration).toContain("current_setting('request.jwt.claim.role', true)");
    expect(migration).toContain("'service_role'");
    expect(migration).toContain('auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()');
    expect(migration).toContain("RAISE EXCEPTION 'Unauthorized'");

    expect(migration).toContain('REVOKE ALL ON FUNCTION public.ensure_wallet_exists(uuid) FROM PUBLIC');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.ensure_wallet_exists(uuid) FROM anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.ensure_wallet_exists(uuid) TO authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.ensure_wallet_exists(uuid) TO service_role');
  });

  test('application ticket purchases use buy_ticket_atomic instead of legacy unlock_ticket', () => {
    const directCallers = listFiles('.').filter((file) => {
      if (
        file === migrationPath
        || file === 'tests/e2e/86-payment-wallet-high-risk-rpc-contract.spec.ts'
        || file.startsWith('supabase/migrations/')
        || file.startsWith('supabase/sql/')
        || file.startsWith('docs/')
        || file === 'src/integrations/supabase/types.ts'
        || file === 'CLAUDE.md'
        || file === 'onemil_history.md'
      ) {
        return false;
      }
      return read(file).includes('unlock_ticket');
    }).sort();

    expect(directCallers).toEqual([]);

    expect(read('src/pages/ContestDetail.tsx')).toContain('buy_ticket_atomic');
    expect(read('src/pages/Games.tsx')).toContain('buy_ticket_atomic');
    expect(read('src/pages/FavoriteGames.tsx')).toContain('buy_ticket_atomic');
    expect(read('supabase/functions/purchase-ticket/index.ts')).toContain('buy_ticket_atomic');
  });

  test('known payment and refund boundaries stay unchanged', () => {
    const migration = read(migrationPath);
    const stripeRefund = read('supabase/functions/stripe-refund/index.ts');

    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.admin_manage_payment');
    expect(read('src/integrations/supabase/types.ts')).toContain('admin_manage_payment');

    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.deduct_wallet_for_refund');
    expect(stripeRefund).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    expect(stripeRefund).toContain("'deduct_wallet_for_refund'");
  });
});
