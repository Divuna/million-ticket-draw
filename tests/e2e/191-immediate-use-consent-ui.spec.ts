/**
 * Spec 191 — aktivní souhlas s okamžitým použitím MIO před Stripe dobitím.
 *
 * STAGING ONLY. Test dočasně zapne povinný souhlas s označeným TESTOVACÍM
 * zněním (schválený právní text v projektu zatím není) a po sobě vrátí
 * původní nastavení. Ověřuje:
 *   - dialog se ukáže před platbou a bez zaškrtnutí nepustí dál,
 *   - po potvrzení Edge Function uloží souhlas (verze, přesné znění, čas,
 *     cena, Stripe session) a pošle na Stripe TEST checkout,
 *   - zrušení dialogu platbu vůbec nespustí.
 * Na Stripe se nenaviguje — požadavek na checkout.stripe.com se zachytí.
 *
 * Required env: VITE_SUPABASE_URL (staging), E2E_SUPABASE_SERVICE_ROLE_KEY,
 *               E2E_TEST_EMAIL, E2E_TEST_PASSWORD
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

const TEST_VERSION = `E2E-TEST-${Date.now()}`;
const TEST_TEXT = 'TESTOVACÍ ZNĚNÍ PRO STAGING E2E — nejde o schválený právní text.';
const KEYS = ['immediate_use_consent_required', 'immediate_use_consent_version', 'immediate_use_consent_text'];

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

let original: Record<string, string> = {};

async function setSettings(db: SupabaseClient, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    const { error } = await db.from('settings').upsert({ key, value }, { onConflict: 'key' });
    if (error) throw new Error(`settings ${key}: ${error.message}`);
  }
}

test.describe('191 souhlas s okamžitým použitím MIO (staging)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    if (!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE || !EMAIL || !PASSWORD) return;
    const db = admin();
    const { data } = await db.from('settings').select('key, value').in('key', KEYS);
    original = Object.fromEntries((data ?? []).map((row) => [row.key as string, row.value as string]));
    await setSettings(db, {
      immediate_use_consent_required: 'true',
      immediate_use_consent_version: TEST_VERSION,
      immediate_use_consent_text: TEST_TEXT,
    });
  });

  test.afterAll(async () => {
    if (!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    await setSettings(admin(), {
      immediate_use_consent_required: original.immediate_use_consent_required ?? 'false',
      immediate_use_consent_version: original.immediate_use_consent_version ?? '',
      immediate_use_consent_text: original.immediate_use_consent_text ?? '',
    });
  });

  test.beforeEach(async ({ page }) => {
    test.skip(
      !SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE || !EMAIL || !PASSWORD,
      'staging-only — vyžaduje staging Supabase a zákaznický testovací účet',
    );
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: Date.now() }),
      );
    });
    // Na Stripe se nikdy nenaviguje.
    await page.route('https://checkout.stripe.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stripe-intercepted</body></html>' }),
    );
  });

  test('191a: bez potvrzení se platba nespustí, zrušení nic nevolá', async ({ page }) => {
    await loginViaUI(page, EMAIL, PASSWORD);
    let checkoutCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('/functions/v1/create-stripe-checkout')) checkoutCalls += 1;
    });

    await page.goto('/top-up');
    await page.locator('.homepage-miocoin-button').nth(1).click();

    const dialog = page.getByTestId('immediate-use-consent-dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText(TEST_TEXT);
    await expect(dialog).toContainText('300 Kč');
    await expect(page.getByTestId('immediate-use-consent-confirm')).toBeDisabled();

    await dialog.getByRole('button', { name: 'Zrušit' }).click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(1_000);
    expect(checkoutCalls).toBe(0);
  });

  test('191b: po potvrzení se uloží souhlas s verzí, zněním, cenou a Stripe session', async ({ page }) => {
    const db = admin();
    const startedAt = new Date().toISOString();
    await loginViaUI(page, EMAIL, PASSWORD);
    await page.goto('/top-up');
    await page.locator('.homepage-miocoin-button').nth(1).click();

    const dialog = page.getByTestId('immediate-use-consent-dialog');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('immediate-use-consent-checkbox').click();

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/functions/v1/create-stripe-checkout'), { timeout: 30_000 }),
      page.getByTestId('immediate-use-consent-confirm').click(),
    ]);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(String(body.checkout_url)).toContain('checkout.stripe.com');

    const { data: user } = await db.from('users').select('id').eq('email', EMAIL).single();
    const { data: consents } = await db
      .from('payment_immediate_use_consents')
      .select('consent_version, consent_text, price_czk, stripe_session_id, accepted_at')
      .eq('user_id', user!.id)
      .gte('accepted_at', startedAt)
      .order('accepted_at', { ascending: false });
    expect(consents?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(consents![0]).toMatchObject({ consent_version: TEST_VERSION, consent_text: TEST_TEXT, price_czk: 300 });
    expect(String(consents![0].stripe_session_id)).toMatch(/^cs_test_/);
  });

  test('191c: server odmítne checkout bez souhlasu, když je povinný', async ({ page }) => {
    await loginViaUI(page, EMAIL, PASSWORD);
    const result = await page.evaluate(async () => {
      const raw = Object.keys(window.localStorage).find((k) => k.includes('auth'));
      const session = raw ? JSON.parse(window.localStorage.getItem(raw) ?? '{}') : {};
      return session?.access_token ?? null;
    });
    test.skip(!result, 'nepodařilo se získat přístupový token z prohlížeče');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-stripe-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${result}`, apikey: process.env.VITE_SUPABASE_ANON_KEY ?? '' },
      body: JSON.stringify({ priceInCzk: 300 }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('immediate_use_consent_required');
  });
});
