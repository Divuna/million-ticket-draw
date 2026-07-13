export type SalesLeadEmailTemplateType = 'initial' | 'reply' | 'follow_up';

export type SalesLeadEmailTemplate = {
  id: string;
  name: string;
  template_type: SalesLeadEmailTemplateType;
  subject: string;
  body: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
export type SalesLeadTemplateContext = {
  company_name?: string | null;
  contact_person?: string | null;
  contact_role?: string | null;
  city?: string | null;
  website?: string | null;
};

export const OPT_OUT_SENTENCE =
  'Pokud si nepřejete být kontaktováni, odpovězte prosím slovem NEKONTAKTOVAT a příště vás nebudeme oslovovat.';

export const SALES_LEAD_TEMPLATE_VARIABLES = [
  { key: 'company_name', token: '{{company_name}}', label: 'Název firmy' },
  { key: 'contact_person', token: '{{contact_person}}', label: 'Kontaktní osoba' },
  { key: 'contact_role', token: '{{contact_role}}', label: 'Role kontaktu' },
  { key: 'city', token: '{{city}}', label: 'Město' },
  { key: 'website', token: '{{website}}', label: 'Web' },
] as const;

export const TEMPLATE_TYPE_LABELS: Record<SalesLeadEmailTemplateType, string> = {
  initial: 'První e-mail',
  reply: 'Odpověď',
  follow_up: 'Follow-up',
};

const tokenPattern = /\{\{[^{}]+\}\}/g;

export const unresolvedTemplateVariables = (subject: string, body: string): string[] =>
  [...new Set(`${subject}\n${body}`.match(tokenPattern) ?? [])];

export const renderSalesLeadEmailTemplate = (
  template: Pick<SalesLeadEmailTemplate, 'subject' | 'body'>,
  context: SalesLeadTemplateContext,
): { subject: string; body: string; unresolved: string[] } => {
  const replace = (value: string) => {
    let rendered = value;
    for (const variable of SALES_LEAD_TEMPLATE_VARIABLES) {
      const replacement = context[variable.key]?.trim();
      if (replacement) rendered = rendered.replaceAll(variable.token, replacement);
    }
    return rendered;
  };
  const subject = replace(template.subject);
  const body = replace(template.body);
  return { subject, body, unresolved: unresolvedTemplateVariables(subject, body) };
};

export const validateSalesLeadEmailContent = (
  type: SalesLeadEmailTemplateType,
  subject: string,
  body: string,
): string[] => {
  const errors: string[] = [];
  if (!subject.trim()) errors.push('Předmět je povinný.');
  if (!body.trim()) errors.push('Text e-mailu je povinný.');
  if (subject.trim().length > 300) errors.push('Předmět může mít nejvýše 300 znaků.');
  if (body.trim().length > 20000) errors.push('Text může mít nejvýše 20 000 znaků.');
  const unresolved = unresolvedTemplateVariables(subject, body);
  if (unresolved.length > 0) errors.push(`Doplňte nevyřešené proměnné: ${unresolved.join(', ')}.`);
  if ((type === 'initial' || type === 'follow_up') && !body.includes(OPT_OUT_SENTENCE)) {
    errors.push('Chybí povinná závěrečná věta pro odhlášení.');
  }
  return errors;
};
