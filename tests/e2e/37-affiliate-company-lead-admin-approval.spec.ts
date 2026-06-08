/**
 * Spec 37 — approve-affiliate-company-lead backend contract + AdminCompanyLeads UI (Phase 2D)
 *
 * Staging-only, self-contained.
 * Creates temporary test data via service role key; cleans up after each test.
 *
 * Required env vars (all present in playwright-staging.yml):
 *   VITE_SUPABASE_URL               — must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_ADMIN_EMAIL                 — staging admin account
 *   E2E_ADMIN_PASSWORD
 *
 * Backend tests (37a–37j): call Edge Function directly, no browser.
 * UI tests (37k–37m): browser, log in as admin, interact with /admin/company-leads.
 *
 * Invariants verified:
 *   37a) Approve → 200, {success, lead_id, status:'approved', partner_id}, lead.status='approved' in DB
 *   37b) Approve → partner record created in partners table
 *   37c) Approve → affiliate_company_refs row with source='company_lead'; partners.referred_by_affiliate_id set
 *   37d) Approve with affiliate_id=NULL → succeeds, NO affiliate_company_refs row written
 *   37e) Reject → 200, {status:'admin_rejected'}, reason + timestamps saved in DB
 *   37f) Reject → NO partner created, NO affiliate_company_refs, NO affiliate_commissions
 *   37g) Second approve call (partner exists) → 409
 *   37h) Approve lead in wrong status (company_rejected) → 409
 *   37i) Non-admin JWT → 403
 *   37j) Anonymous (no JWT) → 401
 *   37k) Admin sees pending lead in /admin/company-leads list
 *   37l) Admin clicks Schválit → confirm dialog → approve → lead disappears from list
 *   37m) Admin clicks Zamítnout → dialog + reason → reject → lead disappears from list
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGING_REF   = 'dxmowysntemfqfnanxua';
const SUPABASE_URL  = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE  = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ADMIN_EMAIL   = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

const APPROVE_EF_URL = `${SUPABASE_URL}/functions/v1/approve-affiliate-company-lead`;

// ─── Skip guard ───────────────────────────────────────────────────────────────

function skipIfNotStaging() {
  if (
    !SUPABASE_URL.includes(STAGING_REF) ||
    !SUPABASE_ANON ||
    !SERVICE_ROLE ||
    !ADMIN_EMAIL ||
    !ADMIN_PASSWORD
  ) {
    test.skip(
      true,
      'staging-only — requires VITE_SUPABASE_URL (staging), VITE_SUPABASE_ANON_KEY, ' +
        'E2E_SUPABASE_SERVICE_ROLE_KEY, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD',
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getJwt(email: string, password: string): Promise<string> {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) throw new Error(`signIn failed: ${error?.message}`);
  return data.session.access_token;
}

const getAdminJwt = () => getJwt(ADMIN_EMAIL, ADMIN_PASSWORD);

async function createSalesRepUser(
  admin: SupabaseClient,
  opts: { email: string; password: string; refCode: string },
): Promise<{ authUserId: string; affiliateId: string }> {
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
      name:         `E2E Spec37 ${opts.refCode}`,
      email:        opts.email,
      ref_code:     opts.refCode,
      status:       'approved',
      modes:        ['sales_rep'],
      approved_at:  new Date().toISOString(),
      notes:        'spec37 staging e2e temporary',
    })
    .select('id')
    .single();
  if (aErr) throw new Error(`affiliate insert: ${aErr.message}`);

  return { authUserId, affiliateId: aff.id as string };
}

/** Insert a lead already in pending_admin_approval (skips create+confirm flow). */
async function insertLeadForApproval(
  admin: SupabaseClient,
  affiliateId: string | null,
  companyEmail: string,
  companyName: string,
  statusOverride = 'pending_admin_approval',
): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await (admin as any)
    .from('affiliate_company_leads')
    .insert({
      affiliate_id:                   affiliateId,
      sales_rep_affiliate_id_snapshot: affiliateId,
      sales_rep_ref_code_snapshot:    affiliateId ? 'S37TST' : null,
      sales_rep_email_snapshot:       'spec37-direct@onemil.cz',
      sales_rep_name_snapshot:        'E2E Spec37 Direct',
      company_name:                   companyName,
      company_email:                  companyEmail,
      status:                         statusOverride,
      company_confirmed_at:           statusOverride === 'pending_admin_approval' ? now : null,
      submitted_to_admin_at:          statusOverride === 'pending_admin_approval' ? now : null,
      company_confirmation_used_at:   statusOverride === 'pending_admin_approval' ? now : null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertLeadForApproval: ${error.message}`);
  return data.id as string;
}

async function callApproveEf(
  jwt: string | null,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON,
  };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  const res = await fetch(APPROVE_EF_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const respBody = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body: respBody };
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = (data?.users ?? []).find((u: any) => u.email === email);
  return found ? (found as any).id : null;
}

/** Clean up partner account + auth user created for companyEmail during approve. */
async function cleanupCompanyAccount(admin: SupabaseClient, companyEmail: string) {
  try {
    const { data: partner } = await (admin as any)
      .from('partners')
      .select('id, auth_user_id')
      .ilike('contact_email', companyEmail)
      .maybeSingle();

    if (partner) {
      await (admin as any).from('affiliate_company_refs').delete().eq('partner_id', partner.id);
      await (admin as any).from('partners').delete().eq('id', partner.id);
      if (partner.auth_user_id) {
        await admin.auth.admin.deleteUser(partner.auth_user_id);
      }
    } else {
      // No partner row — delete auth user if it was created before the RPC
      const authId = await findAuthUserByEmail(admin, companyEmail);
      if (authId) await admin.auth.admin.deleteUser(authId);
    }
  } catch (_) { /* cleanup is best-effort */ }
}

async function cleanupLeads(admin: SupabaseClient, companyEmail: string) {
  try {
    await (admin as any).from('affiliate_company_leads').delete().ilike('company_email', companyEmail);
  } catch (_) { /* best-effort */ }
}

async function cleanupSalesRep(admin: SupabaseClient, authUserId: string, affiliateId: string) {
  try {
    await (admin as any).from('affiliate_accounts').delete().eq('id', affiliateId);
    await admin.auth.admin.deleteUser(authUserId);
  } catch (_) { /* best-effort */ }
}

/** Log the admin in through the login form and wait for the admin redirect. */
async function loginAsAdmin(page: Page) {
  // Clear any existing Supabase session — previous tests may leave the browser logged in
  // as a different user, causing /login to redirect before the email input appears.
  await page.goto('/');
  await page.evaluate(() => {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('sb-'));
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (_) { /* ignore */ }
  });

  await page.goto('/login');
  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  // Admin lands on /admin after login
  await page.waitForURL(/\/admin/, { timeout: 20_000 });
  // Ensure Supabase auth session is fully committed to localStorage before
  // any callApproveEF reads it via supabase.auth.getSession()
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Phase 2D — approve-affiliate-company-lead (spec 37)', () => {

  // ── 37a: approve happy path ───────────────────────────────────────────────

  test('37a: approve → 200, response fields correct, lead.status=approved in DB', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const email       = `spec37a-${ts}@onemil.cz`;
    const password    = `Sp37A_${ts}!`;
    const refCode     = `S37A${String(ts).slice(-6)}`;
    const companyEmail = `spec37a-co-${ts}@example.com`;
    const companyName  = `Spec37A Firma ${ts}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      const leadId = await insertLeadForApproval(admin, affiliateId, companyEmail, companyName);
      const jwt = await getAdminJwt();

      const { status, body } = await callApproveEf(jwt, { lead_id: leadId, action: 'approve' });

      expect(status, 'approve must return 200').toBe(200);
      expect(body.success).toBe(true);
      expect(body.lead_id).toBe(leadId);
      expect(body.status).toBe('approved');
      expect(typeof body.partner_id).toBe('string');
      // Must never return password, token, hash, or setup link
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain('action_link');
      expect(bodyStr).not.toContain('token');

      // Verify DB
      const { data: lead } = await (admin as any)
        .from('affiliate_company_leads')
        .select('status, partner_id, approved_at, admin_reviewed_by, admin_reviewed_at')
        .eq('id', leadId)
        .single();

      expect(lead.status).toBe('approved');
      expect(lead.partner_id).toBeTruthy();
      expect(lead.approved_at).toBeTruthy();
      expect(lead.admin_reviewed_by).toBeTruthy();
      expect(lead.admin_reviewed_at).toBeTruthy();

    } finally {
      await cleanupCompanyAccount(admin, companyEmail);
      await cleanupLeads(admin, companyEmail);
      if (authUserId && affiliateId) await cleanupSalesRep(admin, authUserId, affiliateId);
    }
  });

  // ── 37b: approve → partner created ───────────────────────────────────────

  test('37b: approve → partner record created in partners table', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const email       = `spec37b-${ts}@onemil.cz`;
    const password    = `Sp37B_${ts}!`;
    const refCode     = `S37B${String(ts).slice(-6)}`;
    const companyEmail = `spec37b-co-${ts}@example.com`;
    const companyName  = `Spec37B Firma ${ts}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      const leadId = await insertLeadForApproval(admin, affiliateId, companyEmail, companyName);
      const jwt = await getAdminJwt();

      const { body } = await callApproveEf(jwt, { lead_id: leadId, action: 'approve' });
      expect(body.success).toBe(true);

      const partnerId = body.partner_id as string;

      // Partner must exist in DB
      const { data: partner, error: pErr } = await (admin as any)
        .from('partners')
        .select('id, contact_email, status, approved_at')
        .eq('id', partnerId)
        .single();

      expect(pErr, 'partner query must not error').toBeNull();
      expect(partner).toBeTruthy();
      expect(partner.contact_email).toBe(companyEmail);
      expect(partner.status).toBe('approved');
      expect(partner.approved_at).toBeTruthy();

    } finally {
      await cleanupCompanyAccount(admin, companyEmail);
      await cleanupLeads(admin, companyEmail);
      if (authUserId && affiliateId) await cleanupSalesRep(admin, authUserId, affiliateId);
    }
  });

  // ── 37c: approve → affiliate_company_refs + referred_by_affiliate_id ─────

  test('37c: approve → affiliate_company_refs source=company_lead; partners.referred_by_affiliate_id set', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const email       = `spec37c-${ts}@onemil.cz`;
    const password    = `Sp37C_${ts}!`;
    const refCode     = `S37C${String(ts).slice(-6)}`;
    const companyEmail = `spec37c-co-${ts}@example.com`;
    const companyName  = `Spec37C Firma ${ts}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      const leadId = await insertLeadForApproval(admin, affiliateId, companyEmail, companyName);
      const jwt = await getAdminJwt();

      const { body } = await callApproveEf(jwt, { lead_id: leadId, action: 'approve' });
      expect(body.success).toBe(true);

      const partnerId = body.partner_id as string;

      // Check affiliate_company_refs
      const { data: refs } = await (admin as any)
        .from('affiliate_company_refs')
        .select('id, affiliate_id, partner_id, source')
        .eq('partner_id', partnerId);

      expect((refs ?? []).length).toBe(1);
      expect(refs[0].affiliate_id).toBe(affiliateId);
      expect(refs[0].source).toBe('company_lead');

      // Check partners.referred_by_affiliate_id
      const { data: partner } = await (admin as any)
        .from('partners')
        .select('referred_by_affiliate_id')
        .eq('id', partnerId)
        .single();

      expect(partner.referred_by_affiliate_id).toBe(affiliateId);

    } finally {
      await cleanupCompanyAccount(admin, companyEmail);
      await cleanupLeads(admin, companyEmail);
      if (authUserId && affiliateId) await cleanupSalesRep(admin, authUserId, affiliateId);
    }
  });

  // ── 37d: approve with affiliate_id=NULL → no refs written ────────────────

  test('37d: approve with affiliate_id=NULL → succeeds, no affiliate_company_refs written', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const companyEmail = `spec37d-co-${ts}@example.com`;
    const companyName  = `Spec37D Firma ${ts}`;

    try {
      // Insert lead with affiliate_id=NULL (sales rep deleted scenario)
      const leadId = await insertLeadForApproval(admin, null, companyEmail, companyName);
      const jwt = await getAdminJwt();

      const { status, body } = await callApproveEf(jwt, { lead_id: leadId, action: 'approve' });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.status).toBe('approved');

      const partnerId = body.partner_id as string;

      // No refs row must exist for this partner
      const { data: refs } = await (admin as any)
        .from('affiliate_company_refs')
        .select('id')
        .eq('partner_id', partnerId);

      expect((refs ?? []).length).toBe(0);

    } finally {
      await cleanupCompanyAccount(admin, companyEmail);
      await cleanupLeads(admin, companyEmail);
    }
  });

  // ── 37e: reject happy path ────────────────────────────────────────────────

  test('37e: reject → 200, admin_rejected status, reason + timestamps saved', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const email        = `spec37e-${ts}@onemil.cz`;
    const password     = `Sp37E_${ts}!`;
    const refCode      = `S37E${String(ts).slice(-6)}`;
    const companyEmail = `spec37e-co-${ts}@example.com`;
    const companyName  = `Spec37E Firma ${ts}`;
    const rejectionReason = 'Spec37 automated test rejection reason.';

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      const leadId = await insertLeadForApproval(admin, affiliateId, companyEmail, companyName);
      const jwt = await getAdminJwt();

      const { status, body } = await callApproveEf(jwt, {
        lead_id: leadId,
        action: 'reject',
        rejection_reason: rejectionReason,
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.lead_id).toBe(leadId);
      expect(body.status).toBe('admin_rejected');

      // Verify DB
      const { data: lead } = await (admin as any)
        .from('affiliate_company_leads')
        .select('status, admin_rejection_reason, admin_reviewed_by, admin_reviewed_at')
        .eq('id', leadId)
        .single();

      expect(lead.status).toBe('admin_rejected');
      expect(lead.admin_rejection_reason).toBe(rejectionReason);
      expect(lead.admin_reviewed_by).toBeTruthy();
      expect(lead.admin_reviewed_at).toBeTruthy();

    } finally {
      await cleanupLeads(admin, companyEmail);
      if (authUserId && affiliateId) await cleanupSalesRep(admin, authUserId, affiliateId);
    }
  });

  // ── 37f: reject → no partner, no refs, no commissions ────────────────────

  test('37f: reject → no partner created, no affiliate_company_refs, no commissions', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const email        = `spec37f-${ts}@onemil.cz`;
    const password     = `Sp37F_${ts}!`;
    const refCode      = `S37F${String(ts).slice(-6)}`;
    const companyEmail = `spec37f-co-${ts}@example.com`;
    const companyName  = `Spec37F Firma ${ts}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      const leadId = await insertLeadForApproval(admin, affiliateId, companyEmail, companyName);
      const jwt = await getAdminJwt();

      const { status } = await callApproveEf(jwt, {
        lead_id: leadId,
        action: 'reject',
        rejection_reason: 'Spec37f test rejection.',
      });
      expect(status).toBe(200);

      // No partner created for companyEmail
      const { data: partners } = await (admin as any)
        .from('partners')
        .select('id')
        .ilike('contact_email', companyEmail);
      expect((partners ?? []).length).toBe(0);

      // No auth user created for companyEmail
      const authId = await findAuthUserByEmail(admin, companyEmail);
      expect(authId).toBeNull();

      // No affiliate_company_refs for affiliateId
      const { data: refs } = await (admin as any)
        .from('affiliate_company_refs')
        .select('id')
        .eq('affiliate_id', affiliateId);
      expect((refs ?? []).length).toBe(0);

      // No affiliate_commissions for affiliateId
      const { data: comms } = await (admin as any)
        .from('affiliate_commissions')
        .select('id')
        .eq('affiliate_id', affiliateId);
      expect((comms ?? []).length).toBe(0);

    } finally {
      await cleanupLeads(admin, companyEmail);
      if (authUserId && affiliateId) await cleanupSalesRep(admin, authUserId, affiliateId);
    }
  });

  // ── 37g: duplicate approve → 409 ─────────────────────────────────────────

  test('37g: second approve call (partner already exists for company email) → 409', async () => {
    skipIfNotStaging();
    test.setTimeout(90_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const companyEmail = `spec37g-co-${ts}@example.com`;
    const companyName  = `Spec37G Firma ${ts}`;

    try {
      const leadId = await insertLeadForApproval(admin, null, companyEmail, companyName);
      const jwt = await getAdminJwt();

      // First approve — must succeed
      const first = await callApproveEf(jwt, { lead_id: leadId, action: 'approve' });
      expect(first.status).toBe(200);
      expect(first.body.success).toBe(true);

      // Second approve — partner already exists for this email → 409
      const second = await callApproveEf(jwt, { lead_id: leadId, action: 'approve' });
      expect(second.status).toBe(409);

    } finally {
      await cleanupCompanyAccount(admin, companyEmail);
      await cleanupLeads(admin, companyEmail);
    }
  });

  // ── 37h: wrong status → 409 ──────────────────────────────────────────────

  test('37h: approve lead in wrong status (company_rejected) → 409', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const companyEmail = `spec37h-co-${ts}@example.com`;
    const companyName  = `Spec37H Firma ${ts}`;

    try {
      // Insert with company_rejected status — cannot be approved
      const leadId = await insertLeadForApproval(admin, null, companyEmail, companyName, 'company_rejected');
      const jwt = await getAdminJwt();

      const { status } = await callApproveEf(jwt, { lead_id: leadId, action: 'approve' });
      expect(status).toBe(409);

    } finally {
      await cleanupLeads(admin, companyEmail);
    }
  });

  // ── 37i: non-admin JWT → 403 ──────────────────────────────────────────────

  test('37i: non-admin JWT → 403', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const email       = `spec37i-${ts}@onemil.cz`;
    const password    = `Sp37I_${ts}!`;
    const refCode     = `S37I${String(ts).slice(-6)}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createSalesRepUser(admin, { email, password, refCode }));
      // Get sales rep JWT — not an admin
      const nonAdminJwt = await getJwt(email, password);

      const { status } = await callApproveEf(nonAdminJwt, {
        lead_id: '00000000-0000-0000-0000-000000000000',
        action: 'approve',
      });
      expect(status).toBe(403);

    } finally {
      if (authUserId && affiliateId) await cleanupSalesRep(admin, authUserId, affiliateId);
    }
  });

  // ── 37j: anonymous → 401 ─────────────────────────────────────────────────

  test('37j: anonymous (no JWT) → 401', async () => {
    skipIfNotStaging();

    const { status, body } = await callApproveEf(null, {
      lead_id: '00000000-0000-0000-0000-000000000000',
      action: 'approve',
    });
    expect(status).toBe(401);
    expect(body.message).toBe('missing_authorization_header');
  });

  // ── 37k: admin sees pending lead in UI list ───────────────────────────────

  test('37k: admin sees pending_admin_approval lead in /admin/company-leads', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(90_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const companyEmail = `spec37k-co-${ts}@example.com`;
    const companyName  = `Spec37K Firma ${ts}`;

    try {
      await insertLeadForApproval(admin, null, companyEmail, companyName);

      await loginAsAdmin(page);
      await page.goto('/admin/company-leads');

      // Wait for list to load — company name must appear
      await expect(page.getByText(companyName)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(companyEmail)).toBeVisible();

      // Schválit and Zamítnout buttons visible
      await expect(page.getByRole('button', { name: /Schválit/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Zamítnout/ }).first()).toBeVisible();

    } finally {
      await cleanupLeads(admin, companyEmail);
    }
  });

  // ── 37l: admin Schválit → confirm → lead disappears ──────────────────────

  test('37l: admin Schválit → confirm dialog → approve → lead disappears from list', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(120_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const companyEmail = `spec37l-co-${ts}@example.com`;
    const companyName  = `Spec37L Firma ${ts}`;

    try {
      await insertLeadForApproval(admin, null, companyEmail, companyName);

      await loginAsAdmin(page);
      await page.goto('/admin/company-leads');

      // Wait for lead to appear
      await expect(page.getByText(companyName)).toBeVisible({ timeout: 20_000 });

      // Click Schválit — opens confirm dialog
      const schvalitBtn = page.getByRole('button', { name: /Schválit/ }).first();
      await schvalitBtn.click();

      // Confirm dialog — scoped to the dialog that contains "Ano, schválit"
      // (page has 2 role=dialog elements: approve confirm + reject; filter to the right one)
      const dialog = page.getByRole('dialog').filter({
        has: page.getByRole('button', { name: /Ano, schválit/ }),
      });
      await expect(dialog).toBeVisible({ timeout: 8_000 });

      // Click "Ano, schválit" and wait for the approve EF POST to complete
      // (Promise.all ensures we don't miss the response before the click fires)
      const [approveResp] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/functions/v1/approve-affiliate-company-lead') && r.request().method() === 'POST',
          { timeout: 20_000 },
        ),
        dialog.getByRole('button', { name: /Ano, schválit/ }).click(),
      ]);
      expect(approveResp.status()).toBe(200);

      // After EF succeeds, fetchLeads refreshes the list → lead disappears
      await expect(page.getByText(companyName)).not.toBeVisible({ timeout: 15_000 });

    } finally {
      await cleanupCompanyAccount(admin, companyEmail);
      await cleanupLeads(admin, companyEmail);
    }
  });

  // ── 37m: admin Zamítnout → dialog + reason → lead disappears ─────────────

  test('37m: admin Zamítnout → reason dialog → reject → lead disappears from list', async ({ page }) => {
    skipIfNotStaging();
    test.setTimeout(90_000);

    const admin = makeAdmin();
    const ts = Date.now();
    const companyEmail = `spec37m-co-${ts}@example.com`;
    const companyName  = `Spec37M Firma ${ts}`;

    try {
      await insertLeadForApproval(admin, null, companyEmail, companyName);

      await loginAsAdmin(page);
      await page.goto('/admin/company-leads');

      // Wait for lead to appear
      await expect(page.getByText(companyName)).toBeVisible({ timeout: 20_000 });

      // Click Zamítnout — opens reject dialog
      const zamitButton = page.getByRole('button', { name: /Zamítnout/ }).first();
      await zamitButton.click();

      // Reject dialog — scoped to the dialog that contains the rejection textarea
      // (page has 2 role=dialog elements: approve confirm + reject; filter to the right one)
      const dialog = page.getByRole('dialog').filter({
        has: page.locator('textarea#reject-reason'),
      });
      await expect(dialog).toBeVisible({ timeout: 8_000 });

      // Fill in rejection reason
      const textarea = dialog.locator('textarea#reject-reason');
      await expect(textarea).toBeVisible({ timeout: 5_000 });
      await textarea.fill('Spec37M automated test rejection — důvod zamítnutí pro E2E test.');

      // Click "Zamítnout" and wait for the reject EF POST to complete
      const [rejectResp] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/functions/v1/approve-affiliate-company-lead') && r.request().method() === 'POST',
          { timeout: 20_000 },
        ),
        dialog.getByRole('button', { name: 'Zamítnout' }).click(),
      ]);
      expect(rejectResp.status()).toBe(200);

      // After EF succeeds, fetchLeads refreshes the list → lead disappears
      await expect(page.getByText(companyName)).not.toBeVisible({ timeout: 15_000 });

    } finally {
      await cleanupLeads(admin, companyEmail);
    }
  });

});
