import type { SalesLeadRow } from './salesLeadsShared';

export const ALL_LEAD_FILTER_VALUE = '__all__';
export const EMPTY_LEAD_FILTER_VALUE = '__empty__';

export type LeadFilterOption = {
  value: string;
  label: string;
};

export type SalesLeadListFilters = {
  statuses: string[] | null;
  searchTerm: string;
  group: string;
  industry: string;
};

type LeadGroupRow = {
  slug?: string | null;
  label?: string | null;
};

const uniqueSorted = (values: string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'cs', { sensitivity: 'base' }));

export const buildLeadGroupFilterOptions = (
  groupRows: LeadGroupRow[] | null,
  leads: SalesLeadRow[],
): LeadFilterOption[] => {
  if (groupRows !== null) {
    return groupRows
      .map((row) => ({
        value: row.slug?.trim() ?? '',
        label: row.label?.trim() ?? '',
      }))
      .filter((row) => row.value && row.label);
  }

  return uniqueSorted(leads.map((lead) => lead.lead_group ?? ''))
    .map((value) => ({ value, label: value }));
};

export const buildIndustryFilterOptions = (leads: SalesLeadRow[]): string[] =>
  uniqueSorted(leads.map((lead) => lead.industry ?? ''));

export const filterSalesLeadList = (
  leads: SalesLeadRow[],
  filters: SalesLeadListFilters,
): SalesLeadRow[] => {
  const term = filters.searchTerm.trim().toLowerCase();

  return leads.filter((lead) => {
    if (filters.statuses && !filters.statuses.includes(lead.status)) return false;
    if (
      filters.group !== ALL_LEAD_FILTER_VALUE
      && (filters.group === EMPTY_LEAD_FILTER_VALUE
        ? Boolean(lead.lead_group)
        : lead.lead_group !== filters.group)
    ) return false;
    if (
      filters.industry !== ALL_LEAD_FILTER_VALUE
      && (filters.industry === EMPTY_LEAD_FILTER_VALUE
        ? Boolean(lead.industry)
        : lead.industry !== filters.industry)
    ) return false;
    if (!term) return true;

    return (
      lead.company_name.toLowerCase().includes(term)
      || (lead.contact_email ?? '').toLowerCase().includes(term)
      || (lead.city ?? '').toLowerCase().includes(term)
    );
  });
};
