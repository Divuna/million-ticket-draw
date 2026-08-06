// Reakce na tlačítka v obchodním e-mailu („Mám zájem“ / „Nemám zájem“).
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md §24.
//
// Autoritativní data pocházejí ze SECURITY DEFINER RPC
// `sales_lead_response_overview()` — konečný stav response tokenu. Tenhle modul
// drží jen typy a čisté odvozovací funkce, aby je šlo přímo otestovat.
//
// Jeden lead nikdy nespadne do obou skupin: RPC vybírá nejnovější zodpovězený
// token na lead, takže `interested` a `declined` jsou vzájemně výlučné.

/** Řádek záložky „Kontaktovat“ — firma potvrdila zájem o spolupráci. */
export interface InterestedResponseRow {
  lead_id: string;
  company_name: string;
  lead_status: string;
  /** 1 = vysoká priorita (nastavuje ji RPC odpovědi po „Mám zájem“). */
  priority: number | null;
  /** Chybějící údaj je null — nikdy se nedoplňuje falešná hodnota. */
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  responded_at: string | null;
  /** Původní odeslaná dávka, pokud je dostupná. */
  batch_item_id: string | null;
  unread: boolean;
}

/** Řádek přehledu odmítnutí — firma se odhlásila z obchodních nabídek. */
export interface DeclinedResponseRow {
  lead_id: string;
  company_name: string;
  lead_status: string;
  contact_email: string | null;
  responded_at: string | null;
  batch_item_id: string | null;
  do_not_contact: boolean;
  do_not_contact_reason: string | null;
  suppressed: boolean;
  unread: boolean;
}

export interface SalesLeadResponseOverview {
  interested: InterestedResponseRow[];
  declined: DeclinedResponseRow[];
  interestedTotal: number;
  declinedTotal: number;
  /** Nepřečtené reakce „Mám zájem“ — červený počet u záložky Kontaktovat. */
  interestedUnread: number;
  /** Nepřečtená odmítnutí z tlačítka — červený počet u záložky Nekontaktovat. */
  declinedUnread: number;
}

export const EMPTY_RESPONSE_OVERVIEW: SalesLeadResponseOverview = {
  interested: [],
  declined: [],
  interestedTotal: 0,
  declinedTotal: 0,
  interestedUnread: 0,
  declinedUnread: 0,
};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asCount = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

/**
 * Převod syrové odpovědi RPC na typovaný přehled.
 * Chybějící nebo poškozený payload končí prázdným přehledem — administrace se
 * kvůli tomu nesmí rozbít (RPC nemusí být v prostředí ještě aplikovaná).
 */
export function parseResponseOverview(raw: unknown): SalesLeadResponseOverview {
  if (!raw || typeof raw !== 'object') return EMPTY_RESPONSE_OVERVIEW;
  const payload = raw as Record<string, unknown>;
  if (payload.success !== true) return EMPTY_RESPONSE_OVERVIEW;

  const interested = Array.isArray(payload.interested)
    ? (payload.interested as Record<string, unknown>[]).map((row) => ({
      lead_id: String(row.lead_id ?? ''),
      company_name: asString(row.company_name) ?? '—',
      lead_status: String(row.lead_status ?? ''),
      priority: typeof row.priority === 'number' ? row.priority : null,
      contact_person: asString(row.contact_person),
      contact_phone: asString(row.contact_phone),
      contact_email: asString(row.contact_email),
      responded_at: asString(row.responded_at),
      batch_item_id: asString(row.batch_item_id),
      unread: row.unread === true,
    }))
    : [];

  const declined = Array.isArray(payload.declined)
    ? (payload.declined as Record<string, unknown>[]).map((row) => ({
      lead_id: String(row.lead_id ?? ''),
      company_name: asString(row.company_name) ?? '—',
      lead_status: String(row.lead_status ?? ''),
      contact_email: asString(row.contact_email),
      responded_at: asString(row.responded_at),
      batch_item_id: asString(row.batch_item_id),
      do_not_contact: row.do_not_contact === true,
      do_not_contact_reason: asString(row.do_not_contact_reason),
      suppressed: row.suppressed === true,
      unread: row.unread === true,
    }))
    : [];

  return {
    interested,
    declined,
    interestedTotal: asCount(payload.interested_total),
    declinedTotal: asCount(payload.declined_total),
    interestedUnread: asCount(payload.interested_unread),
    declinedUnread: asCount(payload.declined_unread),
  };
}

/**
 * Řazení záložky „Kontaktovat“: 1) nepřečtené, 2) nejnovější reakce, 3) ostatní.
 * RPC už vrací seřazeno; tohle je stabilní pojistka pro klienta (a testy).
 */
export function sortInterestedRows(rows: InterestedResponseRow[]): InterestedResponseRow[] {
  return [...rows].sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    const aTime = a.responded_at ? Date.parse(a.responded_at) : Number.NaN;
    const bTime = b.responded_at ? Date.parse(b.responded_at) : Number.NaN;
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid && bValid && aTime !== bTime) return bTime - aTime;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return a.company_name.localeCompare(b.company_name, 'cs');
  });
}

/** Stejné pořadí i pro přehled odmítnutí. */
export function sortDeclinedRows(rows: DeclinedResponseRow[]): DeclinedResponseRow[] {
  return [...rows].sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    const aTime = a.responded_at ? Date.parse(a.responded_at) : Number.NaN;
    const bTime = b.responded_at ? Date.parse(b.responded_at) : Number.NaN;
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid && bValid && aTime !== bTime) return bTime - aTime;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return a.company_name.localeCompare(b.company_name, 'cs');
  });
}

/** Lead s potvrzeným zájmem má mít vysokou prioritu (RPC nastavuje priority=1). */
export const isHighPriorityInterest = (row: InterestedResponseRow): boolean => row.priority === 1;

/** Chybějící jméno/telefon se zobrazí jako pomlčka, nikdy jako vymyšlená hodnota. */
export const displayOrDash = (value: string | null): string => value ?? '—';

export const RESPONSE_DECLINED_SUMMARY =
  'Firma nemá zájem o spolupráci a odhlásila se z dalších obchodních nabídek.';

export const RESPONSE_INTEREST_SUMMARY = 'Má zájem o spolupráci';
