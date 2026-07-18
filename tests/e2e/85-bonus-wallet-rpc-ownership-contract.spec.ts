import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const repoPath = (path: string) => resolve(process.cwd(), path);

const migrationPath = 'supabase/migrations/20260718155740_restrict_bonus_wallet_rpc_access.sql';

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

test.describe('bonus wallet mutation RPC ownership contract', () => {
  test('claim_miocoin_bonus requires the claimed user to be the authenticated caller', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.claim_miocoin_bonus(p_bonus_id uuid, p_user_id uuid)');
    expect(migration).toContain('IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN');
    expect(migration).toContain("RAISE EXCEPTION 'Unauthorized'");

    expect(migration).toContain('REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) FROM PUBLIC');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) FROM anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) TO authenticated');
  });

  test('legacy/global mutation helpers are not executable by ordinary users', () => {
    const migration = read(migrationPath);

    for (const signature of [
      'public.claim_miocoin_bonus(uuid)',
      'public.recalculate_bonus_wallet()',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
    }

    expect(migration).toContain('REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid) FROM service_role');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.recalculate_bonus_wallet() TO service_role');
  });

  test('redeem and transfer RPCs reject anonymous/null identity and keep self-scoped app access', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('IF auth.uid() IS NULL OR p_user_id IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN');
    expect(migration).toContain('IF v_winner_user_id IS NULL OR v_winner_user_id IS DISTINCT FROM p_user_id THEN');
    expect(migration).toContain('IF v_user_id IS NULL THEN');

    for (const signature of [
      'public.redeem_miocoin(uuid, uuid, integer)',
      'public.transfer_bonus_to_main()',
      'public.transfer_all_bonus_to_main_wallet()',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    }
  });

  test('application callers use only self-scoped bonus wallet RPCs', () => {
    const ticketModal = read('src/components/TicketResultModal.tsx');
    const profile = read('src/pages/Profile.tsx');

    expect(ticketModal).toContain("supabase.rpc('claim_miocoin_bonus'");
    expect(ticketModal).toContain('p_user_id: user.id');
    expect(ticketModal).not.toContain("rpc('claim_miocoin_bonus', { p_bonus_prize_id");

    expect(profile).toContain("supabase.rpc('transfer_bonus_to_main'");
    expect(profile).not.toContain('transfer_all_bonus_to_main_wallet');
    expect(profile).not.toContain('recalculate_bonus_wallet');
  });

  test('no direct application caller exists for legacy claim or global recalculation', () => {
    const allowedFiles = new Set([
      migrationPath,
      'tests/e2e/85-bonus-wallet-rpc-ownership-contract.spec.ts',
      'src/integrations/supabase/types.ts',
    ]);

    const directCallers = listFiles('.').filter((file) => {
      if (
        allowedFiles.has(file)
        || file.startsWith('supabase/migrations/')
        || file.startsWith('supabase/sql/')
        || file.startsWith('docs/')
        || file === 'CLAUDE.md'
        || file === 'onemil_history.md'
        || file === 'tests/wallet-integrity-queries.sql'
      ) {
        return false;
      }
      const content = read(file);
      return content.includes('recalculate_bonus_wallet')
        || content.includes('transfer_all_bonus_to_main_wallet')
        || content.includes('p_bonus_prize_id');
    }).sort();

    expect(directCallers).toEqual([]);
  });
});
