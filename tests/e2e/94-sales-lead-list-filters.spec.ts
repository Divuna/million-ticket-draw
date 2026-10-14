import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  ALL_LEAD_FILTER_VALUE,
  EMPTY_LEAD_FILTER_VALUE,
  buildIndustryFilterOptions,
  buildLeadGroupFilterOptions,
  filterSalesLeadList,
} from '../../src/components/admin/sales-leads/salesLeadListFilters';
import type { SalesLeadRow } from '../../src/components/admin/sales-leads/salesLeadsShared';

const makeLead = (overrides: Partial<SalesLeadRow>): SalesLeadRow => ({
  id: crypto.randomUUID(),
  company_name: 'Testovací firma',
  industry: null,
  city: 'Praha',
  status: 'novy',
  contact_email: null,
  updated_at: '2026-07-23T10:00:00.000Z',
  assigned_admin_id: null,
  lead_group: null,
  ...overrides,
});

const allFilters = {
  statuses: null,
  searchTerm: '',
  group: ALL_LEAD_FILTER_VALUE,
  industry: ALL_LEAD_FILTER_VALUE,
};

test.describe('94 — filtry seznamu leadů', () => {
  const pageSource = fs.readFileSync('src/pages/AdminSalesLeads.tsx', 'utf8');
  const discoverySource = fs.readFileSync(
    'src/components/admin/sales-leads/DiscoverLeadsDialog.tsx',
    'utf8',
  );

  test('skupiny načítá z reálného dynamického zdroje a novou skupinu obnoví', () => {
    const options = buildLeadGroupFilterOptions(
      [{ slug: 'reklamni-agentury', label: 'Reklamní agentury' }],
      [],
    );

    expect(options).toEqual([{ value: 'reklamni-agentury', label: 'Reklamní agentury' }]);
    expect(pageSource).toContain(".from('sales_lead_groups')");
    expect(pageSource).toContain('onGroupsChanged={load}');
    expect(discoverySource).toContain('await onGroupsChanged?.()');
  });

  test('při nedostupném číselníku odvodí skupiny z uložených leadů', () => {
    const leads = [
      makeLead({ lead_group: 'eshopy' }),
      makeLead({ lead_group: 'agentury' }),
      makeLead({ lead_group: 'eshopy' }),
    ];

    expect(buildLeadGroupFilterOptions(null, leads)).toEqual([
      { value: 'agentury', label: 'agentury' },
      { value: 'eshopy', label: 'eshopy' },
    ]);
  });

  test('obory odvozuje jen ze skutečných hodnot leadů', () => {
    const leads = [
      makeLead({ industry: 'ecommerce' }),
      makeLead({ industry: 'services' }),
      makeLead({ industry: 'ecommerce' }),
      makeLead({ industry: null }),
    ];

    expect(buildIndustryFilterOptions(leads)).toEqual(['ecommerce', 'services']);
  });

  test('fungují volby Bez skupiny a Bez oboru', () => {
    const noGroup = makeLead({ id: 'no-group', lead_group: null, industry: 'ecommerce' });
    const noIndustry = makeLead({ id: 'no-industry', lead_group: 'eshopy', industry: null });
    const complete = makeLead({ id: 'complete', lead_group: 'eshopy', industry: 'ecommerce' });
    const leads = [noGroup, noIndustry, complete];

    expect(filterSalesLeadList(leads, {
      ...allFilters,
      group: EMPTY_LEAD_FILTER_VALUE,
    }).map((lead) => lead.id)).toEqual(['no-group']);
    expect(filterSalesLeadList(leads, {
      ...allFilters,
      industry: EMPTY_LEAD_FILTER_VALUE,
    }).map((lead) => lead.id)).toEqual(['no-industry']);
  });

  test('skupina a obor fungují současně', () => {
    const expected = makeLead({ id: 'match', lead_group: 'eshopy', industry: 'ecommerce' });
    const leads = [
      expected,
      makeLead({ id: 'wrong-industry', lead_group: 'eshopy', industry: 'services' }),
      makeLead({ id: 'wrong-group', lead_group: 'agentury', industry: 'ecommerce' }),
    ];

    expect(filterSalesLeadList(leads, {
      ...allFilters,
      group: 'eshopy',
      industry: 'ecommerce',
    })).toEqual([expected]);
  });

  test('filtry se skládají se stavovou záložkou a hledáním', () => {
    const expected = makeLead({
      id: 'match',
      company_name: 'Košík specialista',
      status: 'osloveno',
      lead_group: 'eshopy',
      industry: 'ecommerce',
    });
    const leads = [
      expected,
      makeLead({
        id: 'wrong-status',
        company_name: 'Košík nový',
        status: 'novy',
        lead_group: 'eshopy',
        industry: 'ecommerce',
      }),
      makeLead({
        id: 'wrong-name',
        company_name: 'Jiná firma',
        status: 'osloveno',
        lead_group: 'eshopy',
        industry: 'ecommerce',
      }),
    ];

    expect(filterSalesLeadList(leads, {
      statuses: ['osloveno', 'follow_up'],
      searchTerm: 'košík',
      group: 'eshopy',
      industry: 'ecommerce',
    })).toEqual([expected]);
  });

  test('Zrušit filtry vrátí záložku Vše a všechny hodnoty filtrů', () => {
    const resetBlock = pageSource.slice(
      pageSource.indexOf('const resetListFilters'),
      pageSource.indexOf('const hasActiveListFilters'),
    );

    expect(resetBlock).toContain("setActiveTab('all')");
    expect(resetBlock).toContain("setSearchTerm('')");
    expect(resetBlock).toContain('setGroupFilter(ALL_LEAD_FILTER_VALUE)');
    expect(resetBlock).toContain('setIndustryFilter(ALL_LEAD_FILTER_VALUE)');

    const leads = [
      makeLead({ id: 'first', status: 'novy' }),
      makeLead({ id: 'second', status: 'osloveno', lead_group: 'eshopy' }),
    ];
    expect(filterSalesLeadList(leads, allFilters)).toEqual(leads);
  });

  test('ovládání obsahuje všechny požadované volby a český prázdný stav', () => {
    expect(pageSource).toContain('data-testid="sl-group-filter"');
    expect(pageSource).toContain('data-testid="sl-industry-filter"');
    expect(pageSource).toContain('Bez skupiny');
    expect(pageSource).toContain('Bez oboru');
    expect(pageSource).toContain('Všechny');
    expect(pageSource).toContain('Zrušit filtry');
    expect(pageSource).toContain('Žádné leady neodpovídají zvoleným filtrům.');
  });
});
