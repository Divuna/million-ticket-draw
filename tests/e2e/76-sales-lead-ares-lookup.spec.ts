import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyAresResult,
  isValidSalesLeadIco,
  SALES_LEAD_ARES_NOT_FOUND,
  SALES_LEAD_ICO_ERROR,
} from '../../src/components/admin/sales-leads/salesLeadAres';
import { loginViaUI } from './helpers/auth';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const edgeFunction = read('supabase/functions/sales-lead-ares-lookup/index.ts');
const addDialog = read('src/components/admin/sales-leads/AddSalesLeadDialog.tsx');
const detail = read('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx');
const migration = read('supabase/migrations/20260715211027_sales_lead_ares_lookup_address.sql');
const liveAdminEmail = process.env.E2E_ADMIN_EMAIL ?? '';
const liveAdminPassword = process.env.E2E_ADMIN_PASSWORD ?? '';
const stagingReady = (process.env.VITE_SUPABASE_URL ?? '').includes('dxmowysntemfqfnanxua')
  && Boolean(liveAdminEmail && liveAdminPassword);

test.describe('76 — ruční načtení firmy z ARES', () => {
  test('přijímá pouze platné osmimístné IČO', () => {
    expect(isValidSalesLeadIco('17795851')).toBe(true);
    expect(isValidSalesLeadIco(' 17795851 ')).toBe(true);
    expect(isValidSalesLeadIco('123')).toBe(false);
    expect(isValidSalesLeadIco('12 345 678')).toBe(false);
    expect(isValidSalesLeadIco('abcdefgh')).toBe(false);
    expect(SALES_LEAD_ICO_ERROR).toBe('IČO musí obsahovat přesně 8 číslic');
  });

  test('doplní pouze ARES pole a zachová ručně vyplněný web, obor a kontakt', () => {
    const initial = {
      company_name: '', ico: '17795851', dic: '', address: '', city: '',
      website: 'https://example.test', industry: 'sluzby', contact_person: 'Pavel',
      contact_email: 'pavel@example.test', contact_phone: '+420 111 222 333',
    };
    const filled = applyAresResult(initial, {
      success: true,
      company_name: 'ICONIC POINT s.r.o.',
      ico: '17795851',
      dic: 'CZ17795851',
      address: 'Rybná 716/24, Staré Město, 11000 Praha 1',
      city: 'Praha',
    });
    expect(filled).toMatchObject({
      company_name: 'ICONIC POINT s.r.o.', ico: '17795851', dic: 'CZ17795851',
      address: 'Rybná 716/24, Staré Město, 11000 Praha 1', city: 'Praha',
      website: initial.website, industry: initial.industry, contact_person: initial.contact_person,
      contact_email: initial.contact_email, contact_phone: initial.contact_phone,
    });
    filled.company_name = 'Ručně upravený název';
    expect(filled.company_name).toBe('Ručně upravený název');
  });

  test('Edge Function znovu používá existující helper a vyžaduje sales_leads.manage', () => {
    expect(edgeFunction).toContain('from "../_shared/companyRegistryEnrich.ts"');
    expect(edgeFunction).toContain('await aresByIco(ico)');
    expect(edgeFunction).toContain('supabaseAdmin.auth.getUser');
    expect(edgeFunction).toContain('check_key: "sales_leads.manage"');
    expect(edgeFunction).toContain('access_denied_sales_leads_manage_only');
  });

  test('neexistující firma vrací přesně požadovanou hlášku', () => {
    expect(SALES_LEAD_ARES_NOT_FOUND).toBe('Firma nebyla v ARES nalezena');
    expect(edgeFunction).toContain('message: "Firma nebyla v ARES nalezena"');
  });

  test('lookup nic neukládá a formulář ukládá až přes existující RPC', () => {
    expect(edgeFunction).not.toMatch(/\.from\("sales_leads"\).*\.(insert|update|upsert)/s);
    expect(addDialog).toContain("rpc('sales_lead_create'");
    expect(addDialog).toContain('p_address: form.address.trim() || null');
    expect(addDialog.indexOf('htmlFor="sl-ico"')).toBeLessThan(addDialog.indexOf('htmlFor="sl-company_name"'));
  });

  test('migrace zachovává RLS a rozšiřuje create i update RPC o adresu', () => {
    expect(migration).toContain('ADD COLUMN address text');
    expect(migration).toContain('CREATE FUNCTION public.sales_lead_create');
    expect(migration).toContain('CREATE FUNCTION public.sales_lead_update_fields');
    expect(migration).toContain('p_address text DEFAULT NULL');
    expect(migration).toContain("has_admin_permission('sales_leads.manage'");
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.sales_lead_create');
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  test('adresa je dostupná v přidání, editaci i detailu leadu', () => {
    expect(addDialog).toContain('id="sl-address"');
    expect(detail).toContain('id="e-address"');
    expect(detail).toContain('<ReadRow label="Adresa" value={lead.address} />');
    expect(detail).toContain('p_address: form.address.trim() || null');
  });

  test('staging: admin načte ARES data a může je před uložením ručně upravit', async ({ page }) => {
    test.skip(!stagingReady, 'Živý test se spouští pouze proti stagingu s E2E admin účtem.');
    test.setTimeout(60_000);

    await loginViaUI(page, liveAdminEmail, liveAdminPassword);
    await page.goto('/admin/sales-leads');
    await page.getByRole('button', { name: 'Přidat firmu', exact: true }).first().click();

    const ico = page.getByTestId('sl-ico');
    await ico.fill('123');
    await page.getByTestId('sl-ares-lookup').click();
    await expect(page.getByRole('alert')).toHaveText(SALES_LEAD_ICO_ERROR);

    await ico.fill('99999999');
    await page.getByTestId('sl-ares-lookup').click();
    await expect(page.getByRole('alert')).toHaveText(SALES_LEAD_ARES_NOT_FOUND);

    await ico.fill('17795851');
    await page.getByTestId('sl-ares-lookup').click();
    await expect(page.getByTestId('sl-company-name')).toHaveValue('iCONIC POINT s.r.o.');
    await expect(page.locator('#sl-dic')).toHaveValue('CZ17795851');
    await expect(page.getByTestId('sl-address')).toHaveValue('Na Folimance 2155/15, Vinohrady, 12000 Praha 2');
    await expect(page.locator('#sl-city')).toHaveValue('Praha');

    await page.getByTestId('sl-company-name').fill('Ručně upravený název');
    await page.getByTestId('sl-address').fill('Ručně upravená adresa');
    await expect(page.getByTestId('sl-company-name')).toHaveValue('Ručně upravený název');
    await expect(page.getByTestId('sl-address')).toHaveValue('Ručně upravená adresa');
  });
});
