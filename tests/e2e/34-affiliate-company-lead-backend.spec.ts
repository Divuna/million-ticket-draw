/**
 * Spec 34 — create-affiliate-company-lead backend contract
 *
 * Staging-only. Calls the Edge Function directly (no browser).
 * Covers all 9 invariants for Phase 2A:
 *   1. Approved sales_rep can create a company lead (success path)
 *   2. Influencer-only affiliate is rejected with 403
 *   3. Anonymous request returns 401
 *   4. Created lead has status "sent_to_company"
 *   5. DB stores only company_confirmation_token_hash (64-char SHA-256)
 *   6. Raw token is NOT returned in response
 *   7. email_queue row is created with confirm/reject links
 *   8. No row created in affiliate_company_refs
 *   9. No commission created
 *
 * Production must not be used; staging ref check is enforced at the top of each test.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-affiliate-company-lead`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function skipIfNotStaging() {
  if (!SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    test.skip(true, 'staging-only test — requires staging Supabase URL, anon key and service role key');
  }
}

type CreatedTestUser = {
  authUserId: string;
  affiliateId: string | null;
};

async function createTestUser(
  admin: SupabaseClient,
  opts: {
    email: string;
    password: string;
    modes: string[];
    refCode: string;
  },
): Promise<CreatedTestUser> {
  // Create auth user
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  });
  if (userError) throw new Error(`createUser failed: ${userError.message}`);
  const authUserId = userData.user.id;

  // Create affiliate_accounts record
  const { data: affiliateData, error: affiliateError } = await admin
    .from('affiliate_accounts')
    .insert({
      auth_user_id: authUserId,
      name: `E2E Test ${opts.refCode}`,
      email: opts.email,
      ref_code: opts.refCode,
      status: 'approved',
      modes: opts.modes,
      approved_at: new Date().toISOString(),
      notes: 'spec34 staging e2e temporary',
    })
    .select('id')
    .single();
  if (affiliateError) throw new Error(`affiliate insert failed: ${affiliateError.message}`);

  return { authUserId, affiliateId: affiliateData.id };
}

async function getUserJwt(email: string, password: string): Promise<string> {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(`signIn failed for ${email}: ${error?.message ?? 'no session'}`);
  }
  return data.session.access_token;
}

async function callEdgeFunction(
  jwt: string | null,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  };
  if (jwt) {
    headers['Authorization'] = `Bearer ${jwt}`;
  }

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

async function cleanup(
  admin: SupabaseClient,
  opts: { authUserId?: string | null; affiliateId?: string | null; companyEmail?: string | null },
) {
  if (opts.companyEmail) {
    await admin.from('affiliate_company_leads').delete().ilike('company_email', opts.companyEmail);
    await admin.from('email_queue').delete().eq('email', opts.companyEmail);
  }
  if (opts.affiliateId) {
    await admin.from('affiliate_company_leads').delete().eq('affiliate_id', opts.affiliateId);
    await admin.from('affiliate_accounts').delete().eq('id', opts.affiliateId);
  }
  if (opts.authUserId) {
    await admin.auth.admin.deleteUser(opts.authUserId);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('create-affiliate-company-lead backend contract (spec 34)', () => {
  test('approved sales_rep creates lead — all 9 invariants', async () => {
    skipIfNotStaging();
    test.setTimeout(60_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const unique = Date.now();
    const email = `spec34-salesrep-${unique}@onemil.cz`;
    const password = `Spec34SR${unique}!`;
    const refCode = `S34SR${String(unique).slice(-6)}`;
    const companyEmail = `spec34-company-${unique}@example.com`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createTestUser(admin, {
        email,
        password,
        modes: ['sales_rep'],
        refCode,
      }));

      const jwt = await getUserJwt(email, password);

      // --- Call the Edge Function ---
      const { status, body } = await callEdgeFunction(jwt, {
        company_name: `Spec34 Firma ${unique} s.r.o.`,
        company_email: companyEmail,
        ico: '12300034',
        dic: 'CZ12300034',
        website: 'https://spec34-firma.example.com',
        contact_person: 'Karel Spec',
        contact_phone: '+420600300034',
        sales_rep_note: 'Spec 34 staging test note.',
      });

      // Invariant 1: success
      expect(status, 'Edge Function must return 200').toBe(200);
      expect(body.success, 'response.success must be true').toBe(true);

      // Invariant 4: status in response
      expect(body.status, 'response.status must be "sent_to_company"').toBe('sent_to_company');

      const leadId = body.lead_id as string;
      expect(leadId, 'response must include lead_id').toBeTruthy();

      // Invariant 6: raw token not in response
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain('token');

      // --- DB verification ---
      const { data: lead, error: leadError } = await admin
        .from('affiliate_company_leads')
        .select('*')
        .eq('id', leadId)
        .single();

      expect(leadError, 'lead row must be readable by service role').toBeNull();
      expect(lead, 'lead row must exist').toBeTruthy();

      // Invariant 4: status in DB
      expect(lead.status, 'lead.status in DB must be "sent_to_company"').toBe('sent_to_company');

      // Invariant 5: only hash stored, not raw token
      expect(lead.company_confirmation_token_hash, 'token hash must be set').toBeTruthy();
      expect(
        (lead.company_confirmation_token_hash as string).length,
        'token hash must be 64-char SHA-256 hex',
      ).toBe(64);

      // Invariant 6: token hash must not look like a base64url raw token (which would have - or _)
      // A SHA-256 hex string contains only [0-9a-f]
      expect(
        /^[0-9a-f]{64}$/.test(lead.company_confirmation_token_hash as string),
        'stored value must be lowercase hex SHA-256',
      ).toBe(true);

      // Timestamps set
      expect(lead.company_confirmation_sent_at, 'sent_at must be set').toBeTruthy();
      expect(lead.company_confirmation_expires_at, 'expires_at must be set').toBeTruthy();

      // Sales rep snapshots
      expect(lead.sales_rep_ref_code_snapshot).toBe(refCode);
      expect(lead.sales_rep_email_snapshot).toBe(email);

      // Invariant 7: email_queue row
      const { data: emailRow, error: emailError } = await admin
        .from('email_queue')
        .select('id, email, subject, body')
        .eq('email', companyEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      expect(emailError, 'email_queue query must succeed').toBeNull();
      expect(emailRow, 'email_queue row must exist').toBeTruthy();
      expect(emailRow!.subject).toContain('zadosti');
      expect(emailRow!.body).toContain('company-lead/confirm');
      expect(emailRow!.body).toContain('action=confirm');
      expect(emailRow!.body).toContain('action=reject');

      // Invariant 8: no affiliate_company_refs
      const { data: refs, error: refsError } = await admin
        .from('affiliate_company_refs')
        .select('id')
        .eq('affiliate_id', affiliateId as string);

      expect(refsError, 'affiliate_company_refs query must succeed').toBeNull();
      expect((refs ?? []).length, 'affiliate_company_refs must be empty').toBe(0);

      // Invariant 9: no commissions
      const { data: commissions, error: commError } = await admin
        .from('affiliate_commissions')
        .select('id')
        .eq('affiliate_id', affiliateId as string);

      expect(commError, 'affiliate_commissions query must succeed').toBeNull();
      expect((commissions ?? []).length, 'no commission must be created').toBe(0);
    } finally {
      await cleanup(admin, { authUserId, affiliateId, companyEmail });
    }
  });

  test('influencer-only affiliate is rejected with 403', async () => {
    skipIfNotStaging();
    test.setTimeout(30_000);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const unique = Date.now();
    const email = `spec34-influencer-${unique}@onemil.cz`;
    const password = `Spec34Inf${unique}!`;
    const refCode = `S34INF${String(unique).slice(-5)}`;

    let authUserId: string | null = null;
    let affiliateId: string | null = null;

    try {
      ({ authUserId, affiliateId } = await createTestUser(admin, {
        email,
        password,
        modes: ['influencer'],
        refCode,
      }));

      const jwt = await getUserJwt(email, password);

      const { status, body } = await callEdgeFunction(jwt, {
        company_name: 'Influencer Firma s.r.o.',
        company_email: `spec34-inf-company-${unique}@example.com`,
      });

      // Invariant 2: influencer-only gets 403
      expect(status, 'influencer-only must receive 403').toBe(403);
      expect(body.success).toBe(false);
      expect(String(body.message)).toContain('not allowed');
    } finally {
      await cleanup(admin, { authUserId, affiliateId });
    }
  });

  test('anonymous request returns 401', async () => {
    skipIfNotStaging();

    // Invariant 3: no Authorization header → 401
    const { status, body } = await callEdgeFunction(null, {
      company_name: 'Anon Firma s.r.o.',
      company_email: 'anon-firma@example.com',
    });

    expect(status, 'anonymous request must return 401').toBe(401);
    expect(body.success).toBe(false);
  });
});
