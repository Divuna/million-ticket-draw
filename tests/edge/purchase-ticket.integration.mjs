import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const apiUrl = process.env.API_URL ?? process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(anonKey, 'ANON_KEY or SUPABASE_ANON_KEY is required');
assert.ok(serviceKey, 'SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY is required');

async function apiRequest(path, {
  method = 'GET',
  key = serviceKey,
  token = key,
  body,
  prefer,
} = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { response, data };
}

function assertOk(result, label) {
  assert.equal(
    result.response.ok,
    true,
    `${label}: HTTP ${result.response.status} ${JSON.stringify(result.data)}`,
  );
  return result.data;
}

const testRun = randomUUID().slice(0, 8);
const customerEmail = `edge-purchase-${testRun}@onemil.test`;
const foreignEmail = `edge-foreign-${testRun}@onemil.test`;
const password = `Edge-${randomUUID()}-Aa1!`;
const contestId = randomUUID();
let customerId;
let foreignId;

try {
  const customer = assertOk(
    await apiRequest('/auth/v1/admin/users', {
      method: 'POST',
      body: { email: customerEmail, password, email_confirm: true },
    }),
    'create customer',
  );
  customerId = customer.id;

  const foreign = assertOk(
    await apiRequest('/auth/v1/admin/users', {
      method: 'POST',
      body: { email: foreignEmail, password, email_confirm: true },
    }),
    'create foreign user',
  );
  foreignId = foreign.id;

  assertOk(
    await apiRequest('/rest/v1/users?on_conflict=id', {
      method: 'POST',
      body: [
        { id: customerId, email: customerEmail },
        { id: foreignId, email: foreignEmail },
      ],
      prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    'upsert public users',
  );

  assertOk(
    await apiRequest('/rest/v1/contests', {
      method: 'POST',
      body: {
        id: contestId,
        title: `Edge purchase ${testRun}`,
        name: `Edge purchase ${testRun}`,
        main_prize: 'Integration prize',
        status: 'active',
        ticket_price: 10,
        ticket_count: 100,
        next_ticket_number: 1,
      },
      prefer: 'return=minimal',
    }),
    'create contest',
  );

  assertOk(
    await apiRequest('/rest/v1/wallets?on_conflict=user_id', {
      method: 'POST',
      body: { user_id: customerId, balance_coins: 100 },
      prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    'create customer wallet',
  );

  const login = assertOk(
    await apiRequest('/auth/v1/token?grant_type=password', {
      method: 'POST',
      key: anonKey,
      token: anonKey,
      body: { email: customerEmail, password },
    }),
    'customer login',
  );
  assert.ok(login.access_token, 'customer access token was not issued');

  const invalidJwt = await apiRequest('/functions/v1/purchase-ticket', {
    method: 'POST',
    key: anonKey,
    token: 'invalid.jwt.value',
    body: { contest_id: contestId },
  });
  assert.equal(invalidJwt.response.status, 401, 'invalid JWT must be rejected');

  const purchase = await apiRequest('/functions/v1/purchase-ticket', {
    method: 'POST',
    key: anonKey,
    token: login.access_token,
    // A hostile body user_id must be ignored. The Edge Function derives the
    // purchase identity exclusively from auth.getUser().
    body: { contest_id: contestId, user_id: foreignId },
  });
  assert.equal(purchase.response.status, 200, JSON.stringify(purchase.data));
  assert.equal(purchase.data?.success, true, JSON.stringify(purchase.data));
  assert.equal(
    JSON.stringify(purchase.data).includes(serviceKey),
    false,
    'service key leaked in response',
  );

  const tickets = assertOk(
    await apiRequest(
      `/rest/v1/tickets?select=id,user_id,contest_id&contest_id=eq.${contestId}`,
    ),
    'read created ticket',
  );
  assert.equal(tickets.length, 1, 'purchase must create exactly one ticket');
  assert.equal(tickets[0].user_id, customerId, 'body user_id changed the ticket owner');

  const wallets = assertOk(
    await apiRequest(
      `/rest/v1/wallets?select=balance_coins&user_id=eq.${customerId}`,
    ),
    'read customer wallet',
  );
  assert.equal(Number(wallets[0]?.balance_coins), 90, 'purchase deducted an incorrect price');

  const directAtomic = await apiRequest('/rest/v1/rpc/buy_ticket_atomic', {
    method: 'POST',
    key: anonKey,
    token: login.access_token,
    body: { p_user_id: customerId, p_contest_id: contestId },
  });
  assert.equal(
    directAtomic.response.ok,
    false,
    'customer unexpectedly executed buy_ticket_atomic directly',
  );

  console.log('purchase-ticket Edge integration: 8 passed, 0 failed');
} finally {
  // The workflow database is disposable, but best-effort cleanup keeps this
  // script safe for repeated local runs.
  if (contestId) {
    await apiRequest(`/rest/v1/winners?contest_id=eq.${contestId}`, { method: 'DELETE' });
    await apiRequest(`/rest/v1/tickets?contest_id=eq.${contestId}`, { method: 'DELETE' });
    await apiRequest(`/rest/v1/contests?id=eq.${contestId}`, { method: 'DELETE' });
  }
  if (customerId) {
    await apiRequest(`/rest/v1/wallets?user_id=eq.${customerId}`, { method: 'DELETE' });
    await apiRequest(`/rest/v1/users?id=eq.${customerId}`, { method: 'DELETE' });
    await apiRequest(`/auth/v1/admin/users/${customerId}`, { method: 'DELETE' });
  }
  if (foreignId) {
    await apiRequest(`/rest/v1/users?id=eq.${foreignId}`, { method: 'DELETE' });
    await apiRequest(`/auth/v1/admin/users/${foreignId}`, { method: 'DELETE' });
  }
}
