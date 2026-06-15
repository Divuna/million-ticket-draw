/**
 * Spec 55 — C23: Invite reward / Doporučení zákazníka
 *
 * Co lze ověřit BEZ Stripe platby:
 *   55a — ReferralSection se zobrazí na /profile (uživatel vidí sekci „Pozvi přátele")
 *   55b — Vlastní referral kód je viditelný (ensure_referral_code RPC)
 *   55c — Uživatel nevidí referral data jiného uživatele (RLS izolace own-row)
 *   55d — Anon klient nemá přístup k tabulkám referrals/referral_codes (RLS deny)
 *
 * Co je BLOCKED-BY-PAY01–PAY03:
 *   • Samotný wallet credit za doporučení vzniká VÝHRADNĚ přes
 *     `create_referral_reward_from_payment` — trigger na payment_status='completed'.
 *   • Plný flow (registrace referovaného → platba → MioCoin odměna doporučiteli) vyžaduje
 *     reálnou Stripe platbu přes webhook. Nelze testovat bez PAY01–PAY03.
 *
 * Staging-only (vyžaduje E2E_TEST_EMAIL / E2E_TEST_PASSWORD).
 * Read-only (55a/55b/55c/55d) — žádné platby, žádné wallet credit.
 *
 * 55c/55d: ověřuje RLS přes supabase-js klient (anon + customer2 auth).
 * Vyžaduje E2E_SUPABASE_SERVICE_ROLE_KEY pro vytvoření throwaway customer2.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const STAGING_REF    = 'dxmowysntemfqfnanxua';
const SUPABASE_URL   = process.env.VITE_SUPABASE_URL   ?? '';
const ANON_KEY       = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE   = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const TEST_EMAIL     = process.env.E2E_TEST_EMAIL     ?? '';
const TEST_PASSWORD  = process.env.E2E_TEST_PASSWORD  ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) &&
  !!ANON_KEY && !!SERVICE_ROLE &&
  !!TEST_EMAIL && !!TEST_PASSWORD;

const RUN_ID = Date.now();
const C2_EMAIL    = `e2e-c23-c2-${RUN_ID}@onemil.cz`;
const C2_PASSWORD = `TestPass${RUN_ID}!`;

function makeServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function makeAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const ctx: { c2UserId?: string } = {};

test.describe('55 — C23: Invite referral (bez Stripe platby)', () => {
  test.afterAll(async () => {
    if (!isStaging || !ctx.c2UserId) return;
    const svc = makeServiceClient();
    await (svc as any).auth.admin.deleteUser(ctx.c2UserId);
  });

  // ── 55a: ReferralSection je viditelná na /profile ────────────────────────
  test('55a) ReferralSection viditelná na /profile — „Pozvi přátele"', async ({ page }) => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(60_000);

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto('/profile');

    // Hledáme nadpis sekce „Pozvi přátele" (ReferralSection.tsx)
    const heading = page.getByRole('heading', { name: /Pozvi přátele/i }).first();
    await expect(heading, 'ReferralSection musí zobrazit nadpis „Pozvi přátele"').toBeVisible({
      timeout: 15_000,
    });
  });

  // ── 55b: Vlastní referral kód je viditelný ───────────────────────────────
  test('55b) Vlastní referral kód je viditelný na /profile', async ({ page }) => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(60_000);

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto('/profile');

    // Počkáme na sekci; kód se zobrazí po načtení (ensure_referral_code RPC)
    const heading = page.getByRole('heading', { name: /Pozvi přátele/i }).first();
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Input/text s referral kódem — hledáme input readonly nebo text s krátkým kódem
    // ReferralSection renderuje kód do Input value (readonly), nebo do span s kódem
    await page.waitForTimeout(2_000); // necháme RPC doběhnout
    const codeInput = page.locator('input[readonly]').first();
    const hasInput = await codeInput.isVisible().catch(() => false);
    if (hasInput) {
      const val = await codeInput.inputValue();
      expect(val.length, 'Referral kód musí být neprázdný řetězec').toBeGreaterThan(0);
    } else {
      // fallback: hledáme libovolný viditelný text, který vypadá jako kód (6–12 znaků velká)
      const codePattern = page.locator('text=/^[A-Z0-9]{4,16}$/').first();
      await expect(codePattern, 'Referral kód musí být viditelný na /profile').toBeVisible({
        timeout: 5_000,
      });
    }
  });

  // ── 55c: RLS own-row — customer2 nevidí referraly customer1 ─────────────
  test('55c) RLS izolace — zákazník2 nevidí referral kódy zákazníka1', async () => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(30_000);

    const svc = makeServiceClient();

    // Vytvoříme throwaway customer2
    const { data: c2Auth, error: createErr } = await (svc as any).auth.admin.createUser({
      email: C2_EMAIL,
      password: C2_PASSWORD,
      email_confirm: true,
    });
    if (createErr) throw new Error(`Create c2 failed: ${createErr.message}`);
    ctx.c2UserId = c2Auth.user.id;

    // Přihlásíme customer2 přes anon klient
    const anonClient = makeAnonClient();
    const { error: signInErr } = await anonClient.auth.signInWithPassword({
      email: C2_EMAIL,
      password: C2_PASSWORD,
    });
    if (signInErr) throw new Error(`c2 signIn failed: ${signInErr.message}`);

    // Pokusíme se číst referral_codes jako customer2 — měl by vidět JEN vlastní řádky
    const { data: codes, error: codesErr } = await (anonClient as any)
      .from('referral_codes')
      .select('user_id, code')
      .neq('user_id', ctx.c2UserId!); // cizí kódy

    // RLS: own-row policy → žádné cizí kódy nesmí být vráceny
    // (buď error, nebo prázdné pole)
    const foreignRows = (codes ?? []).length;
    expect(
      foreignRows,
      `RLS: zákazník2 nesmí vidět cizí referral_codes (got ${foreignRows} rows)`,
    ).toBe(0);

    await anonClient.auth.signOut();
  });

  // ── 55d: Anon klient nemá přístup k referral tabulkám ───────────────────
  test('55d) Anon klient nemá přístup k referral_codes / referrals', async () => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(15_000);

    const anonClient = makeAnonClient();

    const { data: codes } = await (anonClient as any)
      .from('referral_codes')
      .select('user_id');

    const { data: refs } = await (anonClient as any)
      .from('referrals')
      .select('id');

    // RLS: anon (nepřihlášený) musí dostat 0 řádků z obou tabulek
    expect(
      (codes ?? []).length,
      'Anon klient nesmí vidět žádné referral_codes',
    ).toBe(0);

    expect(
      (refs ?? []).length,
      'Anon klient nesmí vidět žádné referrals',
    ).toBe(0);
  });
});
