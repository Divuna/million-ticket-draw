export type SalesLeadEmailBatchStatus =
  | 'scheduled'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'failed';

export type SalesLeadEmailBatchItemStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'skipped'
  | 'failed'
  | 'cancelled';

export type SalesLeadEmailBatchEligible = {
  eligible: true;
  lead_id: string;
  company_name: string;
  recipient: string;
  email_source: string;
  email_verification_method: 'admin_manual' | 'backend_verified_official_website';
  email_verified_at: string;
  subject: string;
  body_source: string;
  body_text: string;
  body_html?: string;
  template_id: string;
  template_updated_at: string;
};

export type SalesLeadEmailBatchIneligible = {
  eligible?: false;
  lead_id: string;
  company_name?: string | null;
  reason: string;
};

export type SalesLeadEmailBatchPreview = {
  success: boolean;
  error?: string;
  automation_enabled?: boolean;
  daily_limit?: number;
  daily_remaining?: number;
  window_start?: string;
  window_end?: string;
  eligible_count?: number;
  ineligible_count?: number;
  eligible?: SalesLeadEmailBatchEligible[];
  ineligible?: SalesLeadEmailBatchIneligible[];
};

export type SalesLeadEmailBatchCreateResult = {
  success: boolean;
  error?: string;
  batch_id?: string;
  batch_status?: SalesLeadEmailBatchStatus;
  automation_enabled?: boolean;
  scheduled_count?: number;
  skipped_count?: number;
  idempotent_replay?: boolean;
  ineligible?: SalesLeadEmailBatchIneligible[];
};

export type SalesLeadEmailBatchRow = {
  id: string;
  status: SalesLeadEmailBatchStatus;
  template_name_snapshot: string;
  created_at: string;
  scheduled_date: string;
  timezone: string;
  window_start: string;
  window_end: string;
  scheduled_count: number;
  skipped_count: number;
  cancel_reason: string | null;
};

export type SalesLeadEmailBatchItemRow = {
  id: string;
  batch_id: string;
  status: SalesLeadEmailBatchItemStatus;
  scheduled_for: string;
  recipient_snapshot: string;
  subject_snapshot: string;
  company_name_snapshot: string;
};

export type SalesLeadEmailBatchSkipRow = {
  id: string;
  batch_id: string;
  requested_lead_id: string;
  company_name_snapshot: string | null;
  reason: string;
};

export const SALES_LEAD_EMAIL_BATCH_REASON_MESSAGES: Record<string, string> = {
  template_not_found: 'Vybraná šablona nebyla nalezena.',
  template_inactive: 'Vybraná šablona už není aktivní.',
  template_not_initial: 'Vybraná šablona není určena pro první e-mail.',
  lead_not_found: 'Firma už v seznamu leadů neexistuje.',
  initial_email_status_not_allowed: 'Aktuální stav firmy neumožňuje první oslovení.',
  do_not_contact: 'Firma je označena jako Nekontaktovat.',
  existing_partner: 'Firma už je evidovaná jako existující partner.',
  invalid_contact_email: 'Firma nemá platný firemní e-mail.',
  email_not_verified: 'Firemní e-mail není ručně nebo systémově ověřený.',
  email_source_missing: 'U firemního e-mailu chybí přesný veřejný zdroj.',
  email_source_too_long: 'Zdrojová adresa e-mailu je příliš dlouhá.',
  suppressed: 'E-mail nebo jeho doména je na seznamu adres, které se nesmí kontaktovat.',
  initial_email_already_sent: 'První obchodní e-mail už byl na tuto adresu odeslán.',
  duplicate_override_required: 'Kontrola duplicit vyžaduje ruční vyřešení konfliktu.',
  duplicate_guard_failed: 'Bezpečnostní kontrola duplicit se nezdařila.',
  already_in_active_batch: 'Firma nebo její e-mail už je v jiné neukončené dávce.',
  unresolved_template_variables: 'Po personalizaci zůstaly v šabloně nevyřešené proměnné.',
  invalid_subject: 'Výsledný předmět e-mailu je prázdný nebo příliš dlouhý.',
  invalid_body: 'Výsledný text e-mailu je prázdný nebo příliš dlouhý.',
  duplicate_recipient_in_selection: 'Stejný e-mail je ve výběru vícekrát.',
  daily_limit_exceeded: 'Pro zvolený den už není volná denní kapacita.',
  scheduling_window_closed: 'Pro zvolený den už nelze vytvořit bezpečné časové okno.',
  invalid_scheduled_date: 'Zvolené datum je v minulosti nebo není platné.',
  no_eligible_leads: 'Ve výběru není žádná firma, kterou lze bezpečně zařadit.',
  concurrent_enrollment_conflict: 'Během ukládání byla firma souběžně zařazena jinam. Obnovte náhled.',
  idempotency_key_conflict: 'Bezpečnostní klíč už byl použit pro jiný výběr, šablonu nebo datum.',
  automation_must_be_disabled: 'Automatické odesílání není bezpečně vypnuté. Dávku nyní nelze připravit.',
  unexpected_batch_state: 'Server nepotvrdil pozastavenou dávku. Nic nebylo uloženo, zkuste akci znovu.',
  access_denied: 'Nemáte oprávnění spravovat obchodní leady.',
  lead_ids_required: 'Vyberte alespoň jednu firmu.',
  too_many_selected_leads: 'Najednou lze připravit nejvýše 100 vybraných firem.',
  invalid_idempotency_key: 'Bezpečnostní klíč požadavku není platný.',
  batch_limit_exceeded: 'Jedna dávka může obsahovat nejvýše 20 e-mailů.',
  batch_not_found: 'Dávka už neexistuje.',
  batch_not_cancellable: 'Dávku v tomto stavu už nelze zrušit.',
  batch_processing: 'Dávku nelze zrušit, protože se některá položka právě zpracovává.',
  cancel_reason_required: 'Uveďte důvod zrušení v délce 3 až 1000 znaků.',
};

export const salesLeadEmailBatchReasonMessage = (reason: string | null | undefined): string => {
  if (!reason) return 'Neznámý důvod vyřazení.';
  return SALES_LEAD_EMAIL_BATCH_REASON_MESSAGES[reason] ?? `Důvod: ${reason}`;
};

export const SALES_LEAD_EMAIL_BATCH_STATUS_LABELS: Record<SalesLeadEmailBatchStatus, string> = {
  paused: 'Pozastavená — nic se neodesílá',
  scheduled: 'Naplánovaná',
  cancelled: 'Zrušená',
  completed: 'Dokončená',
  failed: 'Selhala',
};

export const SALES_LEAD_EMAIL_BATCH_ITEM_STATUS_LABELS: Record<SalesLeadEmailBatchItemStatus, string> = {
  pending: 'Čeká',
  processing: 'Zpracovává se',
  sent: 'Odesláno',
  skipped: 'Vyřazeno',
  failed: 'Chyba',
  cancelled: 'Zrušeno',
};

export const emailVerificationMethodLabel = (method: string): string => (
  method === 'backend_verified_official_website' ? 'Systémově ověřeno' : 'Ručně ověřeno administrátorem'
);

export const isSafeHttpsUrl = (value: string | null | undefined): boolean => {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export const pragueDateString = (date = new Date()): string => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date);

export const nextIsoDate = (value: string): string => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

export const formatPragueDateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatBatchWindow = (start: string | null | undefined, end: string | null | undefined): string => {
  if (!start || !end) return '—';
  const format = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value.slice(0, 5) : date.toLocaleTimeString('cs-CZ', {
      timeZone: 'Europe/Prague',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  return `${format(start)}–${format(end)} Europe/Prague`;
};
