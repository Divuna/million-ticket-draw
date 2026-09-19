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

const disabledFunctions = [
  'event_forward_log_listener',
  'event_forward_log_listener_debug',
  'event_forward_log_listener_test_call',
  'forward_env_check',
  'forward_messages_to_sofinity',
  'forward_to_sofinity',
  'forward_to_sofinity_fixed',
  'invoke_env_check',
  'invoke_forward_to_sofinity',
  'invoke_helper_event_forward_log_listener',
  'invoke_listener_directly',
  'noop',
  'sofinity-noop',
  'sync-player-to-sofinity',
  'sync-to-sofinity',
  'trigger-sync-caller',
];

const disabledFunctionPaths = disabledFunctions.map((name) => `supabase/functions/${name}/index.ts`);

test.describe('legacy test/debug/Sofinity Edge Function security contract', () => {
  test('disabled legacy functions are tombstoned with 410 and have no privileged side effects', () => {
    const helper = read('supabase/functions/_shared/legacyGone.ts');

    expect(helper).toContain('status: 410');
    expect(helper).toContain('legacy test/debug/Sofinity endpoint is no longer available');
    expect(helper).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(helper).not.toContain('Deno.env.get');
    expect(helper).not.toContain('createClient(');
    expect(helper).not.toContain('fetch(');

    for (const functionPath of disabledFunctionPaths) {
      const source = read(functionPath);

      expect(source).toContain('serveLegacyGone');
      expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(source).not.toContain('Deno.env.get');
      expect(source).not.toContain('createClient(');
      expect(source).not.toContain('fetch(');
      expect(source).not.toMatch(/from\(['"][^'"]+['"]\)\s*\.\s*(insert|update|upsert|delete)/);
      expect(source).not.toMatch(/storage\s*\./);
      expect(source).not.toMatch(/OneSignal|ONESIGNAL|Resend|RESEND|Stripe|STRIPE|SOFINITY_/);
    }
  });

  test('disabled legacy functions are deployable as public 410 tombstones', () => {
    const config = read('supabase/config.toml');

    for (const functionName of disabledFunctions) {
      const section = new RegExp(`\\[functions\\.${functionName.replaceAll('-', '\\-')}\\]\\s+verify_jwt\\s*=\\s*false`);
      expect(config).toMatch(section);
    }
  });

  test('current application and active Edge Functions do not call disabled legacy endpoints', () => {
    const ignored = new Set<string>([
      ...disabledFunctionPaths,
      'supabase/functions/_shared/legacyGone.ts',
      'supabase/config.toml',
      'tests/e2e/94-legacy-edge-functions-security-contract.spec.ts',
    ]);

    const callers = listFiles('.').filter((file) => {
      if (
        ignored.has(file)
        || file.startsWith('docs/')
        || file.startsWith('supabase/migrations/')
        || file === 'CLAUDE.md'
        || file === 'onemil_history.md'
        || file === 'onemil_state.md'
      ) {
        return false;
      }

      const content = read(file);
      return disabledFunctions.some((name) => (
        content.includes(`functions.invoke('${name}'`)
        || content.includes(`functions.invoke("${name}"`)
        || content.includes(`/functions/v1/${name}`)
      ));
    }).sort();

    expect(callers).toEqual([]);
  });
});
