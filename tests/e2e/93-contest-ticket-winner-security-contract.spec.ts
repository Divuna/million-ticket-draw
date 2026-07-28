import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
      || relative.startsWith('.git/')
      || relative.startsWith('playwright-report/')
      || relative.startsWith('test-results/')
    ) {
      continue;
    }

    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      result.push(...listFiles(relative));
    } else if (/\.(ts|tsx|js|mjs|cjs|sql|toml)$/.test(relative)) {
      result.push(relative);
    }
  }

  return result;
}

const tombstoneFunctions = [
  'supabase/functions/generate-complete-contests/index.ts',
  'supabase/functions/generate-tickets/index.ts',
];

test.describe('contest, ticket, and winner security contract', () => {
  test('legacy production-only contest generators are tombstoned and cannot use service role writes', () => {
    for (const functionPath of tombstoneFunctions) {
      const source = read(functionPath);

      expect(source).toContain('status: 410');
      expect(source).toContain('disabled');
      expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(source).not.toContain('createClient(');
      expect(source).not.toMatch(/from\(['"]contests['"]\)\s*\.\s*(insert|update|upsert)/);
      expect(source).not.toMatch(/from\(['"]bonus_prizes['"]\)\s*\.\s*(insert|update|upsert)/);
      expect(source).not.toContain('ai.gateway.lovable.dev');
    }
  });

  test('application does not call the disabled legacy contest generators', () => {
    const forbiddenNames = ['generate-complete-contests', 'generate-tickets'];
    const ignored = new Set<string>([
      ...tombstoneFunctions,
      'tests/e2e/93-contest-ticket-winner-security-contract.spec.ts',
      'supabase/config.toml',
    ]);

    const callers = listFiles('.').filter((file) => {
      if (ignored.has(file) || file.startsWith('docs/') || file.startsWith('supabase/migrations/')) {
        return false;
      }

      const content = read(file);
      return forbiddenNames.some((name) => content.includes(name));
    }).sort();

    expect(callers).toEqual([]);
  });

  test('current buy_ticket_atomic contract keeps purchase, wallet debit, numbering, and winner assignment atomic', () => {
    const migration = read('supabase/migrations/20260717190000_buy_ticket_atomic_auth_and_wallet_tx.sql');
    const privacy = read('supabase/migrations/20260728103000_hide_public_ticket_numbers.sql');

    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('p_user_id IS NOT NULL AND p_user_id <> v_auth_uid');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain("v_contest_status <> 'active'");
    expect(migration).toContain('v_next_ticket > v_ticket_count');
    expect(migration).toContain('v_balance IS NULL OR v_balance < v_ticket_price');
    expect(migration).toContain('UPDATE public.wallets');
    expect(migration).toContain('INSERT INTO public.tickets');
    expect(migration).toContain('INSERT INTO public.wallet_transactions');
    expect(migration).toContain('INSERT INTO public.winners');
    expect(migration).toContain("VALUES (v_auth_uid, p_contest_id, v_new_ticket_id, 'main')");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM anon');
    expect(privacy).toContain('REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM authenticated');
    expect(privacy).toContain('GRANT EXECUTE ON FUNCTION public.buy_ticket_atomic(uuid, uuid) TO service_role');
    expect(privacy).toContain('GRANT EXECUTE ON FUNCTION public.buy_ticket_public(uuid, uuid) TO authenticated');
  });

  test('legacy prize delivery summary RPC is restricted because it exposes internal admin notes', () => {
    const summaryDefinition = read('supabase/migrations/20251230085947_6b9b05d6-9302-4083-b260-d1e6dca91130.sql');
    const restriction = read('supabase/migrations/20260719103000_restrict_prize_delivery_summary_rpc.sql');

    expect(summaryDefinition).toContain('bp.admin_notes');
    expect(restriction).toContain('ALTER FUNCTION public.get_prizes_delivery_summary(uuid) SET search_path TO public');
    expect(restriction).toContain('REVOKE ALL ON FUNCTION public.get_prizes_delivery_summary(uuid) FROM PUBLIC');
    expect(restriction).toContain('REVOKE ALL ON FUNCTION public.get_prizes_delivery_summary(uuid) FROM anon');
    expect(restriction).toContain('REVOKE ALL ON FUNCTION public.get_prizes_delivery_summary(uuid) FROM authenticated');
    expect(restriction).toContain('GRANT EXECUTE ON FUNCTION public.get_prizes_delivery_summary(uuid) TO service_role');
  });
});
