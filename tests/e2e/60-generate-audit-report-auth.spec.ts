import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const USER_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const USER_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const SUPERADMIN_EMAIL = process.env.E2E_SUPERADMIN_EMAIL ?? '';
const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD ?? '';

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/generate-audit-report`;

test.describe('generate-audit-report auth guard', () => {
  test.beforeAll(() => {
    test.skip(
      !SUPABASE_URL.includes(STAGING_REF) ||
        !SUPABASE_ANON_KEY ||
        !USER_EMAIL ||
        !USER_PASSWORD ||
        !ADMIN_EMAIL ||
        !ADMIN_PASSWORD,
      'staging-only: requires staging URL, anon key, user and admin credentials',
    );
  });

  async function signIn(email: string, password: string) {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    expect(error, `sign-in failed for ${email}`).toBeNull();
    expect(data.session?.access_token, `missing access token for ${email}`).toBeTruthy();
    return data.session!.access_token;
  }

  async function callGenerateAuditReport(token?: string) {
    const headers: Record<string, string> = {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers,
      body: '{}',
    });

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return { status: response.status, body };
  }

  function expectNoAuditPayload(body: unknown) {
    const serialized = JSON.stringify(body ?? {});
    expect(serialized).not.toContain('report_metadata');
    expect(serialized).not.toContain('event_logs_and_data_integrity');
  }

  test('rejects missing token, invalid token, and normal user without leaking audit data', async () => {
    const noToken = await callGenerateAuditReport();
    expect([401, 403]).toContain(noToken.status);
    expectNoAuditPayload(noToken.body);

    const invalidToken = await callGenerateAuditReport('not-a-valid-jwt');
    expect([401, 403]).toContain(invalidToken.status);
    expectNoAuditPayload(invalidToken.body);

    const userToken = await signIn(USER_EMAIL, USER_PASSWORD);
    const normalUser = await callGenerateAuditReport(userToken);
    expect(normalUser.status).toBe(403);
    expectNoAuditPayload(normalUser.body);
  });

  test('allows admin JWT to generate the audit report', async () => {
    const adminToken = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
    const response = await callGenerateAuditReport(adminToken);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      report_metadata: expect.objectContaining({
        system: 'OneMil/Sofinity Integration Audit',
      }),
      summary: expect.any(Object),
    });
  });

  test('allows superadmin JWT when a staging superadmin account is configured', async () => {
    test.skip(
      !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD,
      'no dedicated staging superadmin credentials configured',
    );

    const superadminToken = await signIn(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    const response = await callGenerateAuditReport(superadminToken);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      report_metadata: expect.objectContaining({
        system: 'OneMil/Sofinity Integration Audit',
      }),
      summary: expect.any(Object),
    });
  });
});
