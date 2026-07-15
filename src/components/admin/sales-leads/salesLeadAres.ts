export const SALES_LEAD_ICO_ERROR = 'IČO musí obsahovat přesně 8 číslic';
export const SALES_LEAD_ARES_NOT_FOUND = 'Firma nebyla v ARES nalezena';

export type SalesLeadAresResult = {
  success: true;
  company_name: string;
  ico: string;
  dic: string | null;
  address: string | null;
  city: string | null;
};

export const isValidSalesLeadIco = (value: string): boolean => /^\d{8}$/.test(value.trim());

/** Doplní pouze autoritativní firemní údaje. Ručně vyplněný kontakt, web a obor zachová. */
export function applyAresResult<T extends Record<string, string>>(
  current: T,
  result: SalesLeadAresResult,
): T {
  return {
    ...current,
    company_name: result.company_name,
    ico: result.ico,
    dic: result.dic ?? '',
    address: result.address ?? '',
    city: result.city ?? '',
  };
}
