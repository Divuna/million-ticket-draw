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
      expect(source, file).toMatch(/\.from\(['"]public_contests['"]\)/);
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

  test('ticket purchase and mystery purchase contracts remain unchanged', () => {
    const standardPurchase = [
      'src/pages/ContestDetail.tsx',
      'src/pages/FavoriteGames.tsx',
      'src/pages/Games.tsx',
    ].map(read).join('\n');
    const mysteryPurchase = read('src/lib/mysteryCouponPurchase.ts');
    const migration = read(
      'supabase/migrations/20260728113000_hide_public_contest_ticket_state.sql',
    );

    expect(standardPurchase).toMatch(/rpc\(["']buy_ticket_public["']/);
    expect(mysteryPurchase).toContain('"purchase_guaranteed_benefit_bundle_public"');
    expect(migration).not.toMatch(/\b(?:UPDATE|DELETE|INSERT)\s+(?:INTO\s+)?public\.contests\b/i);
    expect(migration).not.toContain('buy_ticket_atomic');
    expect(migration).not.toContain('purchase_guaranteed_benefit_bundle_atomic');
  });
});
