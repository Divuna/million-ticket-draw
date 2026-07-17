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

const TEMPLATE_SAVE_ERROR_MESSAGES: Record<string, string> = {
  access_denied_superadmin_only: 'E-mailové šablony může spravovat pouze superadmin.',
  invalid_template: 'Šablona obsahuje neplatné nebo příliš dlouhé údaje.',
  unsupported_template_variable: 'Šablona obsahuje nepodporovanou proměnnou.',
  template_not_found: 'Upravovaná šablona nebyla nalezena.',
  opt_out_sentence_required: 'Databáze stále vyžaduje odhlašovací větu; je nutné aplikovat připravenou migraci.',
};

export const salesLeadEmailTemplateSaveErrorMessage = (
  rpcError: string | undefined,
  responseError: string | undefined,
): string => {
  const reason = responseError || rpcError;
  if (!reason) return 'Šablonu se nepodařilo uložit z neznámého důvodu.';
  return TEMPLATE_SAVE_ERROR_MESSAGES[reason] ?? `Šablonu se nepodařilo uložit: ${reason}`;
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
  _type: SalesLeadEmailTemplateType,
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
  return errors;
};

/** Drafts may be incomplete; sending still uses the strict validator above. */
export const validateSalesLeadEmailDraft = (subject: string, body: string): string[] => {
  const errors: string[] = [];
  if (!subject.trim() && !body.trim()) errors.push('Koncept musí obsahovat předmět nebo text e-mailu.');
  if (subject.trim().length > 300) errors.push('Předmět může mít nejvýše 300 znaků.');
  if (body.trim().length > 20000) errors.push('Text může mít nejvýše 20 000 znaků.');
  const unresolved = unresolvedTemplateVariables(subject, body);
  if (unresolved.length > 0) errors.push(`Doplňte nevyřešené proměnné: ${unresolved.join(', ')}.`);
  return errors;
};

export const validateSalesLeadEmailTemplateDefinition = (
  _type: SalesLeadEmailTemplateType,
  subject: string,
  body: string,
): string[] => {
  const errors: string[] = [];
  if (!subject.trim()) errors.push('Předmět je povinný.');
  if (!body.trim()) errors.push('Text e-mailu je povinný.');
  if (subject.trim().length > 300) errors.push('Předmět může mít nejvýše 300 znaků.');
  if (body.trim().length > 20000) errors.push('Text může mít nejvýše 20 000 znaků.');

  const allowedTokens = new Set<string>(SALES_LEAD_TEMPLATE_VARIABLES.map((variable) => variable.token));
  const unsupported = unresolvedTemplateVariables(subject, body).filter((token) => !allowedTokens.has(token));
  if (unsupported.length > 0) errors.push(`Nepodporované proměnné: ${unsupported.join(', ')}.`);
  return errors;
};
