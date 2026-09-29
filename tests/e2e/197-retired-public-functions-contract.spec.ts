import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Spec 197 — veřejné Edge Functions bez autorizace, které aplikace nepoužívá,
// jsou vyřazené (410) a nesmí se vrátit k service-role / storage / OpenAI.
// Předstartovní audit 29. 9. 2026.

const RETIRED = ['generate-ticket-image', 'sofinity-agent-dispatcher'];

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${entry}`;
    if (rel.includes('node_modules')) continue;
    const st = statSync(join(process.cwd(), rel));
    if (st.isDirectory()) out.push(...listFiles(rel));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(rel);
  }
  return out;
}

test.describe('197 — vyřazené veřejné Edge Functions', () => {
  for (const fn of RETIRED) {
    test(`${fn} vrací 410 a nemá přístup k DB, storage ani OpenAI`, () => {
      const src = read(`supabase/functions/${fn}/index.ts`)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(src).toContain('status: 410');
      expect(src).toContain('endpoint_retired');
      for (const forbidden of ['createClient', 'getSupabaseSecretKey', 'SERVICE_ROLE', 'storage', 'openai', 'OPENAI']) {
        expect(src, `${fn} nesmí obsahovat ${forbidden}`).not.toContain(forbidden);
      }
    });
  }

  test('aplikační kód vyřazené funkce nevolá', () => {
    const callers = [...listFiles('src'), ...listFiles('supabase/functions')]
      .filter((f) => !RETIRED.some((fn) => f.startsWith(`supabase/functions/${fn}/`)))
      .filter((f) => RETIRED.some((fn) => read(f).includes(fn)));
    expect(callers).toEqual([]);
  });
});
