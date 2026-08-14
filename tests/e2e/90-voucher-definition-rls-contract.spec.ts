import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const migrationPath = 'supabase/migrations/20260718195819_restrict_voucher_client_update_policy.sql';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const repoPath = (path: string) => resolve(process.cwd(), path);

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

test.describe('voucher definition RLS contract', () => {
  test('migration removes the legacy direct customer UPDATE policy on voucher definitions', () => {
    const migration = read(migrationPath);

    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Users can claim unassigned vouchers" ON public.vouchers',
    );
    expect(migration).not.toMatch(/CREATE\s+POLICY\s+"Users can claim unassigned vouchers"/i);
  });

  test('current app purchase and favorite flows do not depend on direct vouchers UPDATE', () => {
    expect(read('src/pages/Vouchers.tsx')).toContain("rpc('buy_voucher_atomic'");
    expect(read('src/pages/Homepage.tsx')).toContain("rpc('buy_voucher_atomic'");
    expect(read('src/components/VoucherCarousel.tsx')).toContain("rpc('buy_voucher_atomic'");
    expect(read('src/pages/Vouchers.tsx')).toContain(".from('user_vouchers')");

    const customerVoucherUpdateCallers = listFiles('src').filter((file) => {
      const source = read(file);
      return source.includes(".from('vouchers')")
        && source.includes('.update(')
        && !file.includes('AdminVouchers');
    });

    expect(customerVoucherUpdateCallers).toEqual([]);
  });

  test('admin voucher management remains the only frontend path that updates voucher definitions', () => {
    const adminVouchers = read('src/pages/AdminVouchers.tsx');

    expect(adminVouchers).toContain(".from('vouchers')");
    expect(adminVouchers).toContain('.update(');
    expect(read('src/App.tsx')).toContain(
      '<Route path="/admin/vouchers" element={<RequirePermission permission="vouchers.manage"><AdminVouchers /></RequirePermission>} />',
    );
  });

  test('legacy admin validation RPCs that mutate vouchers are admin-gated wrappers', () => {
    const migration = read(migrationPath);
    const guardedRpcNames = [
      'setup_crud_test_data(text)',
      'test_admin_crud_operations()',
      'run_complete_admin_test_suite()',
    ];
    const internalRpcNames = [
      'setup_crud_test_data_internal_20260718195819(text)',
      'test_admin_crud_operations_internal_20260718195819()',
      'run_complete_admin_test_suite_internal_20260718195819()',
    ];

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.assert_admin_validation_rpc_allowed()');
    expect(migration).toContain("current_setting('request.jwt.claim.role', true)");
    expect(migration).toContain("'service_role'");
    expect(migration).toContain("public.has_role(auth.uid(), 'admin'::public.app_role)");
    expect(migration).toContain("public.has_role(auth.uid(), 'superadmin'::public.app_role)");
    expect(migration).toContain("RAISE EXCEPTION 'Admin access required'");

    for (const signature of guardedRpcNames) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM anon`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role`);
    }

    for (const signature of internalRpcNames) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM anon`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role`);
    }
  });
});
