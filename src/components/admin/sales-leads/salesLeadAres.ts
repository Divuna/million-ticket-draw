export const SALES_LEAD_ICO_ERROR = 'IČO musí obsahovat přesně 8 číslic';
export const SALES_LEAD_ARES_NOT_FOUND = 'Firma nebyla v ARES nalezena';
export const SALES_LEAD_ARES_UNAVAILABLE = 'Údaje se z ARES nepodařilo načíst';

export type SalesLeadAresResult = {
  success: true;
  company_name: string;
  ico: string;
  dic: string | null;
  address: string | null;
  city: string | null;
};

export type SalesLeadAresConflict = {
  field: 'company_name' | 'dic' | 'address' | 'city';
  label: string;
  current: string;
  incoming: string;
};

const ARES_CONFLICT_FIELDS: ReadonlyArray<{
  field: SalesLeadAresConflict['field'];
  label: string;
}> = [
  { field: 'company_name', label: 'Název firmy' },
  { field: 'dic', label: 'DIČ' },
  { field: 'address', label: 'Adresa sídla' },
  { field: 'city', label: 'Město' },
];

export const isValidSalesLeadIco = (value: string): boolean => /^\d{8}$/.test(value.trim());

type AresInvoke = (
  functionName: 'sales-lead-ares-lookup',
  options: { body: { ico: string } },
) => Promise<{ data: unknown; error: unknown }>;

export type SalesLeadAresLookupOutcome =
  | { ok: true; result: SalesLeadAresResult }
  | { ok: false; message: string };

/** Jediná frontendová cesta k existující Edge Function, sdílená přidáním i editací leadu. */
export async function lookupSalesLeadAres(
  invoke: AresInvoke,
  ico: string,
): Promise<SalesLeadAresLookupOutcome> {
  try {
    const { data, error } = await invoke('sales-lead-ares-lookup', { body: { ico } });
    let payload = data as Record<string, unknown> | null;
    if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
      try { payload = await error.context.json() as Record<string, unknown>; } catch { /* response has no JSON */ }
    }
    if (error || payload?.success !== true) {
      return {
        ok: false,
        message: payload?.message === SALES_LEAD_ARES_NOT_FOUND
          ? SALES_LEAD_ARES_NOT_FOUND
          : typeof payload?.message === 'string'
            ? payload.message
            : SALES_LEAD_ARES_UNAVAILABLE,
      };
    }
    return { ok: true, result: payload as SalesLeadAresResult };
  } catch {
    return { ok: false, message: SALES_LEAD_ARES_UNAVAILABLE };
  }
}

/** Doplní pouze dostupné autoritativní údaje. Chybějící ARES hodnoty a ruční kontakt/web/obor zachová. */
export function applyAresResult<T extends Record<string, string>>(
  current: T,
  result: SalesLeadAresResult,
): T {
  return {
    ...current,
    company_name: result.company_name,
    ico: result.ico,
    dic: result.dic ?? current.dic,
    address: result.address ?? current.address,
    city: result.city ?? current.city,
  };
}

/** Vrátí neprázdné ruční hodnoty, které by ARES změnil. Samotný formulář nemění. */
export function getAresConflicts<T extends Record<string, string>>(
  current: T,
  result: SalesLeadAresResult,
): SalesLeadAresConflict[] {
  const incoming = applyAresResult(current, result);
  return ARES_CONFLICT_FIELDS.flatMap(({ field, label }) => {
    const currentValue = current[field].trim();
    const incomingValue = incoming[field].trim();
    if (!currentValue || currentValue === incomingValue) return [];
    return [{ field, label, current: currentValue, incoming: incomingValue }];
  });
}
