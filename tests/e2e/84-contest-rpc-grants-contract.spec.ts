import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const repoPath = (path: string) => resolve(process.cwd(), path);

const migrationPath = 'supabase/migrations/20260718153015_restrict_contest_bonus_rpc_execute.sql';

const trustedOnlySignatures = [
  'public.fn_close_contest(uuid)',
  'public.generate_miocoin_bonus(uuid, integer)',
  'public.process_event_queue_miocoin()',
];

const adminContestControlSignatures = [
  'public.close_contest(uuid)',
  'public.trigger_contest_draw(uuid)',
  'public.pause_contest(uuid)',
  'public.resume_contest(uuid)',
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

test.describe('contest and MioCoin RPC grant contract', () => {
  test('migration removes public execution from unguarded contest and bonus helpers', () => {
    const migration = read(migrationPath);

    for (const signature of trustedOnlySignatures) {
      expect(migration).toContain(`ALTER FUNCTION ${signature} SET search_path TO public`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
    }

    expect(migration).toContain('REVOKE ALL ON FUNCTION public.fn_close_contest(uuid) FROM service_role');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.generate_miocoin_bonus(uuid, integer) TO service_role');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.process_event_queue_miocoin() TO service_role');
  });

  test('admin contest-control RPCs keep authenticated admin path but remove anonymous access', () => {
    const migration = read(migrationPath);

    for (const signature of adminContestControlSignatures) {
      expect(migration).toContain(`ALTER FUNCTION ${signature} SET search_path TO public`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    }
  });

  test('MioCoin bonus generation remains reachable only through the internal queue/server boundary', () => {
    const migration = read(migrationPath);
    const generatedTypes = read('src/integrations/supabase/types.ts');

    expect(generatedTypes).toContain('generate_miocoin_bonus');
    expect(generatedTypes).toContain('process_event_queue_miocoin');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.process_event_queue_miocoin() TO service_role');

    const directApplicationCallers = listFiles('.').filter((file) => {
      if (
        file === 'tests/e2e/84-contest-rpc-grants-contract.spec.ts'
        || file === migrationPath
        || file.startsWith('supabase/migrations/')
        || file.startsWith('supabase/sql/')
        || file.startsWith('docs/')
        || file === 'src/integrations/supabase/types.ts'
      ) {
        return false;
      }
      const content = read(file);
      return content.includes('generate_miocoin_bonus') || content.includes('fn_close_contest');
    }).sort();

    expect(directApplicationCallers).toEqual([]);
  });

  test('superadmin UI still uses role-checked contest-control RPCs, not legacy fn_close_contest', () => {
    const controlPanel = read('src/components/admin/ContestControlPanel.tsx');

    expect(controlPanel).toContain("callRpc('close_contest'");
    expect(controlPanel).toContain("callRpc('trigger_contest_draw'");
    expect(controlPanel).toContain("callRpc('pause_contest'");
    expect(controlPanel).toContain("callRpc('resume_contest'");
    expect(controlPanel).not.toContain('fn_close_contest');
    expect(controlPanel).not.toContain('generate_miocoin_bonus');
  });
});
