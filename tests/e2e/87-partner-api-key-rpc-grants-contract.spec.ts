import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const repoPath = (path: string) => resolve(process.cwd(), path);

const migrationPath = 'supabase/migrations/20260718164412_restrict_partner_api_key_rpc_access.sql';

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

test.describe('partner API key mutation RPC grant contract', () => {
  test('migration restricts API key generation helpers to service role', () => {
    const migration = read(migrationPath);

    for (const signature of [
      'public.generate_partner_api_key(uuid)',
      'public.rotate_partner_api_key(uuid)',
    ]) {
      expect(migration).toContain(`ALTER FUNCTION ${signature} SET search_path TO public`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    }
  });

  test('legitimate API key generation stays behind Edge Function authorization', () => {
    const adminGenerate = read('supabase/functions/admin-generate-partner-api-key/index.ts');
    const partnerRotate = read('supabase/functions/partner-rotate-api-key/index.ts');
    const legacyRotate = read('supabase/functions/rotate-partner-api-key/index.ts');

    for (const edgeFunction of [adminGenerate, partnerRotate, legacyRotate]) {
      expect(edgeFunction).toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(edgeFunction).toContain('generate_partner_api_key');
    }

    expect(adminGenerate).toContain('user_roles');
    expect(adminGenerate).toMatch(/admin|superadmin/);
    expect(partnerRotate).toContain('auth_user_id');
    expect(legacyRotate).toContain('user_roles');
  });

  test('frontend does not call service-role-only API key mutation RPCs directly', () => {
    const disallowedFrontendCallers = listFiles('src').filter((file) => {
      if (file === 'src/integrations/supabase/types.ts') {
        return false;
      }
      const content = read(file);
      return content.includes('generate_partner_api_key')
        || content.includes('rotate_partner_api_key');
    }).sort();

    expect(disallowedFrontendCallers).toEqual([]);
  });

  test('role and partner status RPCs remain guarded and are not redefined by this migration', () => {
    const migration = read(migrationPath);
    const generatedTypes = read('src/integrations/supabase/types.ts');

    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.set_user_role');
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.admin_set_partner_status');
    expect(generatedTypes).toContain('set_user_role');
    expect(generatedTypes).toContain('admin_set_partner_status');
  });
});
