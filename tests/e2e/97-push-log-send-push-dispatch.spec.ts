import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  claimPushLogForDelivery,
  dispatchPendingPush,
  STALE_PROCESSING_TIMEOUT_MS,
  type PushLogClaimBackend,
  type PushLogClaimResponse,
  type PushLogRow,
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

function createClaimBackend(
  status: string,
  claimedAt?: string,
  playerId = 'valid_player_123',
) {
  let row: (PushLogRow & { response: Record<string, unknown> }) | null = {
    id: PUSH_LOG_ID,
    user_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    player_id: playerId,
    title: 'Výhra',
    message: 'Máte novou výhru.',
    status,
    response: claimedAt
      ? { ok: null, stage: 'processing', claimed_at: claimedAt }
      : {},
  };

  const claim = (
    expectedStatus: 'pending' | 'processing',
    response: PushLogClaimResponse,
    staleBefore?: string,
  ): PushLogRow | null => {
    if (!row || row.status !== expectedStatus) return null;
    if (staleBefore) {
      const currentClaimedAt = row.response.claimed_at;
      if (
        typeof currentClaimedAt !== 'string'
        || currentClaimedAt > staleBefore
      ) {
        return null;
      }
    }
    row = { ...row, status: 'processing', response };
    return { ...row };
  };

  const backend: PushLogClaimBackend = {
    claimPending: async (_id, response) => claim('pending', response),
    claimStaleProcessing: async (_id, staleBefore, response) =>
      claim('processing', response, staleBefore),
    readStatus: async () => row?.status,
  };

  return {
    backend,
    getRow: () => row,
  };
}

test.describe('97 — push_log → send-push → OneSignal', () => {
  const migration = fs.readFileSync(
    'supabase/migrations/20260723190325_restore_push_log_send_push_dispatch.sql',
    'utf8',
  );
  const edgeFunction = fs.readFileSync('supabase/functions/send-push/index.ts', 'utf8');

  test('starý pending záznam se při aplikaci migrace nezařadí ani nezmění', () => {
    expect(migration).not.toMatch(/DO\s+\$\$/);
    expect(migration).not.toMatch(
      /SELECT\s+id\s+FROM\s+public\.push_log\s+WHERE\s+status\s*=\s*'pending'/i,
    );
    expect(migration).not.toContain('enqueue_send_push_edge_request(v_push_log_id)');
    expect(migration).toContain('Intentionally no backfill');
  });

  test('nový pending INSERT se asynchronně odešle přes send-push', () => {
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
    expect(edgeFunction).toContain('updateAndReturn("pending", response)');
    expect(edgeFunction).toContain(
      'updateAndReturn("processing", response, staleBefore)',
    );
    expect(edgeFunction).toContain(
      'query.lte("response->>claimed_at", staleBefore)',
    );
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

  test('čerstvý processing záznam se před limitem znovu nepřevezme', async () => {
    const now = new Date('2026-07-23T20:00:00.000Z');
    const state = createClaimBackend(
      'processing',
      new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
    );

    const result = await claimPushLogForDelivery(
      PUSH_LOG_ID,
      state.backend,
      now,
    );

    expect(STALE_PROCESSING_TIMEOUT_MS).toBe(15 * 60 * 1000);
    expect(result).toEqual({ state: 'duplicate', status: 'processing' });
    expect(state.getRow()?.response).not.toHaveProperty(
      'recovered_stale_processing',
    );
  });

  test('processing starší než 15 minut se převezme s novým claimed_at', async () => {
    const now = new Date('2026-07-23T20:00:00.000Z');
    const state = createClaimBackend(
      'processing',
      new Date(now.getTime() - STALE_PROCESSING_TIMEOUT_MS - 1).toISOString(),
    );

    const result = await claimPushLogForDelivery(
      PUSH_LOG_ID,
      state.backend,
      now,
    );

    expect(result.state).toBe('claimed');
    expect(state.getRow()?.response).toEqual({
      ok: null,
      stage: 'processing',
      claimed_at: now.toISOString(),
      recovered_stale_processing: true,
      recovery_timeout_minutes: 15,
    });
  });

  test('dva souběžné pokusy nepřevezmou stejný starý processing záznam', async () => {
    const now = new Date('2026-07-23T20:00:00.000Z');
    const state = createClaimBackend(
      'processing',
      new Date(now.getTime() - STALE_PROCESSING_TIMEOUT_MS - 1).toISOString(),
    );

    const results = await Promise.all([
      claimPushLogForDelivery(PUSH_LOG_ID, state.backend, now),
      claimPushLogForDelivery(PUSH_LOG_ID, state.backend, now),
    ]);

    expect(results.filter((result) => result.state === 'claimed')).toHaveLength(1);
    expect(results.filter((result) => result.state === 'duplicate')).toHaveLength(1);
  });

  test('obnovený processing skončí podle OneSignal výsledku jako sent nebo failed', async () => {
    const now = new Date('2026-07-23T20:00:00.000Z');

    for (const serviceStatus of [200, 400]) {
      const claimState = createClaimBackend(
        'processing',
        new Date(now.getTime() - STALE_PROCESSING_TIMEOUT_MS - 1).toISOString(),
      );
      const sent: Array<{ id: string; response: Record<string, unknown> }> = [];
      const failed: Array<{ id: string; response: Record<string, unknown> }> = [];
      const store: PushLogStore = {
        claimPending: (id) =>
          claimPushLogForDelivery(id, claimState.backend, now),
        markSent: async (id, response) => { sent.push({ id, response }); },
        markFailed: async (id, response) => { failed.push({ id, response }); },
      };

      const result = await dispatchPendingPush(PUSH_LOG_ID, {
        store,
        oneSignalApiKey: 'test-key',
        oneSignalAppId: 'test-app',
        fetchImpl: async () =>
          new Response(
            JSON.stringify(serviceStatus === 200
              ? { id: 'onesignal-notification-id' }
              : { errors: ['service error'] }),
            { status: serviceStatus },
          ),
      });

      expect(result.status).toBe(serviceStatus === 200 ? 200 : 502);
      expect(sent).toHaveLength(serviceStatus === 200 ? 1 : 0);
      expect(failed).toHaveLength(serviceStatus === 200 ? 0 : 1);
      const finalResponse = serviceStatus === 200
        ? sent[0].response
        : failed[0].response;
      expect(finalResponse).toMatchObject({
        claimed_at: now.toISOString(),
        recovered_stale_processing: true,
        recovery_timeout_minutes: 15,
      });
    }
  });

  test('běžný pending flow zůstává funkční a není označen jako recovery', async () => {
    const now = new Date('2026-07-23T20:00:00.000Z');
    const claimState = createClaimBackend('pending');
    const sent: string[] = [];
    let calls = 0;
    const store: PushLogStore = {
      claimPending: (id) =>
        claimPushLogForDelivery(id, claimState.backend, now),
      markSent: async (id) => { sent.push(id); },
      markFailed: async () => undefined,
    };

    const result = await dispatchPendingPush(PUSH_LOG_ID, {
      store,
      oneSignalApiKey: 'test-key',
      oneSignalAppId: 'test-app',
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ id: 'onesignal-notification-id' }), {
          status: 200,
        });
      },
    });

    expect(result.status).toBe(200);
    expect(calls).toBe(1);
    expect(sent).toEqual([PUSH_LOG_ID]);
    expect(claimState.getRow()?.response).not.toHaveProperty(
      'recovered_stale_processing',
    );
  });
});
