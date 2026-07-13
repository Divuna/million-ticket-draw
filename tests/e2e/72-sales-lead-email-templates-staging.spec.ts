import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const url = process.env.VITE_SUPABASE_URL ?? '';
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? '';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? '';
const superEmail = process.env.E2E_SUPERADMIN_EMAIL ?? '';
const superPassword = process.env.E2E_SUPERADMIN_PASSWORD ?? '';
const ready = url.includes(STAGING_REF) && Boolean(anon && serviceKey && adminEmail && adminPassword && superEmail && superPassword);

const optOut = 'Pokud si nepřejete být kontaktováni, odpovězte prosím slovem NEKONTAKTOVAT a příště vás nebudeme oslovovat.';
const allTokens = '{{company_name}} | {{contact_person}} | {{contact_role}} | {{city}} | {{website}}';
const runTag = `STAGING-${Date.now()}`;
const names = {
  initial: `E2E ${runTag} – První e-mail`,
  reply: `E2E ${runTag} – Odpověď`,
  followUp: `E2E ${runTag} – Follow-up`,
};
const companies = {
  initial: `E2E ${runTag} Initial s.r.o.`,
  reply: `E2E ${runTag} Reply s.r.o.`,
  followUp: `E2E ${runTag} Follow-up s.r.o.`,
};

function service(): SupabaseClient {
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function userIdByEmail(client: SupabaseClient, email: string): Promise<string> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 1000) break;
  }
  throw new Error(`Staging user not found: ${email}`);
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /Přihlásit se/ }).click();
  await page.waitForURL((current) => !current.pathname.endsWith('/login'), { timeout: 20_000 });
}

async function resetSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
}

async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function openLead(page: Page, company: string): Promise<void> {
  await page.goto('/admin/sales-leads');
  await page.getByPlaceholder(/Hledat název/).fill(company);
  const row = page.getByRole('row').filter({ hasText: company });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Detail' }).click();
  await expect(page.getByTestId('sales-lead-crm-workspace')).toBeVisible();
}

async function closeLead(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sales-lead-crm-workspace')).toBeHidden();
}

async function createTemplate(
  page: Page,
  type: 'První e-mail' | 'Odpověď' | 'Follow-up',
  name: string,
  subject: string,
  body: string,
): Promise<void> {
  const manager = page.getByTestId('sales-lead-template-manager');
  await manager.getByLabel('Název').fill(name);
  await manager.getByRole('combobox').first().click();
  await page.getByRole('option', { name: type, exact: true }).click();
  await manager.getByLabel('Předmět').fill(subject);
  await manager.getByLabel('Text šablony').fill(body);
  await manager.getByRole('button', { name: 'Vytvořit šablonu' }).click();
  await expect(manager.getByText(name, { exact: true })).toBeVisible();
}

test.describe.serial('Sales lead email templates – real staging acceptance', () => {
  test.skip(!ready, 'staging credentials and service role are required');

  let admin: SupabaseClient;
  let adminId = '';
  let superId = '';
  let originalPermissions: Array<{ permission_key: string; granted_by: string | null }> = [];
  const leadIds: string[] = [];
  const templateIds: string[] = [];

  test.beforeAll(async () => {
    admin = service();
    adminId = await userIdByEmail(admin, adminEmail);
    superId = await userIdByEmail(admin, superEmail);

    const { data: permissions, error: permissionsError } = await admin
      .from('admin_permissions')
      .select('permission_key,granted_by')
      .eq('user_id', adminId);
    if (permissionsError) throw permissionsError;
    originalPermissions = (permissions ?? []) as Array<{ permission_key: string; granted_by: string | null }>;
    if (!originalPermissions.some((row) => row.permission_key === 'sales_leads.manage')) {
      const { error } = await admin.from('admin_permissions').insert({
        user_id: adminId,
        permission_key: 'sales_leads.manage',
        granted_by: superId,
      });
      if (error) throw error;
    }

    const common = {
      industry: 'retail',
      city: 'Brno',
      contact_person: 'Jana Nováková',
      contact_role: 'CEO',
      email_verified_by_admin: true,
      do_not_contact: false,
      source: 'staging_e2e',
      created_by: superId,
    };
    const { data: leads, error: leadError } = await admin.from('sales_leads').insert([
      { ...common, company_name: companies.initial, status: 'priprava', ico: '98100001', dic: 'CZ98100001', website: 'https://initial.e2e-template.example', website_domain: 'initial.e2e-template.example', contact_email: 'initial@e2e-template.example' },
      { ...common, company_name: companies.reply, status: 'odpovedel', ico: '98100002', dic: 'CZ98100002', website: 'https://reply.e2e-template.example', website_domain: 'reply.e2e-template.example', contact_email: 'reply@e2e-template.example' },
      { ...common, company_name: companies.followUp, status: 'follow_up', ico: '98100003', dic: 'CZ98100003', website: 'https://follow-up.e2e-template.example', website_domain: 'follow-up.e2e-template.example', contact_email: 'follow-up@e2e-template.example' },
    ]).select('id,company_name');
    if (leadError) throw leadError;
    for (const lead of leads ?? []) leadIds.push(lead.id);
    const byName = new Map((leads ?? []).map((lead) => [lead.company_name, lead.id]));
    const { error: activityError } = await admin.from('sales_lead_activities').insert([
      {
        lead_id: byName.get(companies.reply), activity_type: 'reply_received', direction: 'inbound',
        subject: 'Re: nabídka OneMil', body_snapshot: 'Dobrý den, prosím pošlete více informací.',
        metadata: { staging_e2e: true },
      },
      {
        lead_id: byName.get(companies.followUp), activity_type: 'email_sent', direction: 'outbound',
        subject: 'Nabídka OneMil', body_snapshot: `Dobrý den, původní stagingový e-mail.\n\n${optOut}`,
        metadata: { staging_e2e: true, to: 'crm-template-e2e@example.invalid' },
      },
    ]);
    if (activityError) throw activityError;
  });

  test.afterAll(async () => {
    const cleanup = admin ?? service();
    if (templateIds.length) {
      await cleanup.from('sales_lead_email_templates').update({ is_active: false }).in('id', templateIds);
    }
    if (leadIds.length) await cleanup.from('sales_leads').delete().in('id', leadIds);
    if (adminId) {
      await cleanup.from('admin_permissions').delete().eq('user_id', adminId);
      if (originalPermissions.length) {
        await cleanup.from('admin_permissions').insert(originalPermissions.map((row) => ({
          user_id: adminId,
          permission_key: row.permission_key,
          granted_by: row.granted_by ?? superId,
        })));
      }
    }
  });

  test('creates, uses, validates, assists and deactivates templates without sending email', async ({ page }, testInfo) => {
    const forbiddenCalls: string[] = [];
    page.on('request', (request) => {
      if (/\/functions\/v1\/send-sales-lead-(email|reply|follow-up)/.test(request.url())) forbiddenCalls.push(request.url());
    });

    await login(page, superEmail, superPassword);
    await page.goto('/admin/sales-leads');
    await page.getByTestId('sl-template-manager-btn').click();
    await createTemplate(page, 'První e-mail', names.initial, `OneMil pro {{company_name}} v {{city}}`, `Dobrý den {{contact_person}},\n\nobracím se na vás jako {{contact_role}} ve společnosti {{company_name}}. Web: {{website}}, město: {{city}}.\n\n${optOut}`);
    await createTemplate(page, 'Odpověď', names.reply, `Re: {{company_name}} – {{contact_person}}`, `Dobrý den {{contact_person}}, děkuji za odpověď. Evidujeme vás jako {{contact_role}} pro {{company_name}} v {{city}} ({{website}}).`);
    await createTemplate(page, 'Follow-up', names.followUp, `Připomenutí pro {{company_name}}`, `Dobrý den {{contact_person}}, připomínám nabídku pro {{company_name}}, {{contact_role}}, {{city}}, {{website}}.\n\n${optOut}`);
    await shot(page, testInfo, '01-sprava-sablon');

    const { data: created, error: createdError } = await admin.from('sales_lead_email_templates')
      .select('id,name,is_active').in('name', Object.values(names));
    if (createdError) throw createdError;
    expect(created).toHaveLength(3);
    expect(created?.every((row) => row.is_active)).toBe(true);
    templateIds.push(...(created ?? []).map((row) => row.id));

    await resetSession(page);
    await login(page, adminEmail, adminPassword);
    await page.goto('/admin/sales-leads');
    await expect(page.getByTestId('sl-template-manager-btn')).toHaveCount(0);

    const scoped = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await scoped.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
    if (signInError) throw signInError;
    const { data: readable, error: readError } = await scoped.from('sales_lead_email_templates').select('id,name,is_active').in('name', Object.values(names));
    expect(readError).toBeNull();
    expect(readable).toHaveLength(3);
    const { data: denied, error: deniedError } = await scoped.rpc('sales_lead_email_template_set_active', { p_id: templateIds[0], p_is_active: false });
    expect(deniedError).toBeNull();
    expect((denied as { success?: boolean; error?: string })?.success).toBe(false);
    expect((denied as { success?: boolean; error?: string })?.error).toBe('access_denied_superadmin_only');

    await openLead(page, companies.initial);
    const engagement = page.getByTestId('sales-lead-engagement-column');
    await engagement.getByRole('button', { name: /Vybrat šablonu/ }).first().click();
    const initialPicker = page.getByTestId('sales-lead-template-picker-initial');
    await expect(initialPicker.getByText(names.initial, { exact: true })).toBeVisible();
    await shot(page, testInfo, '02-vyber-prvni-email');
    await initialPicker.getByText(names.initial, { exact: true }).locator('..').locator('..').getByRole('button', { name: 'Použít šablonu' }).click();
    await expect(page.locator('#sl-draft-subject')).toHaveValue(`OneMil pro ${companies.initial} v Brno`);
    const initialBody = await page.locator('#sl-draft-body').inputValue();
    for (const value of [companies.initial, 'Jana Nováková', 'CEO', 'Brno', 'https://initial.e2e-template.example']) expect(initialBody).toContain(value);
    expect(initialBody).not.toMatch(/\{\{[^{}]+\}\}/);

    const beforeAssist = await admin.from('sales_leads').select('draft_email_subject,draft_email_body').eq('id', leadIds[0]).single();
    for (const action of ['Personalizovat pro firmu', 'Vylepšit text']) {
      const response = page.waitForResponse((res) => res.url().includes('/functions/v1/sales-lead-draft-email') && res.request().method() === 'POST', { timeout: 30_000 });
      await engagement.getByRole('button', { name: action, exact: true }).click();
      expect((await response).status()).toBe(200);
    }
    const afterAssist = await admin.from('sales_leads').select('draft_email_subject,draft_email_body').eq('id', leadIds[0]).single();
    expect(afterAssist.data).toEqual(beforeAssist.data);

    await closeLead(page);
    await admin.from('sales_leads').update({ contact_role: null }).eq('id', leadIds[0]);
    await openLead(page, companies.initial);
    const engagementMissing = page.getByTestId('sales-lead-engagement-column');
    await engagementMissing.getByRole('button', { name: /Vybrat šablonu/ }).first().click();
    const missingPicker = page.getByTestId('sales-lead-template-picker-initial');
    await missingPicker.getByText(names.initial, { exact: true }).locator('..').locator('..').getByRole('button', { name: 'Použít šablonu' }).click();
    await expect(page.locator('#sl-draft-body')).toHaveValue(/\{\{contact_role\}\}/);
    await expect(engagementMissing.getByText(/Doplňte nevyřešené proměnné/)).toBeVisible();
    await engagementMissing.getByRole('button', { name: 'Uložit koncept' }).click();
    await expect(page.getByText(/Doplňte nevyřešené proměnné/).last()).toBeVisible();
    await expect(engagementMissing.getByRole('button', { name: 'Odeslat e-mail' })).toBeDisabled();
    const stillUnsaved = await admin.from('sales_leads').select('draft_email_subject,draft_email_body').eq('id', leadIds[0]).single();
    expect(stillUnsaved.data).toEqual(beforeAssist.data);
    await admin.from('sales_leads').update({ contact_role: 'CEO' }).eq('id', leadIds[0]);
    await closeLead(page);

    await openLead(page, companies.reply);
    await page.getByTestId('sales-lead-engagement-column').getByRole('button', { name: 'Odpovědět' }).click();
    await page.getByRole('button', { name: 'Vybrat šablonu', exact: true }).last().click();
    const replyPicker = page.getByTestId('sales-lead-template-picker-reply');
    await expect(replyPicker.getByText(names.reply, { exact: true })).toBeVisible();
    await shot(page, testInfo, '03-vyber-odpoved');
    await replyPicker.getByText(names.reply, { exact: true }).locator('..').locator('..').getByRole('button', { name: 'Použít šablonu' }).click();
    await expect(page.locator('#reply-body')).not.toHaveValue(/\{\{[^{}]+\}\}/);
    await expect(page.getByRole('button', { name: 'Odeslat odpověď' })).toBeEnabled();
    await closeLead(page);

    await openLead(page, companies.followUp);
    const next = page.getByTestId('sales-lead-next-column');
    await next.getByRole('button', { name: 'Vybrat šablonu', exact: true }).click();
    const followPicker = page.getByTestId('sales-lead-template-picker-follow_up');
    await expect(followPicker.getByText(names.followUp, { exact: true })).toBeVisible();
    await shot(page, testInfo, '04-vyber-follow-up');
    await followPicker.getByText(names.followUp, { exact: true }).locator('..').locator('..').getByRole('button', { name: 'Použít šablonu' }).click();
    await expect(next.getByRole('button', { name: 'Ručně odeslat follow-up' })).toBeEnabled();
    await closeLead(page);

    await resetSession(page);
    await login(page, superEmail, superPassword);
    await page.goto('/admin/sales-leads');
    await page.getByTestId('sl-template-manager-btn').click();
    const replyCard = page.getByTestId('sales-lead-template-manager').getByText(names.reply, { exact: true }).locator('..').locator('..').locator('..');
    await replyCard.getByRole('button', { name: 'Deaktivovat' }).click();
    await expect(replyCard.getByText('Neaktivní')).toBeVisible();
    const { data: inactive } = await scoped.from('sales_lead_email_templates').select('id').eq('id', templateIds.find((id) => created?.find((row) => row.id === id)?.name === names.reply) ?? '');
    expect(inactive).toHaveLength(0);

    expect(forbiddenCalls, 'No real send Edge Function may be called').toEqual([]);
    expect(allTokens.match(/\{\{/g)).toHaveLength(5);
  });
});
