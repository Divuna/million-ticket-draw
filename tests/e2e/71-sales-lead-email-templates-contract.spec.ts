import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  OPT_OUT_SENTENCE,
  renderSalesLeadEmailTemplate,
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

  test('blocks unresolved variables and missing opt-out before save or send', () => {
    expect(validateSalesLeadEmailContent('reply', 'Re: {{company_name}}', 'Děkuji.')).toContain(
      'Doplňte nevyřešené proměnné: {{company_name}}.',
    );
    expect(validateSalesLeadEmailContent('initial', 'Dobrý den', 'Text')).toContain(
      'Chybí povinná závěrečná věta pro odhlášení.',
    );
    expect(validateSalesLeadEmailContent('follow_up', 'Připomenutí', `Text\n\n${OPT_OUT_SENTENCE}`)).toEqual([]);
  });

  test('template definitions allow approved variables but reject unknown ones', () => {
    expect(validateSalesLeadEmailTemplateDefinition(
      'initial',
      'Nabídka pro {{company_name}}',
      `Dobrý den {{contact_person}}.\n\n${OPT_OUT_SENTENCE}`,
    )).toEqual([]);
    expect(validateSalesLeadEmailTemplateDefinition('reply', 'Re: {{unknown}}', 'Děkuji.')).toContain(
      'Nepodporované proměnné: {{unknown}}.',
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
    expect(detail).toContain('Vybrat šablonu');
    expect(detail).toContain('Personalizovat pro firmu');
    expect(detail).toContain('Vylepšit text');
    expect(panel).toContain('type="follow_up"');
    expect(ai.indexOf('if (assistMode) return jsonResponse')).toBeLessThan(ai.indexOf('.update({'));
    expect(ai).toContain('reply_to_activity_id_required');
  });
});
