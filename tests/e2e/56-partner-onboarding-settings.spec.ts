/**
 * Spec 56 — P01/P04/P05: Partner onboarding + dashboard nastavení
 *
 * Staging-only, self-contained. Žádná Stripe platba, žádný webhook.
 * Žádná produkční data. Cleanup v afterAll (vždy, i při selhání).
 *
 * 56a — /partner/register: form UI loads bez chyb, povinná pole viditelná
 *        (e-mail, heslo, firemní název, web), validace chybějících polí → Czech
 *        toast, úspěšný submit s testovacím e-mailem → stránka "Registrace odeslána".
 *        Cleanup: smazat auth user přes service_role v afterAll.
 *        (Pokrývá LAUNCH_TODO P01)
 *
 * 56b — Partner konverze nastavení: throwaway approved partner → /partner/dashboard
 *        → sekce "Nastavení konverze MioCoinů" → nastavit reward_base_czk=100,
 *        reward_mc=1 → "Uložit" → toast "Nastavení odměn bylo uloženo" → verify v DB.
 *        (Pokrývá LAUNCH_TODO P04)
 *
 * 56c — Partner API klíč sekce: throwaway approved partner → /partner/dashboard →
 *        sekce "API klíče" viditelná → tlačítko "Regenerovat API klíč" viditelné.
 *        (Pokrývá LAUNCH_TODO P05 — sekce API klíče přístupná schválenému partnerovi)
 *
 * Required env vars (všechny přítomny v playwright-staging.yml):
 *   VITE_SUPABASE_URL               — musí obsahovat staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Config ──────────────────────────────────────────────────────────────────

const STAGING_REF    = 'dxmowysntemfqfnanxua';
const SUPABASE_URL   = process.env.VITE_SUPABASE_URL           ?? '';
const SUPABASE_ANON  = process.env.VITE_SUPABASE_ANON_KEY      ?? '';
const SERVICE_ROLE   = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!SUPABASE_ANON && !!SERVICE_ROLE;

const RUN_ID           = Date.now();
const REG_EMAIL        = `spec56-reg-${RUN_ID}@onemil.cz`;
const REG_PASSWORD     = `Spec56R!${RUN_ID}x`;
const PARTNER_EMAIL    = `spec56-partner-${RUN_ID}@onemil.cz`;
const PARTNER_PASSWORD = `Spec56P!${RUN_ID}x`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSvc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Shared context for cleanup
const ctx: {
  regAuthUserId?: string;
  partnerAuthUserId?: string;
  partnerId?: string;
} = {};

// Setup throwaway approved partner (for 56b/56c)
async function setupApprovedPartner(): Promise<void> {
  const svc = makeSvc();

  const { data: u, error: uErr } = await svc.auth.admin.createUser({
    email: PARTNER_EMAIL,
    password: PARTNER_PASSWORD,
    email_confirm: true,
  });
  if (uErr) throw new Error(`createUser partner: ${uErr.message}`);
  ctx.partnerAuthUserId = u.user.id;

  const { data: p, error: pErr } = await (svc as any)
    .from('partners')
    .insert({
      name: `E2E Spec56 Partner ${RUN_ID}`,
      company_name: `E2E Spec56 s.r.o. ${RUN_ID}`,
      logo_url: 'https://example.invalid/spec56-logo.png',
      website_url: 'https://example.invalid/spec56',
      contact_email: PARTNER_EMAIL,
      auth_user_id: u.user.id,
      status: 'approved',
      approved_at: new Date().toISOString(),
      reward_base_czk: 0,
      reward_mc: 0,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`partners insert: ${pErr.message}`);
  ctx.partnerId = p.id as string;
}

async function loginAsPartner(page: Page): Promise<void> {
  // Pre-seed cookie consent so CookieConsentBanner never intercepts pointer events.
  await page.addInitScript(() => {
    localStorage.setItem('cookie_consent', JSON.stringify({
      essential: true, analytics: false, marketing: false,
      timestamp: new Date().toISOString(),
    }));
  });
  await page.goto('/partner/login');
  await page.getByLabel(/e-mail/i).first().fill(PARTNER_EMAIL);
  await page.getByLabel(/heslo/i).first().fill(PARTNER_PASSWORD);
  await page.getByRole('button', { name: /přihlásit/i }).first().click();
  await page.waitForURL(/\/partner\/dashboard/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
}

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe('56 — Partner onboarding + dashboard nastavení (P01/P04/P05)', () => {

  test.beforeAll(async () => {
    if (!isStaging) return;
    await setupApprovedPartner();
  });

  test.afterAll(async () => {
    if (!isStaging) return;
    const svc = makeSvc();

    // Cleanup 56a: smazat auth user vytvořený registračním formulářem
    if (ctx.regAuthUserId) {
      await svc.auth.admin.deleteUser(ctx.regAuthUserId).catch(() => undefined);
    } else {
      // Fallback: hledáme přes listUsers
      try {
        const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 1000 });
        const regUser = users?.find((u: any) => u.email === REG_EMAIL);
        if (regUser) await svc.auth.admin.deleteUser(regUser.id).catch(() => undefined);
      } catch (_) {
        // best-effort
      }
    }

    // Cleanup 56b/56c: smazat throwaway partner
    if (ctx.partnerId) {
      try {
        await (svc as any).from('partners').delete().eq('id', ctx.partnerId);
      } catch (_) { /* best-effort */ }
    }
    if (ctx.partnerAuthUserId) {
      await svc.auth.admin.deleteUser(ctx.partnerAuthUserId).catch(() => undefined);
    }
  });

  // ── 56a: Partner registrace form ─────────────────────────────────────────

  test('56a) /partner/register: form viditelný + validace + úspěšný submit', async ({ page }) => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(60_000);

    // Pre-seed cookie consent so CookieConsentBanner (fixed bottom-0 z-[100])
    // never appears and never intercepts pointer events.
    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({
        essential: true, analytics: false, marketing: false,
        timestamp: new Date().toISOString(),
      }));
    });

    await page.goto('/partner/register');
    await page.waitForLoadState('domcontentloaded');

    // Form musí mít povinná pole
    const emailInput    = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(emailInput,    'E-mail input viditelný').toBeVisible({ timeout: 10_000 });
    await expect(passwordInput, 'Heslo input viditelný').toBeVisible({ timeout: 5_000 });

    // Firemní název — label "Název" nebo placeholder
    const companyInput = page.locator('input').filter({ hasText: '' }).nth(2);
    // Flexible: hledáme input s label obsahujícím "Název" nebo "název"
    const companyField = page.getByLabel(/název/i).first();
    const webField     = page.getByLabel(/web/i).first();
    await expect(companyField, 'Název firmy input viditelný').toBeVisible({ timeout: 5_000 });
    await expect(webField,     'Web input viditelný').toBeVisible({ timeout: 5_000 });

    // Validace: submit bez vyplnění → Czech toast
    const submitBtn = page.getByRole('button', { name: /registrovat|odeslat|vytvořit/i }).first();
    await submitBtn.click();
    // Toast "Vyplňte prosím všechna povinná pole"
    const toast = page.getByText(/vyplňte prosím|povinná pole/i).first();
    await expect(toast, 'Toast o chybějících polích musí být viditelný').toBeVisible({ timeout: 5_000 });

    // Úspěšný submit s testovacím unikátním e-mailem
    await emailInput.fill(REG_EMAIL);
    // Heslo (prvního input[type="password"])
    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.nth(0).fill(REG_PASSWORD);
    // Potvrzení hesla (druhé password input)
    const pwCount = await pwInputs.count();
    if (pwCount >= 2) {
      await pwInputs.nth(1).fill(REG_PASSWORD);
    }
    await companyField.fill(`E2E Spec56 Firma ${RUN_ID}`);
    await webField.fill('https://spec56-test.example.invalid');

    await submitBtn.click();

    // Po úspěšném submitu → "Registrace odeslána"
    // Timeout 30s: staging pod Full E2E zátěží (~55 specs) může mít pomalejší auth.signUp.
    const successHeading = page.getByText(/registrace odeslána/i).first();
    await expect(successHeading, 'Nadpis "Registrace odeslána" po úspěšném submitu').toBeVisible({
      timeout: 30_000,
    });
  });

  // ── 56b: Konverze nastavení save ─────────────────────────────────────────

  test('56b) Partner konverze nastavení: save reward_base_czk+reward_mc → toast + DB', async ({ page }) => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(60_000);

    await loginAsPartner(page);

    // Sekce "Nastavení konverze MioCoinů"
    const heading = page.getByText(/Nastavení konverze MioCoinů/i).first();
    await expect(heading, 'Sekce "Nastavení konverze MioCoinů" viditelná').toBeVisible({ timeout: 10_000 });

    // Nastavení hodnot — input ids: reward-base-czk, reward-mc
    const baseCzkInput = page.locator('#reward-base-czk');
    const mcInput      = page.locator('#reward-mc');
    await expect(baseCzkInput, 'Input reward-base-czk viditelný').toBeVisible({ timeout: 5_000 });
    await expect(mcInput,      'Input reward-mc viditelný').toBeVisible({ timeout: 5_000 });

    // Vyčistit a nastavit nové hodnoty
    await baseCzkInput.fill('100');
    await mcInput.fill('1');

    // Uložit — tlačítko "Uložit" v sekci konverze
    const saveBtn = page.getByRole('button', { name: /^Uložit$/i }).first();
    await expect(saveBtn, 'Tlačítko Uložit je enabled po změně hodnot').toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Toast "Nastavení odměn bylo uloženo"
    const successToast = page.getByText(/nastavení odměn bylo uloženo/i).first();
    await expect(successToast, 'Toast "Nastavení odměn bylo uloženo"').toBeVisible({ timeout: 10_000 });

    // Počkáme na dokončení DB write — toast se může zobrazit před commit na DB
    await page.waitForTimeout(2_000);

    // DB verify: zkontrolovat reward_base_czk=100, reward_mc=1
    if (ctx.partnerId) {
      const svc = makeSvc();
      const { data: partnerRow, error: dbErr } = await (svc as any)
        .from('partners')
        .select('reward_base_czk, reward_mc')
        .eq('id', ctx.partnerId)
        .single();
      if (dbErr) throw new Error(`DB verify failed: ${dbErr.message}`);
      expect(
        partnerRow.reward_base_czk,
        'DB: reward_base_czk === 100 po uložení',
      ).toBe(100);
      expect(
        partnerRow.reward_mc,
        'DB: reward_mc === 1 po uložení',
      ).toBe(1);
    }
  });

  // ── 56c: API klíč sekce ───────────────────────────────────────────────────

  test('56c) Partner API klíče sekce: viditelná pro schváleného partnera', async ({ page }) => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(60_000);

    await loginAsPartner(page);

    // Sekce "API klíče"
    const apiSection = page.getByText('API klíče').first();
    await expect(apiSection, 'Nadpis sekce "API klíče" viditelný').toBeVisible({ timeout: 10_000 });

    // Tlačítko "Regenerovat API klíč" (schválený partner bez aktivního klíče)
    const rotateBtn = page.getByRole('button', { name: /regenerovat api klíč/i }).first();
    await expect(rotateBtn, 'Tlačítko "Regenerovat API klíč" viditelné').toBeVisible({ timeout: 5_000 });
  });

});
