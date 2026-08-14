/**
 * Spec 45 - Admin partner invoice resend button.
 *
 * Staging-only. The Edge Function request is intercepted in the browser, so
 * this test never sends an email. Service role is used only for setup/cleanup.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { loginViaUI } from './helpers/auth';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ADMIN_EMAIL = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL) ?? '';
const ADMIN_PASSWORD = (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD) ?? '';

const RUN_ID = Date.now();
const PARTNER_NAME = `Spec45 Resend Partner ${RUN_ID}`;
const INVOICE_NUMBER = `TEST-S45-${RUN_ID}`;
const PDF_STORAGE_PATH = `spec45/${RUN_ID}.pdf`;

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) &&
  !!SUPABASE_ANON_KEY &&
  !!SERVICE_ROLE_KEY &&
  !!ADMIN_EMAIL &&
  !!ADMIN_PASSWORD;

function makeAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test.describe('45 - admin partner invoice resend button', () => {
  test.skip(!isStaging, 'staging-only - missing staging Supabase/admin env vars');

  let partnerId: string | null = null;
  let invoiceId: string | null = null;
  let capturedBody: any = null;

  test.beforeAll(async () => {
    const admin = makeAdmin();
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

    const { data: partner, error: partnerError } = await (admin as any)
      .from('partners')
      .insert({
        name: PARTNER_NAME,
        company_name: PARTNER_NAME,
        logo_url: 'https://example.invalid/spec45.png',
        website_url: 'https://example.invalid/spec45',
        contact_email: 'eshop@onemil.cz',
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (partnerError) throw new Error(`partner insert failed: ${partnerError.message}`);
    partnerId = partner.id;

    const { data: invoice, error: invoiceError } = await (admin as any)
      .from('partner_invoices')
      .insert({
        partner_id: partnerId,
        period_start: format(weekStart, 'yyyy-MM-dd'),
        period_end: format(weekEnd, 'yyyy-MM-dd'),
        period_from: format(weekStart, 'yyyy-MM-dd'),
        period_to: format(weekEnd, 'yyyy-MM-dd'),
        coins_total: 5,
        amount_net: 5,
        vat_amount: 1.05,
        amount_gross: 6.05,
        invoice_number: INVOICE_NUMBER,
        variable_symbol: '45000001',
        status: 'issued',
      })
      .select('id')
      .single();
    if (invoiceError) throw new Error(`invoice insert failed: ${invoiceError.message}`);
    invoiceId = invoice.id;

    const { error: exportError } = await (admin as any)
      .from('partner_invoice_exports')
      .insert({
        invoice_id: invoiceId,
        format: 'pdf',
        file_url: null,
        storage_bucket: 'partner-invoices',
        storage_path: PDF_STORAGE_PATH,
      });
    if (exportError) throw new Error(`export insert failed: ${exportError.message}`);
  });

  test.afterAll(async () => {
    const admin = makeAdmin();
    if (invoiceId) {
      await (admin as any).from('partner_invoice_exports').delete().eq('invoice_id', invoiceId);
      await (admin as any).from('partner_invoices').delete().eq('id', invoiceId);
    }
    if (partnerId) {
      await (admin as any).from('partners').delete().eq('id', partnerId);
    }
  });

  test('issued invoice shows Znovu odeslat and calls resend mode without data mutation', async ({ page }) => {
    await page.route('**/functions/v1/send-partner-invoice-email', async (route) => {
      capturedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          resend: true,
          sent_to: 'eshop@onemil.cz',
          pdf_export_id: 'spec45-mocked-export',
          status_updated: false,
        }),
      });
    });

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
      );
    });

    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/invoices');

    await expect(page.getByText(PARTNER_NAME)).toBeVisible({ timeout: 15_000 });
    await page.getByText(PARTNER_NAME).click();

    const resendButton = page.getByRole('button', { name: 'Znovu odeslat' });
    await expect(resendButton).toBeVisible();
    await expect(page.getByRole('button', { name: 'Odeslat fakturu emailem' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Označit jako zaplaceno' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Odeslat', exact: true })).toHaveCount(0);

    await resendButton.click();
    await expect(page.getByText('Faktura byla znovu odeslána.')).toBeVisible();

    expect(capturedBody).toEqual({ invoice_id: invoiceId, resend: true });

    const admin = makeAdmin();
    const { data, error } = await (admin as any)
      .from('partner_invoices')
      .select('status, paid_at')
      .eq('id', invoiceId)
      .single();
    expect(error).toBeNull();
    expect(data.status).toBe('issued');
    expect(data.paid_at).toBeNull();
  });
});
