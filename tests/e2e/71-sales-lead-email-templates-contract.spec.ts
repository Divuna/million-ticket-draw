import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  renderSalesLeadEmailTemplate,
  salesLeadEmailTemplateSaveErrorMessage,
  validateSalesLeadEmailContent,
  validateSalesLeadEmailTemplateDefinition,
} from '../../src/components/admin/sales-leads/salesLeadEmailTemplates';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test.describe('Sales lead email template contracts', () => {
  test('renders only the approved variables and keeps missing values unresolved', () => {
    const rendered = renderSalesLeadEmailTemplate(
      {
        subject: 'Nabídka pro {{company_name}}',
        body: 'Dobrý den {{contact_person}}, město {{city}}. {{website}}',
      },
      { company_name: 'OneMil', contact_person: 'Pavel', city: null, website: 'https://onemil.cz' },
    );
    expect(rendered.subject).toBe('Nabídka pro OneMil');
    expect(rendered.body).toContain('Dobrý den Pavel');
    expect(rendered.body).toContain('{{city}}');
    expect(rendered.unresolved).toEqual(['{{city}}']);
  });

  test('blocks unresolved variables while opt-out text remains optional', () => {
    expect(validateSalesLeadEmailContent('reply', 'Re: {{company_name}}', 'Děkuji.')).toContain(
      'Doplňte nevyřešené proměnné: {{company_name}}.',
    );
    expect(validateSalesLeadEmailContent('initial', 'Dobrý den', 'Text')).toEqual([]);
    expect(validateSalesLeadEmailContent('follow_up', 'Připomenutí', 'Text')).toEqual([]);
  });

  test('template definitions allow approved variables but reject unknown ones', () => {
    expect(validateSalesLeadEmailTemplateDefinition(
      'initial',
      'Nabídka pro {{company_name}}',
      'Dobrý den {{contact_person}}.',
    )).toEqual([]);
    expect(validateSalesLeadEmailTemplateDefinition('reply', 'Re: {{unknown}}', 'Děkuji.')).toContain(
      'Nepodporované proměnné: {{unknown}}.',
    );
  });

  test('latest database function migration removes only the opt-out requirement', () => {
    const migration = read('supabase/migrations/20260716143511_sales_lead_email_template_optional_opt_out.sql');
    expect(migration).not.toContain('v_opt_out');
    expect(migration).not.toContain('opt_out_sentence_required');
    expect(migration).toContain('public.is_superadmin(v_caller)');
    expect(migration).toContain('unsupported_template_variable');
    expect(migration).toContain('sales_lead_email_template_created');
    expect(migration).toContain('sales_lead_email_template_updated');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain('FROM PUBLIC, anon');
    expect(migration).toContain('TO authenticated');
  });

  test('template manager has no mandatory opt-out UI and reports the backend reason', () => {
    const manager = read('src/components/admin/sales-leads/SalesLeadEmailTemplateManager.tsx');
    expect(manager).not.toContain('První e-mail a follow-up musí obsahovat závěrečnou větu pro odhlášení.');
    expect(manager).not.toContain('Vložit povinnou větu');
    expect(manager).toContain('salesLeadEmailTemplateSaveErrorMessage');
    expect(manager).toContain('data?.error');
    expect(manager).toContain('error?.message');
    expect(salesLeadEmailTemplateSaveErrorMessage(undefined, 'access_denied_superadmin_only')).toBe(
      'E-mailové šablony může spravovat pouze superadmin.',
    );
    expect(salesLeadEmailTemplateSaveErrorMessage(undefined, 'unsupported_template_variable')).toBe(
      'Šablona obsahuje nepodporovanou proměnnou.',
    );
    expect(salesLeadEmailTemplateSaveErrorMessage('network_timeout', undefined)).toBe(
      'Šablonu se nepodařilo uložit: network_timeout',
    );
  });

  test('database access is team-readable, superadmin-managed and deactivate-only', () => {
    const migration = read('supabase/migrations/20260713184851_sales_lead_email_templates.sql');
    expect(migration).toContain("has_admin_permission('sales_leads.manage', auth.uid())");
    expect(migration).toContain('public.is_superadmin(v_caller)');
    expect(migration).toContain('GRANT SELECT ON TABLE public.sales_lead_email_templates TO authenticated');
    expect(migration).toContain('sales_lead_email_template_set_active');
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.sales_lead_email_templates/i);
    for (const variable of ['company_name', 'contact_person', 'contact_role', 'city', 'website']) {
      expect(migration).toContain(variable);
    }
  });

  test('pickers are manual and AI assist returns before any persistence', () => {
    const detail = read('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx');
    const panel = read('src/components/admin/sales-leads/LeadCrmPanel.tsx');
    const ai = read('supabase/functions/sales-lead-draft-email/index.ts');
    expect(detail).toContain('Napsat e-mail');
    expect(detail).toContain('Použít šablonu');
    expect(detail).toContain('Personalizovat pro firmu');
    expect(detail).toContain('Vylepšit text');
    expect(panel).toContain('type="follow_up"');
    expect(ai.indexOf('if (assistMode) return jsonResponse')).toBeLessThan(ai.indexOf('.update({'));
    expect(ai).toContain('reply_to_activity_id_required');
  });
});
