/**
 * Spec 53 — A12: Admin test dashboard "Produkčně vypnut"
 *              C10: MioCoin kód email-mismatch (zákazník 2 nemůže uplatnit kód zákazníka 1)
 *
 * Staging-only, self-contained.
 *
 * 53a — A12: Admin otevře /admin/tests → tlačítko "Produkční test vypnut" je viditelné,
 *            tlačítko "Vytvořit Test User" se NEobjeví; žádné volání admin-create-test-user EF.
 * 53b — C10: Throwaway partner + zákazník1 + zákazník2; kód vydán pro zákazníka1;
 *            zákazník2 se pokusí uplatnit → `email_mismatch` chyba (z RPC i z UI).
 *
 * Vyžaduje (playwright-staging.yml secrets):
 *   VITE_SUPABASE_URL               — staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_ADMIN_EMAIL
 *   E2E_ADMIN_PASSWORD
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ADMIN_EMAIL    = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL) ?? '';
const ADMIN_PASSWORD = (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD) ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!ANON_KEY && !!SERVICE_ROLE &&
  !!ADMIN_EMAIL && !!ADMIN_PASSWORD;

const RUN_ID          = Date.now();
const PARTNER_EMAIL   = `spec53-partner-${RUN_ID}@onemil.cz`;
const CUSTOMER1_EMAIL = `spec53-customer1-${RUN_ID}@onemil.cz`;
const CUSTOMER2_EMAIL = `spec53-customer2-${RUN_ID}@onemil.cz`;
const PASSWORD        = `Spec53!${RUN_ID}x`;
const ORDER_ID        = `SPEC53-ORDER-${RUN_ID}`;

const ctx: {
  partnerAuthId?: string;
  customer1AuthId?: string;
  customer2AuthId?: string;
  partnerId?: string;
  code?: string;
} = {};

function makeAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function setupC10Data(): Promise<void> {
  const admin = makeAdmin();

  // Partner auth user
  const { data: pu, error: puErr } = await admin.auth.admin.createUser({
    email: PARTNER_EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (puErr) throw new Error(`createUser(partner): ${puErr.message}`);
  ctx.partnerAuthId = pu.user.id;

  // Zákazník 1 — pro koho je kód vydán
  const { data: c1, error: c1Err } = await admin.auth.admin.createUser({
    email: CUSTOMER1_EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (c1Err) throw new Error(`createUser(customer1): ${c1Err.message}`);
  ctx.customer1AuthId = c1.user.id;

  // Zákazník 2 — pokusí se uplatnit cizí kód
  const { data: c2, error: c2Err } = await admin.auth.admin.createUser({
    email: CUSTOMER2_EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (c2Err) throw new Error(`createUser(customer2): ${c2Err.message}`);
  ctx.customer2AuthId = c2.user.id;

  // public.users pro zákazníka 2 (FK pro wallets, profil)
  const { error: u2Err } = await (admin as any)
    .from('users')
    .upsert({ id: ctx.customer2AuthId, email: CUSTOMER2_EMAIL, role: 'user' }, { onConflict: 'id' });
  if (u2Err) throw new Error(`public.users upsert(customer2): ${u2Err.message}`);

  // Approved partner
  const { data: p, error: pErr } = await (admin as any)
    .from('partners')
    .insert({
      name: `E2E Spec53 Partner ${RUN_ID}`,
      company_name: `E2E Spec53 s.r.o.`,
      logo_url: 'https://example.invalid/spec53.png',
      website_url: 'https://example.invalid/spec53',
      contact_email: PARTNER_EMAIL,
      auth_user_id: ctx.partnerAuthId,
      status: 'approved',
      approved_at: new Date().toISOString(),
      reward_base_czk: 100,
      reward_mc: 1,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`partners insert: ${pErr.message}`);
  ctx.partnerId = p.id as string;

  // Objednávka vydaná pro customer1 e-mail
  const { data: createResult, error: createErr } = await (admin as any).rpc(
    'create_partner_order_reward',
    {
      p_partner_id: ctx.partnerId,
      p_external_order_id: ORDER_ID,
      p_customer_email: CUSTOMER1_EMAIL,  // kód vázán na customer1
      p_order_total_czk: 200,
    },
  );
  if (createErr) throw new Error(`create_partner_order_reward: ${createErr.message}`);
  ctx.code = (createResult as any)?.code as string;
  if (!ctx.code) throw new Error('create_partner_order_reward did not return a code');

  // Aktivovat na issued
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

async function cleanupC10Data(): Promise<void> {
  const admin = makeAdmin();
  if (ctx.partnerId) {
    await (admin as any).from('partner_coin_activations').delete().eq('partner_id', ctx.partnerId);
    await (admin as any).from('partner_reward_codes').delete().eq('partner_id', ctx.partnerId);
    await (admin as any).from('partner_invoices').delete().eq('partner_id', ctx.partnerId);
    await (admin as any).from('partners').delete().eq('id', ctx.partnerId);
  }
  for (const uid of [ctx.customer1AuthId, ctx.customer2AuthId]) {
    if (!uid) continue;
    await (admin as any).from('wallet_transactions').delete().eq('user_id', uid);
    await (admin as any).from('wallets').delete().eq('user_id', uid);
    await (admin as any).from('users').delete().eq('id', uid);
    await admin.auth.admin.deleteUser(uid).catch(() => undefined);
  }
  if (ctx.partnerAuthId) {
    await admin.auth.admin.deleteUser(ctx.partnerAuthId).catch(() => undefined);
  }
}

// ─── A12 ──────────────────────────────────────────────────────────────────────

test.describe('53a — A12: Admin test dashboard (createTestUser vypnut)', () => {
  test('53a) /admin/tests zobrazuje "Produkční test vypnut", žádné "Vytvořit Test User"', async ({ page }) => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(60_000);

    const efCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('admin-create-test-user')) {
        efCalls.push(req.url());
      }
    });

    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/tests');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    // Stránka se načte — musí obsahovat "Produkční test vypnut"
    await expect(
      page.getByRole('button', { name: /Produkční test vypnut/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Nesmí existovat žádné tlačítko s textem "Vytvořit Test User"
    await expect(
      page.getByRole('button', { name: /Vytvořit Test User/i }),
    ).not.toBeVisible({ timeout: 3_000 });

    // Žádné síťové volání na admin-create-test-user
    expect(efCalls, 'admin-create-test-user Edge Function nesmí být volána').toHaveLength(0);
  });
});

// ─── C10 ──────────────────────────────────────────────────────────────────────

test.describe('53b — C10: MioCoin kód email-mismatch', () => {
  test.beforeAll(async () => {
    if (!isStaging) return;
    await setupC10Data();
  });

  test.afterAll(async () => {
    if (!isStaging) return;
    await cleanupC10Data();
  });

  test('53b) zákazník2 nemůže uplatnit kód vydaný pro zákazníka1 → email_mismatch', async ({ page }) => {
    if (!isStaging) test.skip(true, 'Staging secrets not available');
    test.setTimeout(60_000);

    // 1. Ověření RPC přímo (customer2 JWT → redeem_miocoin_code kódu customer1)
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await anonClient.auth.signInWithPassword({ email: CUSTOMER2_EMAIL, password: PASSWORD });

    const { data: rpcResult, error: rpcErr } = await (anonClient as any).rpc(
      'redeem_miocoin_code',
      { p_code: ctx.code! },
    );
    // RPC musí vrátit success=false, error='email_mismatch'
    expect(rpcErr).toBeNull();
    expect((rpcResult as any)?.success).toBe(false);
    expect((rpcResult as any)?.error).toBe('email_mismatch');

    await anonClient.auth.signOut();

    // 2. Ověření UI (zákazník2 v prohlížeči zkusí uplatnit)
    await loginViaUI(page, CUSTOMER2_EMAIL, PASSWORD);
    await page.goto('/profile');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    const redeemInput = page
      .locator('input[placeholder*="MIOCOIN KÓD"]')
      .or(page.locator('input[placeholder*="KÓD"]'))
      .first();
    await expect(redeemInput).toBeVisible({ timeout: 15_000 });

    await redeemInput.fill(ctx.code!);
    const submitBtn = page.getByRole('button', { name: 'Uplatnit kód' });

    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/rpc/redeem_miocoin_code'),
        { timeout: 20_000 },
      ),
      submitBtn.click(),
    ]);

    // UI musí zobrazit error toast — RedeemMioCoinCard mapuje email_mismatch →
    // 'Tento kód je vázán na jiný e-mail.' (src/components/RedeemMioCoinCard.tsx)
    await expect(
      page
        .getByText(/Tento kód je vázán na jiný e-mail/i)
        .or(page.getByText(/nepodařilo se uplatnit/i))
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // Ověřit, že kód zůstává 'issued' (nebyl aktivován pro zákazníka2)
    const admin = makeAdmin();
    const { data: row } = await (admin as any)
      .from('partner_reward_codes')
      .select('status')
      .eq('code', ctx.code!)
      .single();
    expect(row?.status, 'Kód musí zůstat issued po odmítnutí email_mismatch').toBe('issued');
  });
});
