// Sdílené konstanty a pravidla modulu Obchod / Leady (Fáze 2 + 3A).
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§4).
//
// Přechodová logika `isTransitionAllowed` je 1:1 zrcadlo SECURITY DEFINER RPC
// `sales_lead_set_status` (stejné pořadí CASE větví). Frontend jen skrývá
// nepovolené akce — autoritativní kontrola zůstává v RPC.

export type SalesLeadStatus =
  | 'novy'
  | 'priprava'
  | 'schvaleni_ceka'
  | 'osloveno'
  | 'follow_up'
  | 'odpovedel'
  | 'jednani'
  | 'konvertovan'
  | 'odmitl'
  | 'nekontaktovat'
  | 'archivovan';

export const SALES_LEAD_STATUSES: SalesLeadStatus[] = [
  'novy', 'priprava', 'schvaleni_ceka', 'osloveno', 'follow_up',
  'odpovedel', 'jednani', 'konvertovan', 'odmitl', 'nekontaktovat', 'archivovan',
];

export const STATUS_LABELS: Record<string, string> = {
  novy: 'Nový',
  priprava: 'Příprava',
  schvaleni_ceka: 'Čeká na schválení',
  osloveno: 'Osloveno',
  follow_up: 'Follow-up',
  odpovedel: 'Odpověděl',
  jednani: 'Jednání',
  konvertovan: 'Konvertován',
  odmitl: 'Odmítl',
  nekontaktovat: 'Nekontaktovat',
  archivovan: 'Archivován',
};

export const STATUS_BADGE_CLASS: Record<string, string> = {
  novy: 'bg-muted text-foreground',
  priprava: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  schvaleni_ceka: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  osloveno: 'bg-primary/15 text-primary border-primary/30',
  follow_up: 'bg-primary/15 text-primary border-primary/30',
  odpovedel: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  jednani: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  konvertovan: 'bg-emerald-600/20 text-emerald-500 border-emerald-500/40',
  odmitl: 'bg-destructive/15 text-destructive border-destructive/30',
  nekontaktovat: 'bg-destructive/15 text-destructive border-destructive/30',
  archivovan: 'bg-muted text-muted-foreground',
};

/** Číselník oborů (§3). */
export const INDUSTRY_OPTIONS: { value: string; label: string }[] = [
  { value: 'e-shop', label: 'E-shop' },
  { value: 'restaurace', label: 'Restaurace' },
  { value: 'cerpaci-stanice', label: 'Čerpací stanice' },
  { value: 'maloobchod', label: 'Maloobchod' },
  { value: 'sluzby', label: 'Služby' },
  { value: 'jine', label: 'Jiné' },
];

/**
 * 1:1 zrcadlo CASE větví v RPC sales_lead_set_status (pořadí větví je závazné).
 * Vrací true, pokud je přechod current → target povolen.
 */
export function isTransitionAllowed(
  current: string,
  target: string,
  isSuperAdmin: boolean,
): boolean {
  if (target === current) return false; // status_unchanged
  if (target === 'nekontaktovat') return current !== 'nekontaktovat';
  if (current === 'nekontaktovat') return isSuperAdmin && (target === 'priprava' || target === 'archivovan');
  if (target === 'archivovan') return current !== 'konvertovan';
  if (current === 'konvertovan') return false;
  if (current === 'odmitl') return target === 'priprava';
  if (current === 'novy') return target === 'priprava';
  if (current === 'priprava') return target === 'schvaleni_ceka';
  if (current === 'schvaleni_ceka') return target === 'priprava' || target === 'osloveno';
  if (current === 'osloveno') return target === 'follow_up' || target === 'odpovedel';
  if (current === 'follow_up') return target === 'odpovedel';
  if (current === 'odpovedel') return target === 'jednani' || target === 'odmitl';
  if (current === 'jednani') return target === 'konvertovan' || target === 'odmitl';
  if (current === 'archivovan') return target === 'priprava';
  return false;
}

/** Seznam povolených cílových stavů z daného aktuálního stavu. */
export function allowedTargets(current: string, isSuperAdmin: boolean): SalesLeadStatus[] {
  return SALES_LEAD_STATUSES.filter((t) => isTransitionAllowed(current, t, isSuperAdmin));
}

/**
 * Zrcadlí guard v RPC: důvod je povinný, pokud cílový nebo výchozí stav je
 * citlivý (nekontaktovat / odmitl / archivovan-výchozí).
 */
export function isReasonRequired(current: string, target: string): boolean {
  return (
    target === 'nekontaktovat' ||
    target === 'odmitl' ||
    current === 'nekontaktovat' ||
    current === 'odmitl' ||
    current === 'archivovan'
  );
}

/** Řádek seznamu leadů. */
export interface SalesLeadRow {
  id: string;
  company_name: string;
  industry: string | null;
  city: string | null;
  status: string;
  contact_email: string | null;
  updated_at: string | null;
  assigned_admin_id: string | null;
}

/** Plný detail leadu (editovatelná pole + audit meta). */
export interface SalesLeadDetail extends SalesLeadRow {
  ico: string | null;
  dic: string | null;
  website: string | null;
  company_size: string | null;
  contact_person: string | null;
  contact_role: string | null;
  contact_phone: string | null;
  email_source: string | null;
  email_verified_by_admin: boolean;
  do_not_contact: boolean;
  do_not_contact_reason: string | null;
  notes: string | null;
  created_at: string | null;
}

/** Mapování chybových kódů z RPC na české hlášky. */
export const RPC_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Nemáte oprávnění k této akci.',
  company_name_required: 'Název firmy je povinný.',
  duplicate: 'Firma s tímto e-mailem, IČO nebo doménou už v evidenci existuje.',
  invalid_input: 'Neplatný vstup (zkontrolujte IČO — 8 číslic, a web — musí začínat https://).',
  lead_not_found: 'Lead nebyl nalezen.',
  status_unchanged: 'Stav se nezměnil.',
  transition_not_allowed: 'Tento přechod stavu není povolen.',
  reason_required: 'U této změny stavu je nutné uvést důvod.',
};

export const rpcErrorMessage = (code: string | undefined): string =>
  (code && RPC_ERROR_MESSAGES[code]) || 'Operace se nezdařila.';
