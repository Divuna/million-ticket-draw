/**
 * Spec 41 - Affiliate payout documents (Phase C proposal)
 *
 * Staging-only and opt-in. These tests must run only after Phase A+B+C are
 * explicitly applied to staging and the create-affiliate-payout-document Edge
 * Function is deployed to staging.
 *
 * Required env:
 *   E2E_AFFILIATE_PAYOUTS=1
 *   VITE_SUPABASE_URL - must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_ADMIN_EMAIL
 *   E2E_ADMIN_PASSWORD
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ADMIN_EMAIL = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL) ?? '';
const ADMIN_PASSWORD = (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD) ?? '';
const ENABLED = process.env.E2E_AFFILIATE_PAYOUTS === '1';

function skipIfNotEnabled() {
  if (
    !ENABLED ||
    !SUPABASE_URL.includes(STAGING_REF) ||
    !SUPABASE_ANON ||
    !SERVICE_ROLE ||
    !ADMIN_EMAIL ||
    !ADMIN_PASSWORD
  ) {
    test.skip(
      true,
      'staging-only opt-in - requires E2E_AFFILIATE_PAYOUTS=1 and staging Supabase/admin env',
    );
  }
}

function makeServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function makeAdminUserClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (error) throw new Error(`Cannot sign in admin user: ${error.message}`);
  return client;
}

async function readFunctionErrorPayload(data: any, error: any): Promise<any> {
  if (data) return data;

  const context = error?.context;
  if (context && typeof context.json === 'function') {
    try {
      return await context.json();
    } catch (_) {
      // Fall through to generic error shape.
    }
  }

  return {
    error: error?.message ?? 'unknown_function_error',
    status: error?.name ?? 'unknown_function_error',
  };
}

async function seedApprovedCommission(
  admin: SupabaseClient,
): Promise<{ affiliateId: string; commissionId: string }> {
  const ts = Date.now();
  const { data: affiliate, error: affiliateError } = await (admin as any)
    .from('affiliate_accounts')
    .insert({
      name: `E2E Spec41 Obchodnik ${ts}`,
      email: `spec41-${ts}@example.test`,
      ref_code: `SPEC41${ts % 100000}`,
      status: 'approved',
      payout_account: '12545857',
      payout_bank: '0800',
      ico: '12345678',
      vat_id: null,
      is_vat_payer: false,
      billing_street: 'Testovaci 1',
      billing_city: 'Praha',
      billing_zip: '11000',
      billing_country: 'CZ',
    })
    .select('id')
    .single();
  if (affiliateError || !affiliate) {
    throw new Error(`Cannot create test affiliate: ${affiliateError?.message}`);
  }

  const { data: commission, error: commissionError } = await (admin as any)
    .from('affiliate_commissions')
    .insert({
      affiliate_id: affiliate.id,
      commission_type: 'company_invoice',
      period_month: '2020-01-01',
      amount_base_czk: 123.45,
      vat_rate: 0,
      amount_total_czk: 123.45,
      status: 'approved',
    })
    .select('id')
    .single();
  if (commissionError || !commission) {
    await (admin as any).from('affiliate_accounts').delete().eq('id', affiliate.id);
    throw new Error(`Cannot create test commission: ${commissionError?.message}`);
  }

  return { affiliateId: affiliate.id, commissionId: commission.id };
}

async function cleanup(
  admin: SupabaseClient,
  ids: { affiliateId?: string; commissionId?: string; documentId?: string; pdfPath?: string },
) {
  if (ids.pdfPath) {
    await (admin as any).storage.from('affiliate-payout-docs').remove([ids.pdfPath]);
  }
  if (ids.documentId) {
    const { data: doc } = await (admin as any)
      .from('affiliate_payout_documents')
      .select('email_queue_id,accounting_email_queue_id')
      .eq('id', ids.documentId)
      .maybeSingle();
    const queueIds = [doc?.email_queue_id, doc?.accounting_email_queue_id].filter(Boolean);
    if (queueIds.length > 0) {
      await (admin as any).from('email_queue').delete().in('id', queueIds);
    }
    await (admin as any).from('affiliate_payout_documents').delete().eq('id', ids.documentId);
  }
  if (ids.commissionId) {
    await (admin as any).from('affiliate_commissions').delete().eq('id', ids.commissionId);
  }
  if (ids.affiliateId) {
    await (admin as any).from('affiliate_accounts').delete().eq('id', ids.affiliateId);
  }
}

async function withAccountingEmail<T>(admin: SupabaseClient, fn: () => Promise<T>): Promise<T> {
  const { data: existing } = await (admin as any)
    .from('settings')
    .select('key,value')
    .eq('key', 'accounting_email')
    .maybeSingle();

  await (admin as any)
    .from('settings')
    .upsert({ key: 'accounting_email', value: 'ucetni-spec41@example.test' });

  try {
    return await fn();
  } finally {
    if (existing) {
      await (admin as any).from('settings').upsert(existing);
    } else {
      await (admin as any).from('settings').delete().eq('key', 'accounting_email');
    }
  }
}

test.describe('41 - affiliate payout documents', () => {
  test.beforeEach(() => {
    skipIfNotEnabled();
  });

  test('41a) vytvori payout doklad, PDF a email_queue pro affiliate i ucetni', async () => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    const ids: { affiliateId?: string; commissionId?: string; documentId?: string; pdfPath?: string } = {};

    await withAccountingEmail(service, async () => {
      try {
        const seeded = await seedApprovedCommission(service);
        ids.affiliateId = seeded.affiliateId;
        ids.commissionId = seeded.commissionId;

        const { data, error } = await (adminUser as any).functions.invoke(
          'create-affiliate-payout-document',
          { body: { commission_id: seeded.commissionId } },
        );
        expect(error).toBeFalsy();
        expect(data?.success).toBe(true);
        expect(data?.status).toBe('created');
        expect(data?.document_number).toMatch(/^APD-\d{4}-\d{6}$/);
        ids.documentId = data.document_id;
        ids.pdfPath = data.pdf_storage_path;

        const { data: commission } = await (service as any)
          .from('affiliate_commissions')
          .select('status,payout_document_id')
          .eq('id', seeded.commissionId)
          .single();
        expect(commission.status).toBe('ready_to_pay');
        expect(commission.payout_document_id).toBe(data.document_id);

        const { data: document } = await (service as any)
          .from('affiliate_payout_documents')
          .select('document_number,pdf_storage_path,pdf_sha256,email_queue_id,accounting_email_queue_id,accounting_email')
          .eq('id', data.document_id)
          .single();
        expect(document.pdf_storage_path).toBe(data.pdf_storage_path);
        expect(document.pdf_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(document.email_queue_id).toBeTruthy();
        expect(document.accounting_email_queue_id).toBeTruthy();
        expect(document.accounting_email).toBe('ucetni-spec41@example.test');

        const { data: pdfBlob, error: downloadError } = await (service as any).storage
          .from('affiliate-payout-docs')
          .download(data.pdf_storage_path);
        expect(downloadError).toBeFalsy();
        expect(pdfBlob.size).toBeGreaterThan(1000);

        const { data: queuedEmails } = await (service as any)
          .from('email_queue')
          .select('id,email,attachment_storage_bucket,attachment_storage_path,attachment_required,status')
          .in('id', [document.email_queue_id, document.accounting_email_queue_id]);
        expect(queuedEmails).toHaveLength(2);
        for (const queued of queuedEmails) {
          expect(queued.attachment_storage_bucket).toBe('affiliate-payout-docs');
          expect(queued.attachment_storage_path).toBe(data.pdf_storage_path);
          expect(queued.attachment_required).toBe(true);
          expect(queued.status ?? 'pending').toBe('pending');
        }
      } finally {
        await cleanup(service, ids);
      }
    });
  });

  test('41b) chybejici settings.accounting_email vrati rizenou chybu', async () => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    const ids: { affiliateId?: string; commissionId?: string } = {};
    const { data: existing } = await (service as any)
      .from('settings')
      .select('key,value')
      .eq('key', 'accounting_email')
      .maybeSingle();

    try {
      await (service as any).from('settings').delete().eq('key', 'accounting_email');
      const seeded = await seedApprovedCommission(service);
      ids.affiliateId = seeded.affiliateId;
      ids.commissionId = seeded.commissionId;

      const { data, error } = await (adminUser as any).functions.invoke(
        'create-affiliate-payout-document',
        { body: { commission_id: seeded.commissionId } },
      );
      expect(error).toBeTruthy();
      const payload = await readFunctionErrorPayload(data, error);
      expect(payload?.error ?? payload?.status).toBe('missing_accounting_email');
    } finally {
      if (existing) {
        await (service as any).from('settings').upsert(existing);
      }
      await cleanup(service, ids);
    }
  });

  test('41c) payout email_queue zaznam vyzaduje privatni prilohu', async () => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    const ids: { affiliateId?: string; commissionId?: string; documentId?: string; pdfPath?: string } = {};

    await withAccountingEmail(service, async () => {
      try {
        const seeded = await seedApprovedCommission(service);
        ids.affiliateId = seeded.affiliateId;
        ids.commissionId = seeded.commissionId;

        const { data, error } = await (adminUser as any).functions.invoke(
          'create-affiliate-payout-document',
          { body: { commission_id: seeded.commissionId } },
        );
        expect(error).toBeFalsy();
        ids.documentId = data.document_id;
        ids.pdfPath = data.pdf_storage_path;

        const { data: document } = await (service as any)
          .from('affiliate_payout_documents')
          .select('email_queue_id,accounting_email_queue_id')
          .eq('id', data.document_id)
          .single();

        const { data: queuedEmails } = await (service as any)
          .from('email_queue')
          .select('attachment_url,attachment_storage_bucket,attachment_storage_path,attachment_required')
          .in('id', [document.email_queue_id, document.accounting_email_queue_id]);

        expect(queuedEmails).toHaveLength(2);
        for (const queued of queuedEmails) {
          expect(queued.attachment_url).toBeFalsy();
          expect(queued.attachment_storage_bucket).toBe('affiliate-payout-docs');
          expect(queued.attachment_storage_path).toBe(data.pdf_storage_path);
          expect(queued.attachment_required).toBe(true);
        }
      } finally {
        await cleanup(service, ids);
      }
    });
  });

  test('41d) worker oznaci required prilohu jako failed, kdyz chybi PDF', async () => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    let emailQueueId: string | null = null;

    try {
      const { data: queued, error: queueError } = await (service as any)
        .from('email_queue')
        .insert({
          email: `spec41-required-missing-${Date.now()}@example.test`,
          subject: 'Spec41 missing required payout PDF',
          body: '<p>Required attachment should fail before Resend.</p>',
          attachment_storage_bucket: 'affiliate-payout-docs',
          attachment_storage_path: `missing/spec41-${Date.now()}.pdf`,
          attachment_filename: 'missing.pdf',
          attachment_content_type: 'application/pdf',
          attachment_required: true,
          status: 'pending',
        })
        .select('id')
        .single();
      expect(queueError).toBeFalsy();
      emailQueueId = queued.id;

      const { data, error } = await (adminUser as any).functions.invoke(
        'process-email-queue',
        { body: { email_id: emailQueueId } },
      );
      expect(error).toBeFalsy();
      expect(data?.success).toBe(true);
      expect(data?.processed).toBe(1);
      expect(data?.sent).toBe(0);
      expect(data?.failed).toBe(1);

      const { data: row } = await (service as any)
        .from('email_queue')
        .select('status,sent_at')
        .eq('id', emailQueueId)
        .single();
      expect(row.status).toBe('failed');
      expect(row.sent_at).toBeFalsy();
    } finally {
      if (emailQueueId) {
        await (service as any).from('email_queue').delete().eq('id', emailQueueId);
      }
    }
  });

  test('41e) document RPC nejsou volatelne pres anon ani authenticated (ACL patch)', async () => {
    // Vyžaduje aplikovaný ACL patch 20260611090000_affiliate_payouts_acl_patch.sql.
    // prepare/finalize_affiliate_payout_document nemají vnitřní auth guard —
    // jsou service_role-only a granty jsou jediná ochrana. Tento test zamyká,
    // že implicitní Supabase granty pro anon/authenticated zůstávají odebrané.
    const adminUser = await makeAdminUserClient();
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const randomId = crypto.randomUUID();

    for (const client of [adminUser, anonClient]) {
      const { error: prepErr } = await (client as any).rpc(
        'prepare_affiliate_payout_document',
        { p_commission_id: randomId },
      );
      expect(prepErr).toBeTruthy();
      expect(prepErr.code).toBe('42501');

      const { error: finErr } = await (client as any).rpc(
        'finalize_affiliate_payout_document',
        {
          p_commission_id: randomId,
          p_document_number: 'SPEC41E-NO-ACCESS',
          p_pdf_storage_path: 'spec41e/no-access.pdf',
          p_pdf_sha256: '0'.repeat(64),
          p_affiliate_email_subject: 'x',
          p_affiliate_email_body: 'x',
          p_accounting_email_subject: 'x',
          p_accounting_email_body: 'x',
        },
      );
      expect(finErr).toBeTruthy();
      expect(finErr.code).toBe('42501');
    }
  });
});
