import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverSalesLeadInitialEmail } from '../../supabase/functions/_shared/salesLeadInitialEmailDelivery.ts';

const baseInput = {
  leadId: '30000000-0000-4000-8000-000000000001',
  performedBy: '10000000-0000-4000-8000-000000000001',
  recipient: 'info@example.cz', subject: 'Nabídka', bodySource: 'Dobrý den.',
  bodyText: 'Dobrý den.', bodyHtml: '<p>Dobrý den.</p>', attachmentMetadata: [], attachments: [],
  outboundCaptureId: '40000000-0000-4000-8000-000000000001',
  from: 'OneMil obchodní tým <b2b@onemil.cz>', replyTo: 'OneMil obchodní tým <b2b@onemil.cz>',
};

class FakeRpc {
  status = null; deliveryId = '50000000-0000-4000-8000-000000000001'; messageId = null;
  claimError = null; commitFailures = 0; commits = 0;
  async rpc(name, params) {
    if (name === 'sales_lead_initial_email_claim') {
      if (this.claimError) return { data: { success: false, error: this.claimError }, error: null };
      if (this.status === 'committed') return { data: { success: true, action: 'already_committed', delivery_id: this.deliveryId, provider_message_id: this.messageId }, error: null };
      if (this.status === 'provider_accepted') return { data: { success: true, action: 'commit_only', delivery_id: this.deliveryId, provider_message_id: this.messageId }, error: null };
      if (this.status === 'sending') return { data: { success: false, error: 'email_delivery_in_progress', retry_blocked: true }, error: null };
      if (this.status === 'uncertain') return { data: { success: false, error: 'email_delivery_outcome_uncertain', retry_blocked: true }, error: null };
      this.status = 'sending'; this.deliveryKey = params.p_delivery_key;
      return { data: { success: true, action: 'call_provider', delivery_id: this.deliveryId, outbound_capture_id: baseInput.outboundCaptureId }, error: null };
    }
    if (name === 'sales_lead_initial_email_record_provider_result') {
      this.status = params.p_result === 'accepted' ? 'provider_accepted' : params.p_result === 'rejected' ? 'provider_rejected' : 'uncertain';
      this.messageId = params.p_provider_message_id;
      return { data: { success: true }, error: null };
    }
    if (name === 'sales_lead_initial_email_commit') {
      if (this.commitFailures-- > 0) return { data: null, error: { message: 'fixture failure' } };
      this.status = 'committed'; this.commits += 1;
      return { data: { success: true }, error: null };
    }
    throw new Error(name);
  }
}

const acceptedProvider = (counter) => ({ send: async (_payload, key) => { counter.calls += 1; counter.keys.push(key); return { accepted: true, messageId: 'resend-1' }; } });

test('two concurrent requests call the fake provider exactly once', async () => {
  const rpc = new FakeRpc(); const counter = { calls: 0, keys: [] };
  const results = await Promise.all([1, 2].map(() => deliverSalesLeadInitialEmail(rpc, acceptedProvider(counter), baseInput)));
  assert.equal(counter.calls, 1); assert.equal(results.filter((result) => result.success).length, 2);
});

test('accepted provider result commits once and replay does not call provider', async () => {
  const rpc = new FakeRpc(); const counter = { calls: 0, keys: [] }; const provider = acceptedProvider(counter);
  assert.equal((await deliverSalesLeadInitialEmail(rpc, provider, baseInput)).success, true);
  assert.equal((await deliverSalesLeadInitialEmail(rpc, provider, baseInput)).success, true);
  assert.equal(counter.calls, 1); assert.equal(rpc.commits, 1); assert.equal(counter.keys[0], rpc.deliveryKey);
});

test('explicit rejection permits a safe later attempt without commit', async () => {
  const rpc = new FakeRpc(); let calls = 0;
  const rejected = { send: async () => { calls += 1; return { accepted: false, errorCode: 'email_send_failed' }; } };
  assert.equal((await deliverSalesLeadInitialEmail(rpc, rejected, baseInput)).success, false);
  assert.equal(rpc.commits, 0); rpc.status = null;
  await deliverSalesLeadInitialEmail(rpc, rejected, { ...baseInput, subject: 'Změněná nabídka' });
  assert.equal(calls, 2);
});

test('unknown provider outcome becomes uncertain and blocks automatic retry', async () => {
  const rpc = new FakeRpc(); let calls = 0;
  const provider = { send: async () => { calls += 1; throw new Error('timeout'); } };
  const first = await deliverSalesLeadInitialEmail(rpc, provider, baseInput);
  const replay = await deliverSalesLeadInitialEmail(rpc, provider, baseInput);
  assert.equal(first.error, 'email_delivery_outcome_uncertain'); assert.equal(replay.retryBlocked, true); assert.equal(calls, 1);
});

test('accepted plus first DB commit failure resumes commit only', async () => {
  const rpc = new FakeRpc(); rpc.commitFailures = 1; const counter = { calls: 0, keys: [] }; const provider = acceptedProvider(counter);
  const first = await deliverSalesLeadInitialEmail(rpc, provider, baseInput);
  assert.equal(first.providerAccepted, true); assert.equal(first.error, 'provider_accepted_commit_failed');
  assert.equal((await deliverSalesLeadInitialEmail(rpc, provider, baseInput)).success, true);
  assert.equal(counter.calls, 1); assert.equal(rpc.commits, 1);
});

for (const barrier of ['do_not_contact', 'suppressed', 'initial_email_status_not_allowed', 'missing_contact_email',
  'initial_email_already_sent', 'duplicate_override_required', 'unresolved_template_variables']) {
  test(`${barrier} blocks before provider`, async () => {
    const rpc = new FakeRpc(); rpc.claimError = barrier; let calls = 0;
    const result = await deliverSalesLeadInitialEmail(rpc, { send: async () => { calls += 1; return { accepted: true, messageId: 'x' }; } }, baseInput);
    assert.equal(result.error, barrier); assert.equal(calls, 0);
  });
}

test('manual attachment remains in provider payload while evidence stores only metadata and hash', async () => {
  const rpc = new FakeRpc(); let payload;
  const input = { ...baseInput, attachmentMetadata: [{ filename: 'nabidka.pdf', size: 3, content_type: 'application/pdf' }],
    attachments: [{ filename: 'nabidka.pdf', content: 'YWJj', content_type: 'application/pdf' }] };
  await deliverSalesLeadInitialEmail(rpc, { send: async (value) => { payload = value; return { accepted: true, messageId: 'resend-a' }; } }, input);
  assert.equal(payload.attachments[0].content, 'YWJj');
});
