import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  dispatchPendingPush,
  type PushLogClaim,
  type PushLogStore,
} from '../../supabase/functions/send-push/core';

const PUSH_LOG_ID = '11111111-2222-4333-8444-555555555555';

function createStore(claim: PushLogClaim) {
  const sent: Array<{ id: string; response: Record<string, unknown> }> = [];
  const failed: Array<{ id: string; response: Record<string, unknown> }> = [];
  const store: PushLogStore = {
    claimPending: async () => claim,
    markSent: async (id, response) => { sent.push({ id, response }); },
    markFailed: async (id, response) => { failed.push({ id, response }); },
  };
  return { store, sent, failed };
}

const claimed = (playerId: string | null): PushLogClaim => ({
  state: 'claimed',
  row: {
    id: PUSH_LOG_ID,
    user_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    player_id: playerId,
    title: 'Výhra',
    message: 'Máte novou výhru.',
    status: 'processing',
  },
});

test.describe('97 — push_log → send-push → OneSignal', () => {
  test('SQL obnovuje pouze asynchronní cestu do send-push s tokenem z Vaultu', () => {
    const migration = fs.readFileSync(
      'supabase/migrations/20260723190325_restore_push_log_send_push_dispatch.sql',
      'utf8',
    );
    const edgeFunction = fs.readFileSync('supabase/functions/send-push/index.ts', 'utf8');

    expect(migration).toContain('AFTER INSERT ON public.push_log');
    expect(migration).toContain("WHEN (NEW.status = 'pending')");
    expect(migration).toContain("'/functions/v1/send-push'");
    expect(migration).toContain("name = 'internal_function_token'");
    expect(migration).toContain("name = 'project_url'");
    expect(migration).toContain("'x-internal-token', v_internal_token");
    expect(migration).toContain('net.http_post(');
    expect(migration).not.toContain('onesignal.com');
    expect(migration).not.toContain('send_push_via_onesignal(');
    expect(migration).not.toContain('proxy_post_to_onesignal(');
    expect(edgeFunction).toContain('if (!internalToken)');
    expect(edgeFunction).toContain('provided !== internalToken');
    expect(edgeFunction).toContain('.eq("status", "pending")');
    expect(edgeFunction).toContain('status: "processing"');
    expect(edgeFunction).not.toContain('.from("push_log").insert(');
  });

  test('úspěšné odeslání označí původní push_log jako sent', async () => {
    const state = createStore(claimed('valid_player_123'));
    let calls = 0;
    const result = await dispatchPendingPush(PUSH_LOG_ID, {
      store: state.store,
      oneSignalApiKey: 'test-key',
      oneSignalAppId: 'test-app',
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ id: 'onesignal-notification-id', recipients: 1 }), {
          status: 200,
        });
      },
    });

    expect(result.status).toBe(200);
    expect(calls).toBe(1);
    expect(state.failed).toEqual([]);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].id).toBe(PUSH_LOG_ID);
    expect(state.sent[0].response).toMatchObject({
      ok: true,
      status_code: 200,
      body: { id: 'onesignal-notification-id', recipients: 1 },
    });
  });

  test('chybějící player_id skončí failed a OneSignal se nevolá', async () => {
    const state = createStore(claimed(null));
    let calls = 0;
    const result = await dispatchPendingPush(PUSH_LOG_ID, {
      store: state.store,
      oneSignalApiKey: 'test-key',
      oneSignalAppId: 'test-app',
      fetchImpl: async () => {
        calls += 1;
        return new Response('{}', { status: 200 });
      },
    });

    expect(result.status).toBe(200);
    expect(calls).toBe(0);
    expect(state.sent).toEqual([]);
    expect(state.failed[0].response).toEqual({
      ok: false,
      stage: 'validation',
      error: 'Invalid player_id (null/empty/format)',
      player_id: null,
    });
  });

  test('chyba OneSignal uloží failed a přesnou odpověď služby', async () => {
    const state = createStore(claimed('valid_player_123'));
    const serviceBody = JSON.stringify({ errors: ['No subscribed players'] });
    const result = await dispatchPendingPush(PUSH_LOG_ID, {
      store: state.store,
      oneSignalApiKey: 'test-key',
      oneSignalAppId: 'test-app',
      fetchImpl: async () => new Response(serviceBody, { status: 400 }),
    });

    expect(result.status).toBe(502);
    expect(state.sent).toEqual([]);
    expect(state.failed[0].response).toEqual({
      ok: false,
      stage: 'onesignal',
      status_code: 400,
      body: { errors: ['No subscribed players'] },
      raw_body: serviceBody,
    });
  });

  test('chybějící konfigurace Edge Function skončí failed', async () => {
    const state = createStore(claimed('valid_player_123'));
    const result = await dispatchPendingPush(PUSH_LOG_ID, {
      store: state.store,
      oneSignalApiKey: '',
      oneSignalAppId: 'test-app',
      fetchImpl: async () => new Response('{}', { status: 200 }),
    });

    expect(result.status).toBe(500);
    expect(state.failed[0].response).toEqual({
      ok: false,
      stage: 'configuration',
      error: 'Missing ONESIGNAL_REST_API_KEY',
    });
  });

  test('síťová chyba volání OneSignal skončí failed s přesnou chybou', async () => {
    const state = createStore(claimed('valid_player_123'));
    const result = await dispatchPendingPush(PUSH_LOG_ID, {
      store: state.store,
      oneSignalApiKey: 'test-key',
      oneSignalAppId: 'test-app',
      fetchImpl: async () => { throw new Error('connection reset by peer'); },
    });

    expect(result.status).toBe(502);
    expect(state.failed[0].response).toEqual({
      ok: false,
      stage: 'onesignal_request',
      error: 'connection reset by peer',
    });
  });

  test('duplicitní invokace po atomickém claimu nic znovu neodešle', async () => {
    const state = createStore({ state: 'duplicate', status: 'processing' });
    let calls = 0;
    const result = await dispatchPendingPush(PUSH_LOG_ID, {
      store: state.store,
      oneSignalApiKey: 'test-key',
      oneSignalAppId: 'test-app',
      fetchImpl: async () => {
        calls += 1;
        return new Response('{}', { status: 200 });
      },
    });

    expect(result.body).toMatchObject({ ok: true, duplicate: true, status: 'processing' });
    expect(calls).toBe(0);
    expect(state.sent).toEqual([]);
    expect(state.failed).toEqual([]);
  });
});
