/**
 * Spec 43 - Partner invoice coin activation snapshots
 *
 * Staging-only and opt-in. Verifies that coin invoice creation persists
 * partner_invoice_lines and that the PDF activation overview is derived from
 * those invoice-linked rows, not from partner + date range.
 *
 * Required env:
 *   E2E_PARTNER_INVOICES=1
 *   VITE_SUPABASE_URL - must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   VITE_INTERNAL_FUNCTION_TOKEN
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const INTERNAL_TOKEN = process.env.VITE_INTERNAL_FUNCTION_TOKEN ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ENABLED = process.env.E2E_PARTNER_INVOICES === '1';

function skipIfNotEnabled() {
  if (
    !ENABLED ||
    !SUPABASE_URL.includes(STAGING_REF) ||
    !SUPABASE_ANON ||
    !INTERNAL_TOKEN ||
    !SERVICE_ROLE
  ) {
    test.skip(
      true,
      'staging-only opt-in - requires E2E_PARTNER_INVOICES=1 and staging Supabase/function env',
    );
  }
}

function makeServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function cleanup(
  admin: SupabaseClient,
  ids: {
    partnerId?: string;
    invoiceId?: string;
    rewardCodes: string[];
    activationIds: string[];
    pdfPath?: string;
  },
) {
  if (ids.pdfPath) {
    await (admin as any).storage.from('partner-invoices').remove([ids.pdfPath]);
  }
  if (ids.invoiceId) {
    await (admin as any).from('partner_invoice_exports').delete().eq('invoice_id', ids.invoiceId);
    await (admin as any).from('partner_invoice_lines').delete().eq('invoice_id', ids.invoiceId);
    await (admin as any).from('partner_invoices').delete().eq('id', ids.invoiceId);
  }
  if (ids.activationIds.length > 0) {
    await (admin as any).from('partner_coin_activations').delete().in('id', ids.activationIds);
  }
  if (ids.rewardCodes.length > 0) {
    await (admin as any).from('partner_reward_codes').delete().in('code', ids.rewardCodes);
  }
  if (ids.partnerId) {
    await (admin as any).from('partners').delete().eq('id', ids.partnerId);
  }
}

function storagePathFromPublicUrl(url: string): string | undefined {
  const marker = '/storage/v1/object/public/partner-invoices/';
  const index = url.indexOf(marker);
  if (index === -1) return undefined;
  return decodeURIComponent(url.slice(index + marker.length));
}

async function callGeneratePdf(invoiceId: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-partner-invoice-pdf`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      'x-internal-token': INTERNAL_TOKEN,
    },
    body: JSON.stringify({ invoice_id: invoiceId }),
  });

  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

test.describe('43 - partner invoices', () => {
  test.beforeEach(() => {
    skipIfNotEnabled();
  });

  test('43a) PDF activation overview total matches invoice-linked lines only', async () => {
    test.setTimeout(90_000);
    const admin = makeServiceClient();
    const unique = Date.now();
    const periodFrom = '2020-03-02';
    const periodTo = '2020-03-08';
    const ids: {
      partnerId?: string;
      invoiceId?: string;
      rewardCodes: string[];
      activationIds: string[];
      pdfPath?: string;
    } = { rewardCodes: [], activationIds: [] };

    try {
      const { data: partner, error: partnerError } = await (admin as any)
        .from('partners')
        .insert({
          name: `Spec43 Partner ${unique}`,
          company_name: `Spec43 Partner ${unique} s.r.o.`,
          contact_email: 'eshop@onemil.cz',
          website_url: 'https://spec43.example.test',
          logo_url: '',
          status: 'approved',
          approved_at: new Date().toISOString(),
          price_per_coin: 1,
          vat_rate: 0,
          billing_street: 'Testovaci 43',
          billing_city: 'Praha',
          billing_zip: '11000',
          billing_country: 'CZ',
        })
        .select('id')
        .single();
      expect(partnerError).toBeNull();
      ids.partnerId = partner.id;

      const rewardRows = [
        {
          code: `S43A${String(unique).slice(-8)}`,
          partner_id: partner.id,
          coins: 5,
          status: 'activated',
          external_order_id: `SPEC43-CAPTURED-${unique}`,
          issued_to_email: 'eshop@onemil.cz',
          customer_email: 'eshop@onemil.cz',
        },
        {
          code: `S43B${String(unique).slice(-8)}`,
          partner_id: partner.id,
          coins: 10,
          status: 'activated',
          external_order_id: `SPEC43-PREINVOICED-${unique}`,
          issued_to_email: 'eshop@onemil.cz',
          customer_email: 'eshop@onemil.cz',
        },
      ];
      ids.rewardCodes = rewardRows.map((row) => row.code);

      const { error: rewardError } = await (admin as any)
        .from('partner_reward_codes')
        .insert(rewardRows);
      expect(rewardError).toBeNull();

      const activationRows = [
        {
          partner_id: partner.id,
          code: rewardRows[0].code,
          coins: 5,
          user_id: crypto.randomUUID(),
          external_order_id: rewardRows[0].external_order_id,
          activated_at: `${periodFrom}T10:00:00.000Z`,
          invoiced: false,
        },
        {
          partner_id: partner.id,
          code: rewardRows[1].code,
          coins: 10,
          user_id: crypto.randomUUID(),
          external_order_id: rewardRows[1].external_order_id,
          activated_at: `${periodFrom}T11:00:00.000Z`,
          invoiced: true,
        },
      ];

      const { data: activations, error: activationError } = await (admin as any)
        .from('partner_coin_activations')
        .insert(activationRows)
        .select('id,coins,invoiced');
      expect(activationError).toBeNull();
      ids.activationIds = activations.map((row: any) => row.id);

      const { error: rpcError } = await (admin as any).rpc('create_partner_invoices_for_period', {
        p_period_from: periodFrom,
        p_period_to: periodTo,
      });
      expect(rpcError).toBeNull();

      const { data: invoice, error: invoiceError } = await (admin as any)
        .from('partner_invoices')
        .select('id,coins_total,coins_activated')
        .eq('partner_id', partner.id)
        .eq('period_start', periodFrom)
        .eq('period_end', periodTo)
        .single();
      expect(invoiceError).toBeNull();
      ids.invoiceId = invoice.id;
      expect(Number(invoice.coins_total)).toBe(5);
      expect(Number(invoice.coins_activated)).toBe(5);

      const { data: lines, error: linesError } = await (admin as any)
        .from('partner_invoice_lines')
        .select('activation_id,coins,external_order_id')
        .eq('invoice_id', invoice.id);
      expect(linesError).toBeNull();
      expect(lines).toHaveLength(1);
      expect(Number(lines[0].coins)).toBe(5);
      expect(lines[0].external_order_id).toBe(rewardRows[0].external_order_id);

      const { data: allActivations, error: allActivationError } = await (admin as any)
        .from('partner_coin_activations')
        .select('coins,invoiced')
        .eq('partner_id', partner.id)
        .gte('activated_at', periodFrom)
        .lt('activated_at', '2020-03-09');
      expect(allActivationError).toBeNull();
      const dateRangeCoins = allActivations.reduce((sum: number, row: any) => sum + Number(row.coins), 0);
      expect(dateRangeCoins).toBe(15);

      const pdf = await callGeneratePdf(invoice.id);
      expect(pdf.status).toBe(200);
      expect(pdf.body.success).toBe(true);
      expect(pdf.body.activation_overview_source).toBe('partner_invoice_lines');
      expect(pdf.body.activation_overview_rows).toBe(1);
      expect(pdf.body.activation_overview_total_coins).toBe(5);
      expect(pdf.body.activation_overview_total_coins).toBe(Number(invoice.coins_total));
      expect(pdf.body.activation_overview_total_coins).not.toBe(dateRangeCoins);
      ids.pdfPath = storagePathFromPublicUrl(pdf.body.file_url);
    } finally {
      await cleanup(admin, ids);
    }
  });
});
