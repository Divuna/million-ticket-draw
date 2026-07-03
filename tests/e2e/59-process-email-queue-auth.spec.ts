/**
 * Spec 59 - process-email-queue auth guard
 *
 * Staging-only backend test for PR #159. Every queued email uses a missing
 * required private attachment, so successful authorized processing fails before
 * Resend is initialized and no email is sent.
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const INTERNAL_TOKEN = process.env.VITE_INTERNAL_FUNCTION_TOKEN ?? '';
const ADMIN_EMAIL = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL) ?? '';
const ADMIN_PASSWORD = (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD) ?? '';

const RUN_ID = Date.now();
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/process-email-queue`;
const isStaging =
  SUPABASE_URL.includes(STAGING_REF) &&
  !!SUPABASE_ANON &&
  !!SERVICE_ROLE &&
  !!INTERNAL_TOKEN &&
  !!ADMIN_EMAIL &&
  !!ADMIN_PASSWORD;

type TypedSupabaseClient = SupabaseClient<Database>;
type QueueFunctionResponse = {
  error?: string;
  success?: boolean;
  processed?: number;
  sent?: number;
  failed?: number;
} | null;

function makeServiceClient(): TypedSupabaseClient {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function makeAnonClient(): TypedSupabaseClient {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createQueueRow(service: TypedSupabaseClient, label: string): Promise<string> {
  const { data, error } = await service
    .from('email_queue')
    .insert({
      email: `spec59-${label}-${RUN_ID}@example.test`,
      subject: `Spec59 process-email-queue auth ${label}`,
      body: '<p>Spec59 auth guard verification.</p>',
      attachment_storage_bucket: 'affiliate-payout-docs',
      attachment_storage_path: `missing/spec59-${label}-${RUN_ID}.pdf`,
      attachment_filename: 'missing.pdf',
      attachment_content_type: 'application/pdf',
      attachment_required: true,
      status: 'pending',
    })
    .select('id')
    .single();

  expect(error).toBeFalsy();
  expect(data?.id).toBeTruthy();
  return data.id;
}

async function readQueueStatus(service: TypedSupabaseClient, id: string): Promise<string | null> {
  const { data, error } = await service
    .from('email_queue')
    .select('status')
    .eq('id', id)
    .single();

  expect(error).toBeFalsy();
  return data?.status ?? null;
}

async function invokeQueue(
  emailId: string,
  headers: Record<string, string> = {},
): Promise<{ response: Response; body: QueueFunctionResponse }> {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ email_id: emailId }),
  });

  let body: QueueFunctionResponse = null;
  try {
    body = (await response.json()) as QueueFunctionResponse;
  } catch (_error) {
    body = null;
  }
  return { response, body };
}

async function signIn(email: string, password: string): Promise<string> {
  const anon = makeAnonClient();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(`signIn failed for ${email}: ${error?.message ?? 'missing session'}`);
  }
  return data.session.access_token;
}

test.describe.serial('process-email-queue auth guard - staging', () => {
  test.skip(!isStaging, 'staging-only: requires staging URL, anon key, service-role key, internal token, and admin credentials');

  const queueIds: string[] = [];
  let regularUserId: string | null = null;

  test.afterAll(async () => {
    if (!isStaging) return;

    const service = makeServiceClient();
    if (queueIds.length > 0) {
      await service.from('email_queue').delete().in('id', queueIds);
    }
    if (regularUserId) {
      await service.auth.admin.deleteUser(regularUserId);
    }
  });

  test('59a) no token returns 401 and leaves queue row pending', async () => {
    const service = makeServiceClient();
    const emailId = await createQueueRow(service, 'no-token');
    queueIds.push(emailId);

    const { response, body } = await invokeQueue(emailId);

    expect(response.status).toBe(401);
    expect(body?.error).toBe('missing_authorization');
    await expect.poll(() => readQueueStatus(service, emailId)).toBe('pending');
  });

  test('59b) valid x-internal-token processes the selected queue row', async () => {
    const service = makeServiceClient();
    const emailId = await createQueueRow(service, 'internal-token');
    queueIds.push(emailId);

    const { response, body } = await invokeQueue(emailId, {
      'x-internal-token': INTERNAL_TOKEN,
    });

    expect(response.status).toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.processed).toBe(1);
    expect(body?.sent).toBe(0);
    expect(body?.failed).toBe(1);
    await expect.poll(() => readQueueStatus(service, emailId)).toBe('failed');
  });

  test('59c) admin or superadmin JWT can run manual selected-row processing', async () => {
    const service = makeServiceClient();
    const emailId = await createQueueRow(service, 'admin-jwt');
    queueIds.push(emailId);
    const adminJwt = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);

    const { response, body } = await invokeQueue(emailId, {
      Authorization: `Bearer ${adminJwt}`,
    });

    expect(response.status).toBe(200);
    expect(body?.success).toBe(true);
    expect(body?.processed).toBe(1);
    expect(body?.sent).toBe(0);
    expect(body?.failed).toBe(1);
    await expect.poll(() => readQueueStatus(service, emailId)).toBe('failed');
  });

  test('59d) regular user JWT returns 403 and leaves queue row pending', async () => {
    const service = makeServiceClient();
    const emailId = await createQueueRow(service, 'regular-user');
    queueIds.push(emailId);

    const password = `Spec59!${RUN_ID}x`;
    const email = `spec59-user-${RUN_ID}@onemil.cz`;
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createError).toBeFalsy();
    regularUserId = created.user?.id ?? null;
    expect(regularUserId).toBeTruthy();

    const userJwt = await signIn(email, password);
    const { response, body } = await invokeQueue(emailId, {
      Authorization: `Bearer ${userJwt}`,
    });

    expect(response.status).toBe(403);
    expect(body?.error).toBe('access_denied_admin_only');
    await expect.poll(() => readQueueStatus(service, emailId)).toBe('pending');
  });
});
