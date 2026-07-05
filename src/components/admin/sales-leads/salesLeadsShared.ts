// Sdílené konstanty a pravidla modulu Obchod / Leady (Fáze 2 + 3A).
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§4).
//
// Přechodová logika `isTransitionAllowed` je 1:1 zrcadlo SECURITY DEFINER RPC
// `sales_lead_set_status` (stejné pořadí CASE větví). Frontend jen skrývá
// nepovolené akce — autoritativní kontrola zůstává v RPC.

export type SalesLeadStatus =
  | 'navrzeny'
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
  'navrzeny',
  'novy', 'priprava', 'schvaleni_ceka', 'osloveno', 'follow_up',
  'odpovedel', 'jednani', 'konvertovan', 'odmitl', 'nekontaktovat', 'archivovan',
];

export const STATUS_LABELS: Record<string, string> = {
  navrzeny: 'Navržený',
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
  navrzeny: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
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

/** Marketingové skupiny leadů (§17.2). Musí odpovídat CHECK constraintu v DB. */
export const LEAD_GROUP_OPTIONS: { value: string; label: string }[] = [
  { value: 'e-shopy', label: 'E-shopy' },
  { value: 'auto-moto', label: 'Auto / moto' },
  { value: 'luxusni-zbozi', label: 'Luxusní zboží' },
  { value: 'sport', label: 'Sport' },
  { value: 'cestovani', label: 'Cestování' },
  { value: 'gastronomie', label: 'Gastronomie' },
  { value: 'lokalni-sluzby', label: 'Lokální služby' },
  { value: 'jine', label: 'Jiné' },
];

export const leadGroupLabel = (v: string | null | undefined): string =>
  (v && LEAD_GROUP_OPTIONS.find((o) => o.value === v)?.label) || v || '—';

/** Zdroj nalezení leadu (§17.6). Musí odpovídat CHECK constraintu v DB. */
export const DISCOVERY_SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ai_navrh', label: 'AI návrh' },
  { value: 'verejny_rejstrik', label: 'Veřejný rejstřík' },
  { value: 'shoptet_katalog', label: 'Shoptet katalog' },
  { value: 'web_katalog', label: 'Web katalog' },
  { value: 'doporuceni', label: 'Doporučení' },
  { value: 'rucne', label: 'Ručně' },
];

/** Kvalita leadu 0–3 (§17.5). */
export const LEAD_QUALITY_LABELS: Record<number, string> = {
  0: 'Neohodnoceno',
  1: 'Nízká',
  2: 'Střední',
  3: 'Vysoká',
};

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
  // Fáze 4B: navržený lead smí JEN do novy (lidské schválení). Do odesílacích
  // stavů se rovnou přejít nedá — jen novy/nekontaktovat/archivovan.
  if (current === 'navrzeny') return target === 'novy';
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
  // Fáze 4B — marketingová skupina (návrhy leadů).
  lead_group: string | null;
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
  // AI příprava (Fáze 3B) — jen interní koncepty, nic se neodesílá.
  ai_research_summary: string | null;
  ai_research_at: string | null;
  draft_email_subject: string | null;
  draft_email_body: string | null;
  draft_prepared_by: string | null;
  // Zařazení / discovery (Fáze 4B).
  lead_quality: number | null;
  discovery_source: string | null;
  discovery_meta: Record<string, unknown> | null;
  // Neověřený návrh kontaktu (Fáze 5B) — odděleno od odesílacího contact_email.
  proposed_contact_email: string | null;
  proposed_contact_source_url: string | null;
  proposed_contact_at: string | null;
  proposed_contact_by: string | null;
  proposed_contact_status: 'neovereny' | 'overeny' | 'zamitnuty' | null;
}

/** Popisky stavu návrhu kontaktu (Fáze 5B). */
export const PROPOSED_CONTACT_STATUS_LABELS: Record<string, string> = {
  neovereny: 'Neověřený návrh',
  overeny: 'Ověřeno člověkem',
  zamitnuty: 'Zamítnuto',
};

/** Mapování chybových kódů z RPC / Edge Function na české hlášky. */
export const RPC_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Nemáte oprávnění k této akci.',
  access_denied_sales_leads_manage_only: 'Nemáte oprávnění „Obchodní leady".',
  company_name_required: 'Název firmy je povinný.',
  duplicate: 'Firma s tímto e-mailem, IČO nebo doménou už v evidenci existuje.',
  invalid_input: 'Neplatný vstup (zkontrolujte IČO — 8 číslic, a web — musí začínat https://).',
  lead_not_found: 'Lead nebyl nalezen.',
  status_unchanged: 'Stav se nezměnil.',
  transition_not_allowed: 'Tento přechod stavu není povolen.',
  reason_required: 'U této změny stavu je nutné uvést důvod.',
  ai_not_configured: 'AI zatím není v tomto prostředí nakonfigurovaná.',
  ai_request_failed: 'AI požadavek se nezdařil, zkuste to znovu.',
  ai_empty_response: 'AI nevrátila žádný obsah, zkuste to znovu.',
  ai_invalid_format: 'AI vrátila neočekávaný formát, zkuste to znovu.',
  forbidden_wording_detected: 'Návrh obsahoval nepovolené výrazy a nebyl uložen.',
  // Fáze 3C — odeslání konceptu člověkem.
  email_not_configured: 'Odesílání e-mailů zatím není v tomto prostředí nakonfigurované.',
  no_draft: 'Lead nemá uložený návrh e-mailu — nejdřív připravte a uložte koncept.',
  missing_contact_email: 'Lead nemá vyplněný kontaktní e-mail.',
  do_not_contact: 'Lead je označený „Nekontaktovat" — e-mail nelze odeslat.',
  suppressed: 'Tento e-mail / doména je na seznamu „Nekontaktovat".',
  email_send_failed: 'Odeslání e-mailu se nezdařilo, zkuste to znovu.',
  // Fáze 5A — automatické vyhledávání firem.
  invalid_lead_group: 'Vyberte platnou skupinu firem.',
  // Fáze 5B — dohledání / schválení kontaktu.
  invalid_email: 'Navržený e-mail nemá platný formát.',
  source_url_required: 'Chybí zdrojová URL, odkud byl e-mail nalezen.',
  no_pending_contact: 'Lead nemá neověřený návrh e-mailu ke schválení.',
  invalid_decision: 'Neplatné rozhodnutí.',
  propose_failed: 'Uložení návrhu kontaktu se nezdařilo.',
  ai_bad_response: 'AI vrátila neočekávaný formát, zkuste to znovu.',
};

export const rpcErrorMessage = (code: string | undefined): string =>
  (code && RPC_ERROR_MESSAGES[code]) || 'Operace se nezdařila.';
