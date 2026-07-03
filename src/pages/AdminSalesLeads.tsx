import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Briefcase, Plus, Search, Info } from 'lucide-react';

/**
 * Admin modul „Obchod / Leady" — Fáze 2 (frontend základ).
 * Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§1, §2).
 *
 * Fáze 2 je read-only skeleton: záložky, souhrnné karty, tabulka a prázdný
 * stav. Žádné akce (create/edit/status/AI/e-mail) — ty přijdou ve Fázi 3/4.
 * Route je chráněná RequirePermission("sales_leads.manage") v App.tsx;
 * data navíc drží RLS (SELECT jen pro držitele oprávnění / superadmina).
 *
 * Tabulka sales_leads nemusí v prostředí existovat (migrace Fáze 1 se
 * aplikuje samostatně po schválení) — chyba SELECTu se řeší tichým prázdným
 * stavem s informační hláškou, stejný defenzivní vzor jako useAdminPermissions.
 */

interface SalesLeadRow {
  id: string;
  company_name: string;
  industry: string | null;
  city: string | null;
  status: string;
  contact_email: string | null;
  updated_at: string | null;
  assigned_admin_id: string | null;
}

/** České labely stavů (§4). */
const STATUS_LABELS: Record<string, string> = {
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

const STATUS_BADGE_CLASS: Record<string, string> = {
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

/** Záložky dle spec §2 — každá mapuje na množinu stavů. */
const TABS: { id: string; label: string; statuses: string[] | null }[] = [
  { id: 'all', label: 'Vše', statuses: null },
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Typy klienta tabulku ještě neznají (migrace Fáze 1 čeká na apply).
        const { data, error } = await (supabase as any)
          .from('sales_leads')
          .select('id, company_name, industry, city, status, contact_email, updated_at, assigned_admin_id')
          .order('updated_at', { ascending: false });
        if (cancelled) return;
        if (error) {
          setTableMissing(true);
          setLeads([]);
        } else {
          setTableMissing(false);
          setLeads((data ?? []) as SalesLeadRow[]);
        }
      } catch {
        if (!cancelled) {
          setTableMissing(true);
          setLeads([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(
    () => ({
      total: leads.length,
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
        {/* Fáze 2: akce zatím neaktivní — vytvoření leadu přijde v další fázi. */}
        <Button disabled title="Připravujeme — akce budou dostupné v další fázi">
          <Plus className="h-4 w-4 mr-1.5" aria-hidden />
          Přidat firmu
        </Button>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
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
                    <TableCell className="text-muted-foreground">{lead.industry ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{lead.city ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE_CLASS[lead.status] ?? ''}>
                        {STATUS_LABELS[lead.status] ?? lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(lead.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" disabled title="Detail přijde v další fázi">
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
    </div>
  );
};

export default AdminSalesLeads;
