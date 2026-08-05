import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeSalesLeadBatchWorkerRequest,
} from '../../supabase/functions/_shared/salesLeadBatchWorkerAuth.ts';
import {
  deliverSalesLeadInitialEmail,
  InitialEmailProviderOutcomeUncertainError,
} from '../../supabase/functions/_shared/salesLeadInitialEmailDelivery.ts';
import {
  createResendInitialEmailProvider,
  SALES_LEAD_INITIAL_EMAIL_FROM,
  SALES_LEAD_INITIAL_EMAIL_REPLY_TO,
} from '../../supabase/functions/_shared/salesLeadInitialEmailSender.ts';

// Every test in this file uses a fake provider. The real Resend client is never
// constructed, never imported, and never reachable.
const WORKER_SECRET = 'w'.repeat(48);

const batchInput = {
  leadId: '30000000-0000-4000-8000-000000000901',
  performedBy: '10000000-0000-4000-8000-000000000001',
  mode: 'batch_initial',
  batchItemId: '62000000-0000-4000-8000-000000000901',
  recipient: 'info@worker.example.cz',
  subject: 'Nabidka',
  bodySource: 'Dobry den.',
  bodyText: 'Dobry den.',
  bodyHtml: '<p>Dobry den.</p>',
  attachmentMetadata: [],
  attachments: [],
  outboundCaptureId: '40000000-0000-4000-8000-000000000901',
  from: SALES_LEAD_INITIAL_EMAIL_FROM,
  replyTo: SALES_LEAD_INITIAL_EMAIL_REPLY_TO,
};

class FakeBatchRpc {
  status = null;
  deliveryId = '50000000-0000-4000-8000-000000000901';
  messageId = null;
  claimError = null;
  commitFailures = 0;
  commits = 0;
  deliveryKey = null;
  claimParams = null;
  failures = [];

  async rpc(name, params) {
    if (name === 'sales_lead_initial_email_claim') {
      this.claimParams = params;
      if (this.claimError) return { data: { success: false, error: this.claimError }, error: null };
      if (this.status === 'committed') {
        return { data: { success: true, action: 'already_committed', delivery_id: this.deliveryId, provider_message_id: this.messageId }, error: null };
      }
      if (this.status === 'provider_accepted') {
        return { data: { success: true, action: 'commit_only', delivery_id: this.deliveryId, provider_message_id: this.messageId }, error: null };
      }
      if (this.status === 'uncertain') {
        return { data: { success: false, error: 'email_delivery_outcome_uncertain', retry_blocked: true }, error: null };
      }
      this.status = 'sending';
      this.deliveryKey = params.p_delivery_key;
      return { data: { success: true, action: 'call_provider', delivery_id: this.deliveryId, outbound_capture_id: batchInput.outboundCaptureId }, error: null };
    }
    if (name === 'sales_lead_initial_email_record_provider_result') {
      this.status = params.p_result === 'accepted' ? 'provider_accepted'
        : params.p_result === 'rejected' ? 'provider_rejected' : 'uncertain';
      this.messageId = params.p_provider_message_id;
      return { data: { success: true }, error: null };
    }
    if (name === 'sales_lead_initial_email_commit') {
      if (this.commitFailures-- > 0) return { data: null, error: { message: 'fixture failure' } };
      this.status = 'committed';
      this.commits += 1;
      return { data: { success: true, batch_status: 'completed' }, error: null };
    }
    if (name === 'sales_lead_email_batch_item_record_failure') {
      this.failures.push(params);
      return { data: { success: true, batch_status: 'failed' }, error: null };
    }
    throw new Error(name);
  }
}

const countingProvider = (counter, result = { accepted: true, messageId: 'resend-batch-1' }) => ({
  send: async (payload, key) => {
    counter.calls += 1;
    counter.keys.push(key);
    counter.payloads.push(payload);
    return result;
  },
});
const newCounter = () => ({ calls: 0, keys: [], payloads: [] });

test('worker rejects a non-POST request before anything else happens', () => {
  assert.deepEqual(
    authorizeSalesLeadBatchWorkerRequest({ method: 'GET', authorization: `Bearer ${WORKER_SECRET}`, secret: WORKER_SECRET }),
    { ok: false, status: 405, error: 'method_not_allowed' },
  );
});

test('worker refuses to run without a configured secret', () => {
  for (const secret of [undefined, null, '', '   ', 'short-secret']) {
    assert.deepEqual(
      authorizeSalesLeadBatchWorkerRequest({ method: 'POST', authorization: `Bearer ${WORKER_SECRET}`, secret }),
      { ok: false, status: 500, error: 'worker_secret_not_configured' },
      String(secret),
    );
  }
});

test('worker rejects a missing or wrong Authorization header with 401', () => {
  for (const authorization of [
    null, '', 'Bearer ', `Bearer ${'x'.repeat(48)}`, WORKER_SECRET,
    `Basic ${WORKER_SECRET}`, `Bearer ${WORKER_SECRET}extra`,
  ]) {
    assert.deepEqual(
      authorizeSalesLeadBatchWorkerRequest({ method: 'POST', authorization, secret: WORKER_SECRET }),
      { ok: false, status: 401, error: 'unauthorized' },
      String(authorization),
    );
  }
  assert.deepEqual(
    authorizeSalesLeadBatchWorkerRequest({ method: 'POST', authorization: `Bearer ${WORKER_SECRET}`, secret: WORKER_SECRET }),
    { ok: true },
  );
});

test('the batch sender identity is exactly the manual sender identity', () => {
  assert.equal(SALES_LEAD_INITIAL_EMAIL_FROM, 'Miroslav | OneMil <b2b@onemil.cz>');
  assert.equal(SALES_LEAD_INITIAL_EMAIL_REPLY_TO, 'Miroslav | OneMil <b2b@onemil.cz>');
  assert.equal(batchInput.from, SALES_LEAD_INITIAL_EMAIL_FROM);
  assert.equal(batchInput.replyTo, SALES_LEAD_INITIAL_EMAIL_REPLY_TO);
});

test('a batch run calls the fake provider exactly once and commits once', async () => {
  const rpc = new FakeBatchRpc();
  const counter = newCounter();
  const result = await deliverSalesLeadInitialEmail(rpc, countingProvider(counter), batchInput);
  assert.equal(result.success, true);
  assert.equal(counter.calls, 1);
  assert.equal(rpc.commits, 1);
  assert.equal(counter.keys[0], rpc.deliveryKey);
  assert.equal(rpc.claimParams.p_mode, 'batch_initial');
  assert.equal(rpc.claimParams.p_batch_item_id, batchInput.batchItemId);
  assert.deepEqual(counter.payloads[0].to, [batchInput.recipient]);
  assert.equal(counter.payloads[0].from, SALES_LEAD_INITIAL_EMAIL_FROM);
  assert.equal(counter.payloads[0].attachments, undefined);
});

test('two concurrent batch runs never produce a second provider call', async () => {
  const rpc = new FakeBatchRpc();
  const counter = newCounter();
  const provider = countingProvider(counter);
  const results = await Promise.all([1, 2].map(() => deliverSalesLeadInitialEmail(rpc, provider, batchInput)));
  assert.equal(counter.calls, 1);
  assert.equal(results.filter((row) => row.success).length, 2);
  assert.equal(rpc.commits, 1);
});

test('an accepted provider call plus a failed commit continues as commit only', async () => {
  const rpc = new FakeBatchRpc();
  rpc.commitFailures = 1;
  const counter = newCounter();
  const provider = countingProvider(counter);
  const first = await deliverSalesLeadInitialEmail(rpc, provider, batchInput);
  assert.equal(first.providerAccepted, true);
  assert.equal(first.error, 'provider_accepted_commit_failed');
  const second = await deliverSalesLeadInitialEmail(rpc, provider, batchInput);
  assert.equal(second.success, true);
  assert.equal(counter.calls, 1);
  assert.equal(rpc.commits, 1);
});

test('an explicit provider rejection is reported as a failed attempt without commit', async () => {
  const rpc = new FakeBatchRpc();
  let calls = 0;
  const result = await deliverSalesLeadInitialEmail(rpc, {
    send: async () => { calls += 1; return { accepted: false, errorCode: 'email_send_failed' }; },
  }, batchInput);
  assert.equal(result.success, false);
  assert.equal(result.error, 'email_send_failed');
  assert.equal(result.providerAccepted, false);
  assert.equal(rpc.commits, 0);
  assert.equal(calls, 1);
});

test('an unknown provider outcome stays uncertain and blocks any automatic retry', async () => {
  const rpc = new FakeBatchRpc();
  let calls = 0;
  const provider = { send: async () => { calls += 1; throw new Error('timeout'); } };
  const first = await deliverSalesLeadInitialEmail(rpc, provider, batchInput);
  const replay = await deliverSalesLeadInitialEmail(rpc, provider, batchInput);
  assert.equal(first.error, 'email_delivery_outcome_uncertain');
  assert.equal(first.retryBlocked, true);
  assert.equal(rpc.status, 'uncertain');
  assert.equal(replay.retryBlocked, true);
  assert.equal(calls, 1);
  assert.equal(rpc.commits, 0);
});

test('a barrier reported by the database blocks the provider for a batch item', async () => {
  for (const barrier of ['batch_snapshot_mismatch', 'automation_disabled', 'batch_not_scheduled',
    'batch_item_not_processing', 'scheduled_window_missed', 'do_not_contact', 'suppressed']) {
    const rpc = new FakeBatchRpc();
    rpc.claimError = barrier;
    let calls = 0;
    const result = await deliverSalesLeadInitialEmail(rpc, {
      send: async () => { calls += 1; return { accepted: true, messageId: 'never' }; },
    }, batchInput);
    assert.equal(result.error, barrier);
    assert.equal(calls, 0);
    assert.equal(rpc.commits, 0);
  }
});

test('batch mode without a batch item id never reaches the database or the provider', async () => {
  const rpc = new FakeBatchRpc();
  let calls = 0;
  const result = await deliverSalesLeadInitialEmail(rpc, {
    send: async () => { calls += 1; return { accepted: true, messageId: 'never' }; },
  }, { ...batchInput, batchItemId: null });
  assert.equal(result.error, 'batch_item_id_required');
  assert.equal(rpc.claimParams, null);
  assert.equal(calls, 0);
});

test('batch identity includes the batch item while the manual identity is unchanged', async () => {
  const withItem = new FakeBatchRpc();
  const otherItem = new FakeBatchRpc();
  await deliverSalesLeadInitialEmail(withItem, countingProvider(newCounter()), batchInput);
  await deliverSalesLeadInitialEmail(otherItem, countingProvider(newCounter()), {
    ...batchInput, batchItemId: '62000000-0000-4000-8000-000000000902',
  });
  assert.notEqual(withItem.deliveryKey, otherItem.deliveryKey);

  // Golden value captured from the released manual sender. It must not move.
  const manual = new FakeBatchRpc();
  await deliverSalesLeadInitialEmail(manual, countingProvider(newCounter()), {
    leadId: '30000000-0000-4000-8000-000000000001',
    performedBy: '10000000-0000-4000-8000-000000000001',
    recipient: 'info@example.cz',
    subject: 'Nabidka',
    bodySource: 'Dobry den.',
    bodyText: 'Dobry den.',
    bodyHtml: '<p>Dobry den.</p>',
    attachmentMetadata: [],
    attachments: [],
    outboundCaptureId: '40000000-0000-4000-8000-000000000001',
    from: SALES_LEAD_INITIAL_EMAIL_FROM,
    replyTo: SALES_LEAD_INITIAL_EMAIL_REPLY_TO,
  });
  assert.equal(manual.deliveryKey, '21bb84d8028daf342a4afeb1096cc650b63cd050f0ef391f0357753f62e5877f');
  assert.equal(manual.claimParams.p_mode, 'manual_initial');
  assert.equal(manual.claimParams.p_batch_item_id, null);
});

test('the shared Resend adapter never turns an unprovable outcome into a rejection', async () => {
  const provider = createResendInitialEmailProvider({
    emails: { send: async () => ({ error: { name: 'invalid_idempotent_request' } }) },
  });
  await assert.rejects(
    () => provider.send({}, 'key'),
    (error) => error instanceof InitialEmailProviderOutcomeUncertainError
      && error.deliveryErrorCode === 'email_delivery_idempotency_conflict',
  );
  const rejecting = createResendInitialEmailProvider({
    emails: { send: async () => ({ error: { name: 'validation_error' } }) },
  });
  assert.deepEqual(await rejecting.send({}, 'key'), { accepted: false, errorCode: 'email_send_failed' });
  const accepting = createResendInitialEmailProvider({
    emails: { send: async () => ({ data: { id: 'resend-ok' } }) },
  });
  assert.deepEqual(await accepting.send({}, 'key'), { accepted: true, messageId: 'resend-ok' });
});
