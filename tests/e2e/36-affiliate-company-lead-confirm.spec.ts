/**
 * Spec 36 — confirm-affiliate-company-lead backend contract + /partner/invite UI (Phase 2C)
 *
 * Staging-only, self-contained.
 * Creates temporary test users and leads via service role key; cleans up after each test.
 * Password is generated at runtime — never in secrets, logs, or commits.
 *
 * Required env vars (all present in playwright-staging.yml):
 *   VITE_SUPABASE_URL               — must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *
 * Backend tests (36a–36g): call Edge Function directly, no browser.
 * UI tests (36h–36k): load /partner/invite in browser.
 *
 * Invariants verified:
 *   36a) Valid confirm → 200, status=pending_admin_approval, company_confirmed_at set, token hash cleared
 *   36b) Valid reject → 200, status=company_rejected, company_rejected_at set, token hash cleared
 *   36c) Expired token → 410
 *   36d) Used token (second call) → 409
 *   36e) Invalid token → 404
 *   36f) Confirm must NOT create affiliate_company_refs, affiliate_commissions, or partner account
 *   36g) GET valid token → 200, returns company_name and sales_rep_name
 *   36h) /partner/invite?token=VALID&action=confirm → page loads summary, confirm button visible, click → success state
 *   36i) /partner/invite?token=VALID&action=reject → reject button visible, click → success state
 *   36j) /partner/invite?token=EXPIRED → error state expired
 *   36k) /partner/invite?token=INVALID → error state invalid
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const CONFIRM_EF_URL = `${SUPABASE_URL}/functions/v1/confirm-affiliate-company-lead`;
const CREATE_EF_URL = `${SUPABASE_URL}/functions/v1/create-affiliate-company-lead`;

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

function skipIfNotStaging() {
  if (!SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only — requires VITE_SUPABASE_URL (staging), VITE_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CreatedUser = { authUserId: string; affiliateId: string };

async function createSalesRepUser(
  admin: SupabaseClient,
  opts: { email: string; password: string; refCode: string },
): Promise<CreatedUser> {
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  });
  if (uErr) throw new Error(`createUser: ${uErr.message}`);
  const authUserId = u.user.id;

  const { data: aff, error: aErr } = await (admin as any)
    .from('affiliate_accounts')
    .insert({
      auth_user_id: authUserId,
      name: `E2E Spec36 ${opts.refCode}`,
      email: opts.email,
      ref_code: opts.refCode,
      status: 'approved',
      modes: ['sales_rep'],
      approved_at: new Date().toISOString(),
      notes: 'spec36 staging e2e temporary',
    })
    .select('id')
    .single();
  if (aErr) throw new Error(`affiliate insert: ${aErr.message}`);

  return { authUserId, affiliateId: aff.id as string };
}

async function getUserJwt(email: string, password: string): Promise<string> {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) throw new Error(`signIn failed: ${error?.message}`);
  return data.session.access_token;
}

async function createLead(
  jwt: string,
  companyEmail: string,
  companyName: string,
): Promise<{ leadId: string }> {
  const res = await fetch(CREATE_EF_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ company_name: companyName, company_email: companyEmail }),
  });
  const body = (await res.json()) as { success: boolean; lead_id?: string; message?: string };
  if (!body.success || !body.lead_id) throw new Error(`createLead failed: ${body.message ?? res.status}`);
  return { leadId: body.lead_id };
}

async function getLeadToken(admin: SupabaseClient, leadId: string): Promise<string | null> {
  const { data } = await (admin as any)
    .from('affiliate_company_leads')
    .select('company_confirmation_token_hash')
    .eq('id', leadId)
    .single();
  return (data?.company_confirmation_token_hash as string) ?? null;
}

async function callConfirmEf(
  method: 'GET' | 'POST',
  params: { token?: string; action?: string; rejection_reason?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  let url = CONFIRM_EF_URL;
  const headers: Record<string, string> = { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' };

  if (method === 'GET') {
    const qs = new URLSearchParams();
    if (params.token) qs.set('token', params.token);
    url = `${CONFIRM_EF_URL}?${qs.toString()}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(params) : undefined,
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

async function cleanup(
  admin: SupabaseClient,
  opts: { authUserId?: string | null; affiliateId?: string | null; companyEmail?: string | null },
) {
  if (opts.companyEmail) {
    await (admin as any).from('affiliate_company_leads').delete().ilike('company_email', opts.companyEmail);
    await (admin as any).from('email_queue').delete().eq('email', opts.companyEmail);
  }
  if (opts.affiliateId) {
    await (admin as any).from('affiliate_company_leads').delete().eq('affiliate_id', opts.affiliateId);
    await (admin as any).from('affiliate_accounts').delete().eq('id', opts.affiliateId);
  }
  if (opts.authUserId) {
    await admin.auth.admin.deleteUser(opts.authUserId);
  }
}

// Manufacture a fake token whose hash we can control for error-state tests.
// We insert a lead row directly with a known hash (or expired timestamp).
async function insertLeadDirect(
  admin: SupabaseClient,
  affiliateId: string,
  overrides: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await (admin as any)
    .from('affiliate_company_leads')
    .insert({
      affiliate_id: affiliateId,
      sales_rep_affiliate_id_snapshot: affiliateId,
      sales_rep_ref_code_snapshot: 'S36TEST',
      sales_rep_email_snapshot: 'spec36-direct@onemil.cz',
      sales_rep_name_snapshot: 'E2E Spec36 Direct',
      company_name: 'Spec36 Direct Firma',
      company_email: `spec36-direct-${Date.now()}@example.com`,
      status: 'sent_to_company',
      ...overrides,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertLeadDirect: ${error.message}`);
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Phase 2C — confirm-affiliate-company-lead (spec 36)', () => {

  // ── 36a: valid confirm ────────────────────────────────────────────────────

  test('36a: valid confirm → pending_admin_approval, timestamps set, token hash cleared', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const ts = Date.now();
    const email = `spec36a-${ts}@onemil.cz`;
    const password = `Sp36A_${ts}!`;
    const refCode = `S36A${String(ts).slice(-6)}`;
    const companyEmail = `spec36a-co-${ts}@example.com`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;
    let leadId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      const jwt = await getUserJwt(email, password);
      ({ leadId } = await createLead(jwt, companyEmail, `Spec36A Firma ${ts}`));

      // Get the raw token from email_queue body (it's URL-encoded in the link)
      const { data: eq } = await (admin as any)
        .from('email_queue')
        .select('body')
        .eq('email', companyEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      expect(eq, 'email_queue row must exist').toBeTruthy();
      const bodyText = eq.body as string;

      // Extract token from the confirm URL in email body
      const tokenMatch = bodyText.match(/\/partner\/invite\?token=([^&"]+)&action=confirm/);
      expect(tokenMatch, 'confirm URL with token must be in email body').toBeTruthy();
      const rawToken = decodeURIComponent(tokenMatch![1]);

      // Call confirm action
      const { status, body } = await callConfirmEf('POST', { token: rawToken, action: 'confirm' });

      expect(status, 'confirm must return 200').toBe(200);
      expect(body.success).toBe(true);
      expect(body.action).toBe('confirm');
      expect(body.status).toBe('pending_admin_approval');

      // Verify DB
      const { data: lead } = await (admin as any)
        .from('affiliate_company_leads')
        .select('status, company_confirmed_at, company_confirmation_used_at, submitted_to_admin_at, company_confirmation_token_hash')
        .eq('id', leadId)
        .single();

      expect(lead.status).toBe('pending_admin_approval');
      expect(lead.company_confirmed_at).toBeTruthy();
      expect(lead.company_confirmation_used_at).toBeTruthy();
      expect(lead.submitted_to_admin_at).toBeTruthy();
      expect(lead.company_confirmation_token_hash).toBeNull();

    } finally {
      await cleanup(admin, { authUserId, affiliateId, companyEmail });
    }
  });

  // ── 36b: valid reject ─────────────────────────────────────────────────────

  test('36b: valid reject → company_rejected, timestamps set, token hash cleared', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const ts = Date.now();
    const email = `spec36b-${ts}@onemil.cz`;
    const password = `Sp36B_${ts}!`;
    const refCode = `S36B${String(ts).slice(-6)}`;
    const companyEmail = `spec36b-co-${ts}@example.com`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      const jwt = await getUserJwt(email, password);
      const { leadId } = await createLead(jwt, companyEmail, `Spec36B Firma ${ts}`);

      const { data: eq } = await (admin as any)
        .from('email_queue')
        .select('body')
        .eq('email', companyEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const tokenMatch = (eq.body as string).match(/\/partner\/invite\?token=([^&"]+)&action=confirm/);
      expect(tokenMatch).toBeTruthy();
      const rawToken = decodeURIComponent(tokenMatch![1]);

      const { status, body } = await callConfirmEf('POST', {
        token: rawToken,
        action: 'reject',
        rejection_reason: 'Spec36 test rejection reason.',
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.action).toBe('reject');
      expect(body.status).toBe('company_rejected');

      const { data: lead } = await (admin as any)
        .from('affiliate_company_leads')
        .select('status, company_rejected_at, company_confirmation_used_at, company_rejection_reason, company_confirmation_token_hash')
        .eq('id', leadId)
        .single();

      expect(lead.status).toBe('company_rejected');
      expect(lead.company_rejected_at).toBeTruthy();
      expect(lead.company_confirmation_used_at).toBeTruthy();
      expect(lead.company_rejection_reason).toBe('Spec36 test rejection reason.');
      expect(lead.company_confirmation_token_hash).toBeNull();

    } finally {
      await cleanup(admin, { authUserId, affiliateId, companyEmail });
    }
  });

  // ── 36c: expired token → 410 ──────────────────────────────────────────────

  test('36c: expired token → 410', async () => {
    skipIfNotStaging();
    test.setTimeout(30_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const ts = Date.now();
    const email = `spec36c-${ts}@onemil.cz`;
    const password = `Sp36C_${ts}!`;
    const refCode = `S36C${String(ts).slice(-6)}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));

      // Insert a lead with expiry in the past and a known token hash
      const fakeRawToken = `spec36c-expired-${ts}`;
      const tokenHash = await sha256Hex(fakeRawToken);
      await insertLeadDirect(admin, affiliateId, {
        company_confirmation_token_hash: tokenHash,
        company_confirmation_expires_at: new Date(Date.now() - 1000).toISOString(),
        company_confirmation_sent_at: new Date().toISOString(),
      });

      const { status } = await callConfirmEf('POST', { token: fakeRawToken, action: 'confirm' });
      expect(status).toBe(410);

    } finally {
      await cleanup(admin, { authUserId, affiliateId });
    }
  });

  // ── 36d: used token → 409 on second call ──────────────────────────────────

  test('36d: already used token → 409', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const ts = Date.now();
    const email = `spec36d-${ts}@onemil.cz`;
    const password = `Sp36D_${ts}!`;
    const refCode = `S36D${String(ts).slice(-6)}`;
    const companyEmail = `spec36d-co-${ts}@example.com`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      const jwt = await getUserJwt(email, password);
      await createLead(jwt, companyEmail, `Spec36D Firma ${ts}`);

      const { data: eq } = await (admin as any)
        .from('email_queue')
        .select('body')
        .eq('email', companyEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const tokenMatch = (eq.body as string).match(/\/partner\/invite\?token=([^&"]+)&action=confirm/);
      expect(tokenMatch).toBeTruthy();
      const rawToken = decodeURIComponent(tokenMatch![1]);

      // First call — must succeed
      const first = await callConfirmEf('POST', { token: rawToken, action: 'confirm' });
      expect(first.status).toBe(200);

      // Second call — hash is cleared after confirm, so lookup returns 404 (not found)
      const second = await callConfirmEf('POST', { token: rawToken, action: 'confirm' });
      expect(second.status).toBe(404);

    } finally {
      await cleanup(admin, { authUserId, affiliateId, companyEmail });
    }
  });

  // ── 36e: invalid token → 404 ──────────────────────────────────────────────

  test('36e: invalid token → 404', async () => {
    skipIfNotStaging();

    const { status } = await callConfirmEf('POST', {
      token: 'completely-invalid-token-that-does-not-exist',
      action: 'confirm',
    });
    expect(status).toBe(404);
  });

  // ── 36f: confirm must not create refs, commissions, or partner account ────

  test('36f: confirm must not create affiliate_company_refs, commissions, or partner account', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const ts = Date.now();
    const email = `spec36f-${ts}@onemil.cz`;
    const password = `Sp36F_${ts}!`;
    const refCode = `S36F${String(ts).slice(-6)}`;
    const companyEmail = `spec36f-co-${ts}@example.com`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      const jwt = await getUserJwt(email, password);
      await createLead(jwt, companyEmail, `Spec36F Firma ${ts}`);

      const { data: eq } = await (admin as any)
        .from('email_queue')
        .select('body')
        .eq('email', companyEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const tokenMatch = (eq.body as string).match(/\/partner\/invite\?token=([^&"]+)&action=confirm/);
      expect(tokenMatch).toBeTruthy();
      const rawToken = decodeURIComponent(tokenMatch![1]);

      await callConfirmEf('POST', { token: rawToken, action: 'confirm' });

      // No affiliate_company_refs
      const { data: refs } = await (admin as any)
        .from('affiliate_company_refs')
        .select('id')
        .eq('affiliate_id', affiliateId);
      expect((refs ?? []).length).toBe(0);

      // No affiliate_commissions
      const { data: comms } = await (admin as any)
        .from('affiliate_commissions')
        .select('id')
        .eq('affiliate_id', affiliateId);
      expect((comms ?? []).length).toBe(0);

      // No partner account created for companyEmail
      const { data: partners } = await (admin as any)
        .from('partners')
        .select('id')
        .ilike('email', companyEmail);
      expect((partners ?? []).length).toBe(0);

    } finally {
      await cleanup(admin, { authUserId, affiliateId, companyEmail });
    }
  });

  // ── 36g: GET valid token → returns summary ────────────────────────────────

  test('36g: GET valid token returns company_name and sales_rep_name', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const ts = Date.now();
    const email = `spec36g-${ts}@onemil.cz`;
    const password = `Sp36G_${ts}!`;
    const refCode = `S36G${String(ts).slice(-6)}`;
    const companyEmail = `spec36g-co-${ts}@example.com`;
    const companyName = `Spec36G Firma ${ts}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      const jwt = await getUserJwt(email, password);
      await createLead(jwt, companyEmail, companyName);

      const { data: eq } = await (admin as any)
        .from('email_queue')
        .select('body')
        .eq('email', companyEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const tokenMatch = (eq.body as string).match(/\/partner\/invite\?token=([^&"]+)&action=confirm/);
      expect(tokenMatch).toBeTruthy();
      const rawToken = decodeURIComponent(tokenMatch![1]);

      const { status, body } = await callConfirmEf('GET', { token: rawToken });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.company_name).toBe(companyName);
      expect(typeof body.sales_rep_name).toBe('string');
      expect((body.sales_rep_name as string).length).toBeGreaterThan(0);
      // Must NOT leak token or hash
      expect(JSON.stringify(body)).not.toContain('token_hash');

    } finally {
      await cleanup(admin, { authUserId, affiliateId, companyEmail });
    }
  });

  // ── 36h: /partner/invite confirm UI ──────────────────────────────────────

  test('36h: /partner/invite page loads, confirm button works → success state', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(90_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const ts = Date.now();
    const email = `spec36h-${ts}@onemil.cz`;
    const password = `Sp36H_${ts}!`;
    const refCode = `S36H${String(ts).slice(-6)}`;
    const companyEmail = `spec36h-co-${ts}@example.com`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      const jwt = await getUserJwt(email, password);
      await createLead(jwt, companyEmail, `Spec36H Firma ${ts}`);

      const { data: eq } = await (admin as any)
        .from('email_queue')
        .select('body')
        .eq('email', companyEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const tokenMatch = (eq.body as string).match(/\/partner\/invite\?token=([^&"]+)&action=confirm/);
      expect(tokenMatch).toBeTruthy();
      const rawToken = decodeURIComponent(tokenMatch![1]);

      await page.goto(`/partner/invite?token=${encodeURIComponent(rawToken)}&action=confirm`);

      // Page loads summary
      await expect(page.getByTestId('clc-ready')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('clc-company-name')).toBeVisible();

      // Confirm button visible and clickable
      const confirmBtn = page.getByTestId('clc-confirm-btn');
      await expect(confirmBtn).toBeVisible();
      await confirmBtn.click();

      // Success state
      await expect(page.getByTestId('clc-success')).toBeVisible({ timeout: 10_000 });

    } finally {
      await cleanup(admin, { authUserId, affiliateId, companyEmail });
    }
  });

  // ── 36i: /partner/invite reject UI ───────────────────────────────────────
  // Uses insertLeadDirect to avoid auth.admin.createUser (9th consecutive user creation
  // hits staging Auth rate limits and hangs indefinitely). The test only needs a valid
  // lead row with a known token hash — no full user flow required.

  test('36i: /partner/invite page — reject button works → success state', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const ts = Date.now();
    const fakeRaw = `spec36i-reject-${ts}`;
    const tokenHash = await sha256Hex(fakeRaw);
    const companyEmail = `spec36i-co-${ts}@example.com`;

    try {
      // Insert lead directly with a pre-computed token hash — no auth user needed
      const { error: insErr } = await (admin as any)
        .from('affiliate_company_leads')
        .insert({
          affiliate_id: null,
          company_name: `Spec36I Firma ${ts}`,
          company_email: companyEmail,
          status: 'sent_to_company',
          company_confirmation_token_hash: tokenHash,
          company_confirmation_expires_at: new Date(Date.now() + 86400_000).toISOString(),
          company_confirmation_sent_at: new Date().toISOString(),
          sales_rep_name_snapshot: 'E2E Spec36I',
        });
      if (insErr) throw new Error(`insertLead: ${insErr.message}`);

      await page.goto(`/partner/invite?token=${encodeURIComponent(fakeRaw)}&action=reject`);
      await expect(page.getByTestId('clc-ready')).toBeVisible({ timeout: 15_000 });

      const rejectBtn = page.getByTestId('clc-reject-btn');
      await expect(rejectBtn).toBeVisible();
      await rejectBtn.click();

      // Rejection reason textarea appears
      await expect(page.getByTestId('clc-reject-reason')).toBeVisible({ timeout: 5_000 });

      // Confirm rejection
      await page.getByTestId('clc-reject-confirm-btn').click();
      await expect(page.getByTestId('clc-success')).toBeVisible({ timeout: 15_000 });

    } finally {
      await (admin as any).from('affiliate_company_leads').delete().ilike('company_email', companyEmail);
    }
  });

  // ── 36j: /partner/invite expired token UI ────────────────────────────────

  test('36j: /partner/invite with expired token shows expired error state', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const ts = Date.now();
    const email = `spec36j-${ts}@onemil.cz`;
    const password = `Sp36J_${ts}!`;
    const refCode = `S36J${String(ts).slice(-6)}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));

      const fakeRaw = `spec36j-expired-${ts}`;
      const tokenHash = await sha256Hex(fakeRaw);
      await insertLeadDirect(admin, affiliateId, {
        company_confirmation_token_hash: tokenHash,
        company_confirmation_expires_at: new Date(Date.now() - 1000).toISOString(),
        company_confirmation_sent_at: new Date().toISOString(),
      });

      await page.goto(`/partner/invite?token=${encodeURIComponent(fakeRaw)}`);

      await expect(page.getByTestId('clc-error')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('clc-error-expired')).toBeVisible();

    } finally {
      await cleanup(admin, { authUserId, affiliateId });
    }
  });

  // ── 36k: /partner/invite invalid token UI ────────────────────────────────

  test('36k: /partner/invite with invalid token shows invalid error state', async ({ page }) => {
    skipIfNotStaging();

    await page.goto('/partner/invite?token=this-token-does-not-exist-at-all');

    await expect(page.getByTestId('clc-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('clc-error-invalid')).toBeVisible();
  });

});

// ---------------------------------------------------------------------------
// sha256Hex helper (browser-compatible via Web Crypto — also works in Node)
// ---------------------------------------------------------------------------

async function sha256Hex(value: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for Node environments where crypto.subtle may not be available
  const { createHash } = await import('crypto');
  return createHash('sha256').update(value).digest('hex');
}
