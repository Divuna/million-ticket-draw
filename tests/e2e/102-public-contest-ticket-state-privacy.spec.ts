import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const publicContestReaders = [
  'src/App.tsx',
  'src/pages/Homepage.tsx',
  'src/pages/Games.tsx',
  'src/pages/FavoriteGames.tsx',
  'src/pages/BonusDetail.tsx',
  'src/pages/MyContestDetail.tsx',
  'src/pages/Wins.tsx',
  'src/pages/ContestDetail.tsx',
  'src/components/MysteryPurchaseResultDialog.tsx',
];

test.describe('102 — public contest ticket-state privacy', () => {
  test('database contract blocks public ticket state and exposes a safe view', () => {
    const migration = read(
      'supabase/migrations/20260728113000_hide_public_contest_ticket_state.sql',
    );
    const view = migration.match(
      /CREATE OR REPLACE VIEW public\.public_contests[\s\S]*?FROM public\.contests;/,
    )?.[0] ?? '';

    expect(view).toContain('WITH (security_invoker = true)');
    expect(view).not.toContain('next_ticket_number');
    expect(view).not.toMatch(/ticket_position|winning_position/);
    expect(migration).toContain('REVOKE SELECT ON TABLE public.contests FROM anon');
    expect(migration).toContain('REVOKE SELECT ON TABLE public.contests FROM authenticated');
    expect(migration).toContain(
      'REVOKE SELECT (next_ticket_number) ON public.contests FROM anon',
    );
    expect(migration).toContain(
      'REVOKE SELECT (next_ticket_number) ON public.contests FROM authenticated',
    );
    expect(migration).toMatch(
      /GRANT SELECT \([\s\S]*?\) ON public\.contests TO anon, authenticated;/,
    );
  });

  test('every customer contest reader uses only the sanitized view', () => {
    for (const file of publicContestReaders) {
      const source = read(file);
      expect(source, file).not.toMatch(/\.from\(['"]contests['"]\)/);
      expect(source, file).toMatch(
        /\.from\(['"]public_contests['"]\)|\.rpc\(['"]get_latest_winners_public['"]/,
      );
    }

    expect(read('src/pages/FavoriteGames.tsx')).not.toMatch(
      /\.select\(`[\s\S]*?\bcontests\s*\(/,
    );
    expect(read('src/pages/Games.tsx')).not.toMatch(
      /postgres_changes[\s\S]*?table:\s*['"]contests['"]/,
    );
  });

  test('generated frontend types encode the sanitized public contract', () => {
    const types = read('src/integrations/supabase/types.ts');
    const publicView = types.match(
      /public_contests: \{([\s\S]*?)\n      \}\n      public_partners:/,
    )?.[1] ?? '';

    expect(publicView).toContain('ticket_count: number');
    expect(publicView).not.toContain('next_ticket_number');
    expect(types).toContain('get_contest_ticket_state_internal:');
    expect(types).toContain('next_ticket_number: number');
  });

  test('only superadmin and service role can call the internal state RPC', () => {
    const migration = read(
      'supabase/migrations/20260728113000_hide_public_contest_ticket_state.sql',
    );
    const internalRpc = migration.match(
      /CREATE OR REPLACE FUNCTION public\.get_contest_ticket_state_internal[\s\S]*?\$function\$;/,
    )?.[0] ?? '';

    expect(internalRpc).toContain("COALESCE(auth.role(), '') <> 'service_role'");
    expect(internalRpc).toContain('public.is_superadmin(auth.uid())');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_contest_ticket_state_internal(uuid[]) FROM anon',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_contest_ticket_state_internal(uuid[]) TO authenticated',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_contest_ticket_state_internal(uuid[]) TO service_role',
    );
  });

  test('legacy future-position RPCs are service-only and superadmin uses a guarded endpoint', () => {
    const migration = read(
      'supabase/migrations/20260728153516_restrict_internal_contest_position_rpcs.sql',
    );
    const admin = read('src/components/ContestDetailAdmin.tsx');

    for (const signature of [
      'public.get_contests_json()',
      'public.get_contest_bonus_stats(uuid)',
      'public.get_contest_bonus_stats_enhanced(uuid)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    }

    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.get_contests_json_internal_superadmin()',
    );
    expect(migration).toContain('public.is_superadmin(auth.uid())');
    expect(admin).toContain("rpc('get_contests_json_internal_superadmin')");
    expect(admin).not.toContain("rpc('get_contests_json')");

    const customerSources = publicContestReaders.map(read).join('\n');
    expect(customerSources).not.toMatch(
      /get_contests_json|get_contest_bonus_stats(?:_enhanced)?/,
    );
  });

  test('database test dynamically audits customer-executable SECURITY DEFINER leaks', () => {
    const databaseTest = read('supabase/tests/public_contest_ticket_state_privacy.sql');

    expect(databaseTest).toContain('p.prosecdef');
    expect(databaseTest).toContain("has_function_privilege('anon', p.oid, 'EXECUTE')");
    expect(databaseTest).toContain(
      "has_function_privilege('authenticated', p.oid, 'EXECUTE')",
    );
    expect(databaseTest).toContain(
      'ticket_number|ticket_position|next_ticket_number|',
    );
    expect(databaseTest).toContain(
      'no unguarded customer-executable SECURITY DEFINER function exposes internal ticket state',
    );
  });

  test('ticket purchase and mystery purchase contracts remain unchanged', () => {
    const standardPurchase = [
      'src/pages/ContestDetail.tsx',
      'src/pages/FavoriteGames.tsx',
      'src/pages/Games.tsx',
    ].map(read).join('\n');
    const mysteryPurchase = read('src/lib/mysteryCouponPurchase.ts');
    const migration = read(
      'supabase/migrations/20260728153516_restrict_internal_contest_position_rpcs.sql',
    );
    const wrapperFix = read(
      'supabase/migrations/20260728164924_fix_public_purchase_wrapper_identity.sql',
    );

    expect(standardPurchase).toMatch(/rpc\(["']buy_ticket_public["']/);
    expect(mysteryPurchase).toContain('"purchase_guaranteed_benefit_bundle_public"');
    expect(migration).not.toMatch(/\b(?:UPDATE|DELETE|INSERT)\s+(?:INTO\s+)?public\.contests\b/i);
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM authenticated',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM authenticated',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.buy_ticket_atomic(uuid, uuid) TO service_role',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) TO service_role',
    );
    expect(wrapperFix).toContain('v_user uuid := auth.uid()');
    expect(wrapperFix).toMatch(
      /buy_ticket_atomic\(\s*p_user_id\s*=>\s*v_user,\s*p_contest_id\s*=>\s*p_contest_id\s*\)/,
    );
    expect(wrapperFix).toMatch(
      /purchase_guaranteed_benefit_bundle_atomic\(\s*p_user_id\s*=>\s*v_user,\s*p_contest_id\s*=>\s*p_contest_id,\s*p_idempotency_key\s*=>\s*p_idempotency_key\s*\)/,
    );
    expect(wrapperFix).not.toContain(
      'buy_ticket_atomic(p_contest_id, p_user_id)',
    );
  });
});
