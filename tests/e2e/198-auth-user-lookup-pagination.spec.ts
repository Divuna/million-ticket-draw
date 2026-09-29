import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { findAuthUserIdByEmail, type AuthAdminListClient } from '../../supabase/functions/_shared/authUserLookup';

// Spec 198 — vyhledání auth uživatele podle e-mailu musí fungovat nad libovolným
// počtem účtů (dřív se četla jen 1. stránka po 50 / 1000). Nevytváří žádné účty:
// pracuje nad existujícími stagingovými účty. STAGING ONLY.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

type AdminUser = { id: string; email?: string | null };

async function listAll(admin: AuthAdminListClient): Promise<AdminUser[]> {
  const all: AdminUser[] = [];
  for (let page = 1; page <= 200; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < 1000) break;
  }
  return all;
}

test.describe('198 — stránkované hledání auth uživatele', () => {
  test.skip(!SUPABASE_URL.includes('dxmowysntemfqfnanxua') || !SERVICE_KEY, 'jen staging se service-role klíčem');

  test('najde uživatele na poslední stránce i přes hranici 1000 účtů', async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) as unknown as AuthAdminListClient;
    const all = await listAll(admin);
    const withEmail = all.filter((u) => !!u.email);
    expect(withEmail.length, 'staging musí mít stovky účtů').toBeGreaterThan(500);

    // Poslední účet v pořadí Admin API: s perPage=100 leží až za 5+ hranicemi stránek.
    const last = withEmail[withEmail.length - 1];
    expect(await findAuthUserIdByEmail(admin, last.email!, 100)).toBe(last.id);
    // Velikost písmen nesmí rozhodovat.
    expect(await findAuthUserIdByEmail(admin, last.email!.toUpperCase(), 100)).toBe(last.id);
    // Neexistující e-mail projde všechny stránky a vrátí null.
    expect(await findAuthUserIdByEmail(admin, `nobody-${Date.now()}@onemil.invalid`, 100)).toBeNull();

    // Skutečná produkční velikost stránky (1000): nad 1000 účtů musí najít i účet
    // za první stránkou (dřívější kód ho nenašel).
    if (all.length > 1000) {
      const beyond = all.slice(1000).find((u) => !!u.email)!;
      expect(await findAuthUserIdByEmail(admin, beyond.email!)).toBe(beyond.id);
    } else {
      test.info().annotations.push({ type: 'note', description: `staging má ${all.length} účtů (≤ 1000) — větev nad 1000 přeskočena` });
    }
  });
});
