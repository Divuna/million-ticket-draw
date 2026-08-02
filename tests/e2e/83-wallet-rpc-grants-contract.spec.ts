import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const repoPath = (path: string) => resolve(process.cwd(), path);

const migrationPath = 'supabase/migrations/20260718150358_restrict_wallet_rpc_execute.sql';
const walletRpcSignatures = [
  'public.try_credit_wallet_mc(uuid)',
  'public.try_credit_wallet_mc(uuid, numeric)',
  'public.try_credit_wallet_mc(uuid, numeric, text)',
  'public.deduct_wallet_for_refund(uuid, numeric)',
];

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

test.describe('wallet mutation RPC grant contract', () => {
  test('migration removes public execution from every wallet mutation RPC overload', () => {
    const migration = read(migrationPath);

    for (const signature of walletRpcSignatures) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
      expect(migration).toContain(`ALTER FUNCTION ${signature} SET search_path TO public`);
    }
  });

  test('stripe refund no longer uses the clamping deduct RPC and stays on service role', () => {
    const refundFunction = read('supabase/functions/stripe-refund/index.ts');
    expect(refundFunction).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");

    // Zpevnění refundací: odečet MioCoinů dělá výhradně prepare_stripe_refund,
    // které vyžaduje celý zůstatek. Legacy deduct_wallet_for_refund ořezával
    // odečet na nulu, takže se už z Edge Function nesmí volat.
    expect(refundFunction).not.toContain('deduct_wallet_for_refund');
    expect(refundFunction).toContain("'prepare_stripe_refund'");

    const allowedDirectCallers = new Set([
      'tests/e2e/83-wallet-rpc-grants-contract.spec.ts',
      'tests/e2e/86-payment-wallet-high-risk-rpc-contract.spec.ts',
      'tests/e2e/87-stripe-refund-hardening-contract.spec.ts',
    ]);
    const filesWithDeductRpc = listFiles('.').filter((file) => (
      read(file).includes('deduct_wallet_for_refund') && !allowedDirectCallers.has(file)
    )).sort();

    expect(filesWithDeductRpc).toEqual([
      'docs/launch-readiness/PAY01_PAYMENTS_TEST_MODE_NOTE.md',
      'onemil_history.md',
      'onemil_state.md',
      'src/integrations/supabase/types.ts',
      'supabase/migrations/20260315140000_audit_improvements_close_wallet.sql',
      'supabase/migrations/20260315201000_wallet_hardening_functions.sql',
      'supabase/migrations/20260718150358_restrict_wallet_rpc_execute.sql',
      'supabase/migrations/20260803090000_harden_stripe_refund_flow.sql',
      'supabase/migrations/README_20260315140000.md',
    ]);
  });

  test('frontend does not call wallet mutation RPCs directly', () => {
    const frontendFiles = [
      'src/pages/AdminPayments.tsx',
      'src/integrations/supabase/types.ts',
    ];

    expect(read(frontendFiles[0])).not.toContain('try_credit_wallet_mc');
    expect(read(frontendFiles[0])).not.toContain('deduct_wallet_for_refund');

    // Generated types can mention the schema, but UI code must not invoke it.
    expect(read(frontendFiles[1])).toContain('try_credit_wallet_mc');
    expect(read(frontendFiles[1])).toContain('deduct_wallet_for_refund');
  });
});
