import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const publicContestPages = [
  'src/pages/Games.tsx',
  'src/pages/ContestDetail.tsx',
  'src/pages/FavoriteGames.tsx',
  'src/pages/MyContestDetail.tsx',
];

const superadminContestComponents = [
  'src/components/AdminContestManagement.tsx',
  'src/components/TicketMapAdmin.tsx',
  'src/components/ContestDetailAdmin.tsx',
  'src/components/admin/ContestControlPanel.tsx',
];

test.describe('contest_progress superadmin-only contract', () => {
  test('public contest pages do not fetch exact contest progress', () => {
    for (const path of publicContestPages) {
      const source = read(path);
      expect(source, `${path} must not query contest_progress`).not.toContain("from('contest_progress')");
      expect(source, `${path} must not query contest_progress`).not.toContain('from("contest_progress")');
      expect(source, `${path} must not call admin progress RPC`).not.toContain('get_contest_progress_admin');
    }
  });

  test('superadmin contest UI uses the guarded progress RPC instead of direct view access', () => {
    for (const path of superadminContestComponents) {
      const source = read(path);
      expect(source, `${path} should use guarded RPC`).toContain('get_contest_progress_admin');
      expect(source, `${path} must not query contest_progress directly`).not.toContain("from('contest_progress')");
      expect(source, `${path} must not query contest_progress directly`).not.toContain('from("contest_progress")');
    }
  });

  test('migration revokes public view access and creates a superadmin-gated RPC', () => {
    const migration = read('supabase/migrations/20260718143718_contest_progress_superadmin_only.sql');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_contest_progress_admin');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('NOT public.is_superadmin(auth.uid())');
    expect(migration).toContain('REVOKE SELECT ON TABLE public.contest_progress FROM anon');
    expect(migration).toContain('REVOKE SELECT ON TABLE public.contest_progress FROM authenticated');
    expect(migration).toContain('GRANT SELECT ON TABLE public.contest_progress TO service_role');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_contest_progress_admin(uuid[]) TO authenticated');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_contest_management_data(uuid) FROM anon');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_contest_management_data(uuid) FROM authenticated');
  });
});
