/**
 * Spec 57 - Partner API key rotation.
 *
 * Staging-only and self-contained. Creates throwaway partner auth users and
 * partner rows, verifies partner-side key rotation and safe error handling,
 * then cleans up. No production, no partner reward/order flow, no purchases.
 */

import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const INTERNAL_TOKEN = process.env.VITE_INTERNAL_FUNCTION_TOKEN ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) &&
  Boolean(SUPABASE_ANON) &&
  Boolean(SERVICE_ROLE) &&
  Boolean(INTERNAL_TOKEN);

const RUN_ID = Date.now();
const PARTNER_EMAIL = `spec57-partner-${RUN_ID}@onemil.cz`;
const PARTNER_PASSWORD = `Spec57P!${RUN_ID}x`;
const UNLINKED_EMAIL = `spec57-unlinked-${RUN_ID}@onemil.cz`;
const UNLINKED_PASSWORD = `Spec57U!${RUN_ID}x`;
const PENDING_EMAIL = `spec57-pending-${RUN_ID}@onemil.cz`;
const PENDING_PASSWORD = `Spec57N!${RUN_ID}x`;

const ctx: {
  partnerAuthUserId?: string;
  partnerId?: string;
  unlinkedAuthUserId?: string;
  pendingAuthUserId?: string;
  pendingPartnerId?: string;
  oldKeyId?: string;
  oldKeyPrefix?: string;
} = {};

function makeSvc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function makeAnon(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createAuthUser(email: string, password: string): Promise<string> {
  const svc = makeSvc();
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`create auth user failed: ${error.message}`);
  return data.user.id;
}

async function createPartner(userId: string, email: string, status: 'approved' | 'pending'): Promise<string> {
  const svc = makeSvc();
  const { data, error } = await (svc as any)
    .from('partners')
    .insert({
      name: `E2E Spec57 Partner ${RUN_ID}`,
      company_name: `E2E Spec57 s.r.o. ${RUN_ID}`,
      logo_url: 'https://example.invalid/spec57-logo.png',
      website_url: 'https://example.invalid/spec57',
      contact_email: email,
      auth_user_id: userId,
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
      reward_base_czk: 100,
      reward_mc: 1,
    })
    .select('id')
    .single();
  if (error) throw new Error(`create partner failed: ${error.message}`);
  return data.id as string;
}

async function signInJwt(email: string, password: string): Promise<string> {
  const anon = makeAnon();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) throw new Error(`sign in failed: ${error?.message}`);
  return data.session.access_token;
}

async function callRotate(
  email: string,
  password: string,
  bodyPassword: string,
  includeInternalToken = true,
): Promise<{ status: number; body: any }> {
  const jwt = await signInJwt(email, password);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    apikey: SUPABASE_ANON,
    'Content-Type': 'application/json',
  };
  if (includeInternalToken) headers['x-internal-token'] = INTERNAL_TOKEN;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/partner-rotate-api-key`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ password: bodyPassword }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function loginAsPartner(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('cookie_consent', JSON.stringify({
      essential: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    }));
  });
  await page.goto('/partner/login');
  await page.getByLabel(/e-mail/i).first().fill(PARTNER_EMAIL);
  await page.getByLabel(/heslo/i).first().fill(PARTNER_PASSWORD);
  await page.getByRole('button', { name: /přihlásit/i }).first().click();
  await page.waitForURL(/\/partner\/dashboard/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
}

test.describe.serial('57 - partner API key rotation', () => {
  test.skip(!isStaging, 'staging-only: requires staging URL, anon key, service role, and internal token');

  test.beforeAll(async () => {
    ctx.partnerAuthUserId = await createAuthUser(PARTNER_EMAIL, PARTNER_PASSWORD);
    ctx.partnerId = await createPartner(ctx.partnerAuthUserId, PARTNER_EMAIL, 'approved');

    ctx.unlinkedAuthUserId = await createAuthUser(UNLINKED_EMAIL, UNLINKED_PASSWORD);

    ctx.pendingAuthUserId = await createAuthUser(PENDING_EMAIL, PENDING_PASSWORD);
    ctx.pendingPartnerId = await createPartner(ctx.pendingAuthUserId, PENDING_EMAIL, 'pending');

    const svc = makeSvc();
    const { data, error } = await (svc as any).rpc('generate_partner_api_key', {
      p_partner_id: ctx.partnerId,
    });
    if (error || !data?.[0]?.key_id) {
      throw new Error(`seed partner api key failed: ${error?.message ?? 'no key returned'}`);
    }
    ctx.oldKeyId = data[0].key_id as string;
    ctx.oldKeyPrefix = data[0].key_prefix as string;
  });

  test.afterAll(async () => {
    if (!isStaging) return;
    const svc = makeSvc();

    if (ctx.partnerId) {
      await (svc as any).from('partner_api_keys').delete().eq('partner_id', ctx.partnerId);
      await (svc as any).from('partners').delete().eq('id', ctx.partnerId);
    }
    if (ctx.pendingPartnerId) {
      await (svc as any).from('partner_api_keys').delete().eq('partner_id', ctx.pendingPartnerId);
      await (svc as any).from('partners').delete().eq('id', ctx.pendingPartnerId);
    }

    for (const userId of [ctx.partnerAuthUserId, ctx.unlinkedAuthUserId, ctx.pendingAuthUserId]) {
      if (userId) await svc.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  });

  test('Edge Function returns structured safe errors for auth/config/partner states', async () => {
    const missingToken = await callRotate(PARTNER_EMAIL, PARTNER_PASSWORD, PARTNER_PASSWORD, false);
    expect(missingToken.status).toBe(401);
    expect(missingToken.body).toEqual({ success: false, error: 'internal_token_invalid' });

    const wrongPassword = await callRotate(PARTNER_EMAIL, PARTNER_PASSWORD, 'not-the-password');
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual({ success: false, error: 'invalid_password' });

    const unlinked = await callRotate(UNLINKED_EMAIL, UNLINKED_PASSWORD, UNLINKED_PASSWORD);
    expect(unlinked.status).toBe(404);
    expect(unlinked.body).toEqual({ success: false, error: 'partner_link_missing' });

    const pending = await callRotate(PENDING_EMAIL, PENDING_PASSWORD, PENDING_PASSWORD);
    expect(pending.status).toBe(403);
    expect(pending.body).toEqual({ success: false, error: 'partner_not_approved' });
  });

  test('wrong password shows Czech UI message', async ({ page }) => {
    await loginAsPartner(page);
    await page.getByRole('button', { name: /regenerovat api klíč/i }).click();
    await page.locator('#rotate-password').fill('not-the-password');
    await page.getByRole('button', { name: /^Regenerovat$/ }).click();
    await expect(page.getByText('Neplatné heslo.')).toBeVisible({ timeout: 15_000 });
  });

  test('approved partner can regenerate key; old key is revoked and raw key is one-time only', async ({ page }) => {
    const svc = makeSvc();

    await loginAsPartner(page);
    await page.getByRole('button', { name: /regenerovat api klíč/i }).click();
    await page.locator('#rotate-password').fill(PARTNER_PASSWORD);
    await page.getByRole('button', { name: /^Regenerovat$/ }).click();

    const successDialog = page.getByRole('dialog').filter({
      hasText: 'API klíč byl úspěšně vygenerován',
    });
    await expect(successDialog).toBeVisible({ timeout: 20_000 });
    const rawKey = (await successDialog.locator('code').innerText()).trim();
    expect(rawKey.length).toBeGreaterThan(20);

    const { data: rows, error } = await (svc as any)
      .from('partner_api_keys')
      .select('id, key_hash, api_key_hash, key_prefix, revoked_at')
      .eq('partner_id', ctx.partnerId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`partner_api_keys verify failed: ${error.message}`);

    const activeRows = rows.filter((row: any) => row.revoked_at === null);
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].id).not.toBe(ctx.oldKeyId);

    const oldRow = rows.find((row: any) => row.id === ctx.oldKeyId);
    expect(oldRow?.revoked_at).toBeTruthy();
    const newKeyPrefix = activeRows[0].key_prefix as string;
    expect(ctx.oldKeyPrefix).toBeTruthy();
    expect(newKeyPrefix).toBeTruthy();

    if (rows.some((row: any) => row.key_hash === rawKey || row.api_key_hash === rawKey)) {
      throw new Error('raw API key was stored in partner_api_keys');
    }

    console.info(
      [
        'SPEC57_SAFE_RESULT',
        `partner_id=${ctx.partnerId}`,
        `old_key_prefix=${ctx.oldKeyPrefix}`,
        `new_key_prefix=${newKeyPrefix}`,
        `old_key_revoked=${Boolean(oldRow?.revoked_at)}`,
      ].join(' '),
    );

    await page.getByRole('button', { name: /rozumím, zavřít/i }).click();
    await expect(successDialog).toHaveCount(0);
    await expect(page.getByText(rawKey)).toHaveCount(0);
  });
});
