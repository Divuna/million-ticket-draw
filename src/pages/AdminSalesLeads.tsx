import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Briefcase, Plus, Search, Info, Sparkles } from 'lucide-react';
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  INDUSTRY_OPTIONS,
  leadGroupLabel,
  type SalesLeadRow,
} from '@/components/admin/sales-leads/salesLeadsShared';
import { AddSalesLeadDialog } from '@/components/admin/sales-leads/AddSalesLeadDialog';
import { SalesLeadDetailSheet } from '@/components/admin/sales-leads/SalesLeadDetailSheet';
import { DiscoverLeadsDialog } from '@/components/admin/sales-leads/DiscoverLeadsDialog';

/**
 * Admin modul „Obchod / Leady" — Fáze 3A (ruční přidání, detail, editace, změna stavu).
 * Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§1, §2, §5).
 *
 * Route je chráněná RequirePermission("sales_leads.manage") v App.tsx; data
 * navíc drží RLS (SELECT jen pro držitele oprávnění / superadmina). Veškerý
 * zápis jde přes SECURITY DEFINER RPC (sales_lead_create / _update_fields /
 * _set_status) — žádný přímý client INSERT/UPDATE. Žádné e-maily / AI / Resend.
 *
 * Tabulka sales_leads nemusí v prostředí existovat (migrace se aplikuje
 * samostatně) — chyba SELECTu se řeší tichým prázdným stavem s hláškou.
 */

const INDUSTRY_LABEL = (v: string | null): string =>
  (v && INDUSTRY_OPTIONS.find((o) => o.value === v)?.label) || v || '—';

/** Záložky dle spec §2 — každá mapuje na množinu stavů. */
const TABS: { id: string; label: string; statuses: string[] | null }[] = [
  { id: 'all', label: 'Vše', statuses: null },
  // Fáze 4B — navržené leady ke kontrole člověkem.
  { id: 'proposed', label: 'Návrhy', statuses: ['navrzeny'] },
  { id: 'new', label: 'Nové', statuses: ['novy'] },
  { id: 'prep', label: 'Příprava', statuses: ['priprava', 'schvaleni_ceka'] },
  { id: 'contacted', label: 'Osloveno', statuses: ['osloveno', 'follow_up'] },
  { id: 'talks', label: 'Jednání', statuses: ['odpovedel', 'jednani'] },
  { id: 'converted', label: 'Konvertováno', statuses: ['konvertovan'] },
  { id: 'blocked', label: 'Nekontaktovat', statuses: ['nekontaktovat', 'odmitl'] },
  { id: 'archive', label: 'Archiv', statuses: ['archivovan'] },
];

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
};

const AdminSalesLeads: React.FC = () => {
  const [leads, setLeads] = useState<SalesLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('sales_leads')
        .select('id, company_name, industry, city, status, contact_email, updated_at, assigned_admin_id, lead_group')
        .order('updated_at', { ascending: false });
      if (error) {
        setTableMissing(true);
        setLeads([]);
      } else {
        setTableMissing(false);
        setLeads((data ?? []) as SalesLeadRow[]);
      }
    } catch {
      setTableMissing(true);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = (id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  };

  const summary = useMemo(
    () => ({
      total: leads.length,
      proposed: leads.filter((l) => l.status === 'navrzeny').length,
      toContact: leads.filter((l) => ['novy', 'priprava'].includes(l.status)).length,
      awaitingApproval: leads.filter((l) => l.status === 'schvaleni_ceka').length,
      contacted: leads.filter((l) => ['osloveno', 'follow_up'].includes(l.status)).length,
      replied: leads.filter((l) => ['odpovedel', 'jednani'].includes(l.status)).length,
      converted: leads.filter((l) => l.status === 'konvertovan').length,
      blocked: leads.filter((l) => ['nekontaktovat', 'odmitl'].includes(l.status)).length,
    }),
    [leads],
  );

  const visibleLeads = useMemo(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    const term = searchTerm.trim().toLowerCase();
    return leads.filter((l) => {
      if (tab?.statuses && !tab.statuses.includes(l.status)) return false;
      if (!term) return true;
      return (
        l.company_name.toLowerCase().includes(term) ||
        (l.contact_email ?? '').toLowerCase().includes(term) ||
        (l.city ?? '').toLowerCase().includes(term)
      );
    });
  }, [leads, activeTab, searchTerm]);

  const summaryCards: { label: string; value: number }[] = [
    { label: 'Celkem leadů', value: summary.total },
    { label: 'Návrhy', value: summary.proposed },
    { label: 'K oslovení', value: summary.toContact },
    { label: 'Čeká na schválení', value: summary.awaitingApproval },
    { label: 'Osloveno', value: summary.contacted },
    { label: 'Odpovědělo', value: summary.replied },
    { label: 'Konvertováno', value: summary.converted },
    { label: 'Nekontaktovat', value: summary.blocked },
  ];

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Hlavička */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Briefcase className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Obchod / Leady</h1>
            <p className="text-sm text-muted-foreground">
              Akvizice partnerských firem — evidence, oslovení a historie kontaktu.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDiscoverOpen(true)} data-testid="sl-discover-btn">
            <Sparkles className="h-4 w-4 mr-1.5" aria-hidden />
            Najít nové firmy
          </Button>
          <Button onClick={() => setAddOpen(true)} data-testid="sl-add-company-btn">
            <Plus className="h-4 w-4 mr-1.5" aria-hidden />
            Přidat firmu
          </Button>
        </div>
      </div>

      {tableMissing && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>
            Databáze leadů zatím není v tomto prostředí připravená (migrace Fáze 1 čeká na aplikaci).
            Stránka je připravena a načte data automaticky, jakmile bude databáze dostupná.
          </span>
        </div>
      )}

      {/* Souhrnné karty */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {summaryCards.map((c) => (
          <Card key={c.label} className="bg-card/60">
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className="text-xl font-bold">{loading ? '…' : c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Záložky + vyhledávání */}
      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Seznam leadů</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Hledat název, e-mail, město…"
                className="pl-8"
              />
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-auto flex-wrap justify-start">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="text-xs">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Načítám…</div>
          ) : visibleLeads.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {leads.length === 0
                ? 'Zatím žádné leady. Modul je připravený — první firmy přibudou v další fázi.'
                : 'Žádné leady neodpovídají zvolené záložce nebo hledání.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název firmy</TableHead>
                  <TableHead>Skupina</TableHead>
                  <TableHead>Obor</TableHead>
                  <TableHead>Město</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead>Poslední aktivita</TableHead>
                  <TableHead className="text-right">Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.company_name}</TableCell>
                    <TableCell className="text-muted-foreground">{leadGroupLabel(lead.lead_group)}</TableCell>
                    <TableCell className="text-muted-foreground">{INDUSTRY_LABEL(lead.industry)}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.city ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE_CLASS[lead.status] ?? ''}>
                        {STATUS_LABELS[lead.status] ?? lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(lead.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(lead.id)}>
                        Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddSalesLeadDialog open={addOpen} onOpenChange={setAddOpen} onSuccess={load} />
      <DiscoverLeadsDialog
        open={discoverOpen}
        onOpenChange={setDiscoverOpen}
        onSuccess={() => { setActiveTab('proposed'); load(); }}
      />
      <SalesLeadDetailSheet
        leadId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onMutated={load}
      />
    </div>
  );
};

export default AdminSalesLeads;
