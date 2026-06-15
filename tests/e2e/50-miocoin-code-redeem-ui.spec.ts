/**
 * Spec 50 — C07: MioCoin kód uplatnění (zákaznický UI flow)
 *
 * Staging-only, self-contained. Ověřuje zákaznický UI flow pro uplatnění
 * MioCoin kódu přes `RedeemMioCoinCard` na stránce `/profile`.
 *
 * Setup (service role):
 *   - Throwaway partner auth user + partners řádek (approved)
 *   - Throwaway customer auth user + public.users řádek
 *   - Objednávka přes create_partner_order_reward → status `pending`
 *   - Aktivace přes update_partner_order_reward_status → status `issued`
 *     (stejný flow jako reálný partner po zaplacení objednávky)
 *
 * Testy:
 *   50a) zákazník uplatní `issued` kód přes UI → success toast + kód `activated`
 *   50b) neplatný kód zobrazí chybový toast
 *   50c) již uplatněný kód zobrazí "already_used" toast
 *
 * Cleanup: smaže všechna testovací data v afterAll, i při selhání.
 *
 * Vyžaduje env vars (přítomné v playwright-staging.yml):
 *   VITE_SUPABASE_URL               — staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!ANON_KEY && !!SERVICE_ROLE;

const RUN_ID         = Date.now();
const PARTNER_EMAIL  = `spec50-partner-${RUN_ID}@onemil.cz`;
const CUSTOMER_EMAIL = `spec50-customer-${RUN_ID}@onemil.cz`;
const PASSWORD       = `Spec50!${RUN_ID}x`;
const ORDER_ID       = `SPEC50-ORDER-${RUN_ID}`;

// Konverze: 100 Kč = 1 MioCoin; objednávka 200 Kč → 2 coiny
const REWARD_BASE_CZK = 100;
const REWARD_MC       = 1;
const ORDER_TOTAL     = 200;

const ctx: {
  partnerAuthId?: string;
  customerAuthId?: string;
  partnerId?: string;
  code?: string;
} = {};

function makeAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function setupData(): Promise<void> {
  const admin = makeAdmin();

  // 1. Partner auth user
  const { data: pu, error: puErr } = await admin.auth.admin.createUser({
    email: PARTNER_EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (puErr) throw new Error(`createUser(partner): ${puErr.message}`);
  ctx.partnerAuthId = pu.user.id;

  // 2. Customer auth user
  const { data: cu, error: cuErr } = await admin.auth.admin.createUser({
    email: CUSTOMER_EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (cuErr) throw new Error(`createUser(customer): ${cuErr.message}`);
  ctx.customerAuthId = cu.user.id;

  // 3. public.users pro zákazníka (FK target pro wallets)
  const { error: userErr } = await (admin as any)
    .from('users')
    .upsert({ id: ctx.customerAuthId, email: CUSTOMER_EMAIL, role: 'user' }, { onConflict: 'id' });
  if (userErr) throw new Error(`public.users upsert: ${userErr.message}`);

  // 4. Approved partner
  const { data: p, error: pErr } = await (admin as any)
    .from('partners')
    .insert({
      name: `E2E Spec50 Partner ${RUN_ID}`,
      company_name: `E2E Spec50 s.r.o.`,
      logo_url: 'https://example.invalid/spec50.png',
      website_url: 'https://example.invalid/spec50',
      contact_email: PARTNER_EMAIL,
      auth_user_id: ctx.partnerAuthId,
      status: 'approved',
      approved_at: new Date().toISOString(),
      reward_base_czk: REWARD_BASE_CZK,
      reward_mc: REWARD_MC,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`partners insert: ${pErr.message}`);
  ctx.partnerId = p.id as string;

  // 5. Vytvořit objednávkovou odměnu (pending)
  const { data: createResult, error: createErr } = await (admin as any).rpc(
    'create_partner_order_reward',
    {
      p_partner_id: ctx.partnerId,
      p_external_order_id: ORDER_ID,
      p_customer_email: CUSTOMER_EMAIL,
      p_order_total_czk: ORDER_TOTAL,
    },
  );
  if (createErr) throw new Error(`create_partner_order_reward: ${createErr.message}`);
  ctx.code = (createResult as any)?.code as string;
  if (!ctx.code) throw new Error('create_partner_order_reward did not return a code');

  // 6. Aktivovat odměnu (pending → issued) — simulace zaplacení objednávky
  const { error: updateErr } = await (admin as any).rpc(
    'update_partner_order_reward_status',
    {
      p_partner_id: ctx.partnerId,
      p_external_order_id: ORDER_ID,
      p_order_status: 'paid',
    },
  );
  if (updateErr) throw new Error(`update_partner_order_reward_status: ${updateErr.message}`);
}

async function cleanupData(): Promise<void> {
  const admin = makeAdmin();
  if (ctx.partnerId) {
    await (admin as any).from('partner_coin_activations').delete().eq('partner_id', ctx.partnerId);
    await (admin as any).from('partner_reward_codes').delete().eq('partner_id', ctx.partnerId);
    await (admin as any).from('partner_invoices').delete().eq('partner_id', ctx.partnerId);
    await (admin as any).from('partners').delete().eq('id', ctx.partnerId);
  }
  if (ctx.customerAuthId) {
    await (admin as any).from('wallet_transactions').delete().eq('user_id', ctx.customerAuthId);
    await (admin as any).from('wallets').delete().eq('user_id', ctx.customerAuthId);
    await (admin as any).from('users').delete().eq('id', ctx.customerAuthId);
    await admin.auth.admin.deleteUser(ctx.customerAuthId).catch(() => undefined);
  }
  if (ctx.partnerAuthId) {
    await admin.auth.admin.deleteUser(ctx.partnerAuthId).catch(() => undefined);
  }
}

test.describe('50 — C07: MioCoin kód uplatnění (UI flow)', () => {
  test.beforeAll(async () => {
    if (!isStaging) return;
    await setupData();
  });

  test.afterAll(async () => {
    if (!isStaging) return;
    await cleanupData();
  });

  test('50a) zákazník uplatní issued MioCoin kód přes UI → success toast + kód activated', async ({ page }) => {
    if (!isStaging) {
      test.skip(true, 'Staging secrets not available');
    }
    test.setTimeout(60_000);

    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);

    await page.goto('/profile');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // Najít input pro MioCoin kód
    const redeemInput = page
      .locator('input[placeholder*="MIOCOIN KÓD"]')
      .or(page.locator('input[placeholder*="KÓD"]'))
      .first();
    await expect(redeemInput).toBeVisible({ timeout: 15_000 });

    await redeemInput.fill(ctx.code!);
    await expect(redeemInput).toHaveValue(ctx.code!);

    const submitBtn = page.getByRole('button', { name: 'Uplatnit kód' });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();

    // Odeslat a čekat na RPC odpověď
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/rpc/redeem_miocoin_code'),
        { timeout: 20_000 },
      ),
      submitBtn.click(),
    ]);

    // Úspěšný toast
    await expect(
      page.getByText(/kód byl úspěšně uplatněn/i).or(page.getByText(/připsáno.*miocoin/i)),
    ).toBeVisible({ timeout: 10_000 });

    // Ověřit stav v DB
    const admin = makeAdmin();
    const { data: row } = await (admin as any)
      .from('partner_reward_codes')
      .select('status')
      .eq('code', ctx.code!)
      .single();
    expect(row?.status, 'Kód musí být activated po úspěšném uplatnění').toBe('activated');
  });

  test('50b) neplatný kód zobrazí chybový toast', async ({ page }) => {
    if (!isStaging) {
      test.skip(true, 'Staging secrets not available');
    }
    test.setTimeout(30_000);

    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    await page.goto('/profile');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    const redeemInput = page
      .locator('input[placeholder*="MIOCOIN KÓD"]')
      .or(page.locator('input[placeholder*="KÓD"]'))
      .first();
    await expect(redeemInput).toBeVisible({ timeout: 15_000 });

    await redeemInput.fill('NEPLATNY-KOD-9999');
    const submitBtn = page.getByRole('button', { name: 'Uplatnit kód' });
    await submitBtn.click();

    await expect(
      page.getByText(/neplatný kód/i).or(page.getByText(/nepodařilo se uplatnit/i)),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('50c) již uplatněný kód zobrazí chybový toast (already_used)', async ({ page }) => {
    if (!isStaging) {
      test.skip(true, 'Staging secrets not available');
    }
    test.setTimeout(30_000);

    // Po 50a je kód 'activated' — znovu-uplatnění musí vrátit already_used
    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);
    await page.goto('/profile');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    const redeemInput = page
      .locator('input[placeholder*="MIOCOIN KÓD"]')
      .or(page.locator('input[placeholder*="KÓD"]'))
      .first();
    await expect(redeemInput).toBeVisible({ timeout: 15_000 });

    await redeemInput.fill(ctx.code!);
    const submitBtn = page.getByRole('button', { name: 'Uplatnit kód' });
    await submitBtn.click();

    await expect(
      page.getByText(/již byl uplatněn/i).or(page.getByText(/already_used/i)),
    ).toBeVisible({ timeout: 10_000 });
  });
});
