import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const INTERNAL_TOKEN = process.env.INTERNAL_FUNCTION_TOKEN ?? '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) &&
  Boolean(SUPABASE_ANON) &&
  Boolean(SERVICE_ROLE) &&
  Boolean(INTERNAL_TOKEN) &&
  Boolean(ADMIN_EMAIL) &&
  Boolean(ADMIN_PASSWORD);

const RUN_ID = Date.now();
const CHAT_OWNER_EMAIL = `spec61-chat-owner-${RUN_ID}@onemil.cz`;
const CHAT_INTRUDER_EMAIL = `spec61-chat-intruder-${RUN_ID}@onemil.cz`;
const NORMAL_USER_EMAIL = `spec61-normal-${RUN_ID}@onemil.cz`;
const PARTNER_EMAIL = `spec61-partner-${RUN_ID}@onemil.cz`;
const PASSWORD = `Spec61!${RUN_ID}x`;

const ctx: {
  chatOwnerId?: string;
  chatIntruderId?: string;
  normalUserId?: string;
  partnerAuthUserId?: string;
  partnerId?: string;
} = {};

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createAuthUser(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  expect(error, `create user ${email}`).toBeNull();
  expect(data.user?.id).toBeTruthy();
  return data.user.id;
}

async function signIn(email: string, password = PASSWORD): Promise<string> {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  expect(error, `sign in ${email}`).toBeNull();
  expect(data.session?.access_token).toBeTruthy();
  return data.session!.access_token;
}

async function insertUserMessage(userId: string): Promise<string> {
  const longMessage = `spec61 oversized auth check ${RUN_ID} `.repeat(30);
  const { data, error } = await adminClient()
    .from('messages')
    .insert({ user_id: userId, sender: 'user', content: longMessage, read: false })
    .select('id')
    .single();
  expect(error, 'insert user message').toBeNull();
  expect(data?.id).toBeTruthy();
  return data.id as string;
}

async function callAiChat(messageId: string, headers: Record<string, string>) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ message_id: messageId }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

function responseDebug(call: { status: number; body: unknown }): string {
  return JSON.stringify(call.body);
}

async function createApprovedPartner(): Promise<string> {
  const { data, error } = await adminClient()
    .from('partners')
    .insert({
      name: `Spec61 Partner ${RUN_ID}`,
      company_name: `Spec61 s.r.o. ${RUN_ID}`,
      logo_url: 'https://example.invalid/spec61-logo.png',
      website_url: 'https://example.invalid/spec61',
      contact_email: PARTNER_EMAIL,
      auth_user_id: ctx.partnerAuthUserId,
      status: 'approved',
      approved_at: new Date().toISOString(),
      reward_base_czk: 100,
      reward_mc: 1,
    })
    .select('id')
    .single();
  expect(error, 'create approved partner').toBeNull();
  expect(data?.id).toBeTruthy();
  return data.id as string;
}

async function callAdminRotate(partnerId: string, jwt: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/rotate-partner-api-key`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ partner_id: partnerId }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

test.describe.serial('61 - browser internal token removal auth coverage', () => {
  test.skip(!isStaging, 'staging-only: requires staging URL, anon, service role, internal token and admin credentials');

  test.beforeAll(async () => {
    ctx.chatOwnerId = await createAuthUser(CHAT_OWNER_EMAIL);
    ctx.chatIntruderId = await createAuthUser(CHAT_INTRUDER_EMAIL);
    ctx.normalUserId = await createAuthUser(NORMAL_USER_EMAIL);
    ctx.partnerAuthUserId = await createAuthUser(PARTNER_EMAIL);
    ctx.partnerId = await createApprovedPartner();
  });

  test.afterAll(async () => {
    if (!isStaging) return;
    const admin = adminClient();

    for (const userId of [ctx.chatOwnerId, ctx.chatIntruderId]) {
      if (userId) await admin.from('messages').delete().eq('user_id', userId);
    }

    if (ctx.partnerId) {
      await admin.from('partner_api_keys').delete().eq('partner_id', ctx.partnerId);
      await admin.from('partners').delete().eq('id', ctx.partnerId);
    }

    for (const userId of [ctx.chatOwnerId, ctx.chatIntruderId, ctx.normalUserId, ctx.partnerAuthUserId]) {
      if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  });

  test('ai-chat accepts owner JWT, rejects foreign message_id, and keeps internal server path working', async () => {
    expect(ctx.chatOwnerId).toBeTruthy();
    expect(ctx.chatIntruderId).toBeTruthy();

    const ownerToken = await signIn(CHAT_OWNER_EMAIL);
    const intruderToken = await signIn(CHAT_INTRUDER_EMAIL);

    const ownerMessageId = await insertUserMessage(ctx.chatOwnerId!);
    const ownerCall = await callAiChat(ownerMessageId, {
      Authorization: `Bearer ${ownerToken}`,
    });
    expect(ownerCall.status, responseDebug(ownerCall)).toBe(200);
    expect(ownerCall.body?.success).toBe(true);
    expect(ownerCall.body?.reply_message_id).toBeTruthy();

    const foreignMessageId = await insertUserMessage(ctx.chatOwnerId!);
    const intruderCall = await callAiChat(foreignMessageId, {
      Authorization: `Bearer ${intruderToken}`,
    });
    expect(intruderCall.status, responseDebug(intruderCall)).toBe(403);
    expect(intruderCall.body).toEqual({ error: 'message_not_owned_by_user' });

    const internalMessageId = await insertUserMessage(ctx.chatOwnerId!);
    const internalCall = await callAiChat(internalMessageId, {
      'x-internal-token': INTERNAL_TOKEN,
    });
    expect(internalCall.status, responseDebug(internalCall)).toBe(200);
    expect(internalCall.body?.success).toBe(true);
    expect(internalCall.body?.reply_message_id).toBeTruthy();
  });

  test('admin API-key rotation allows admin JWT and rejects normal user JWT without internal token', async () => {
    expect(ctx.partnerId).toBeTruthy();

    const adminToken = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
    const normalToken = await signIn(NORMAL_USER_EMAIL);

    const denied = await callAdminRotate(ctx.partnerId!, normalToken);
    expect(denied.status, responseDebug(denied)).toBe(403);
    expect(denied.body).toEqual({ success: false, error: 'insufficient_permissions' });

    const allowed = await callAdminRotate(ctx.partnerId!, adminToken);
    expect(allowed.status, responseDebug(allowed)).toBe(200);
    expect(allowed.body?.success).toBe(true);
    expect(typeof allowed.body?.api_key).toBe('string');
    expect(allowed.body.api_key.length).toBeGreaterThan(20);
  });
});
