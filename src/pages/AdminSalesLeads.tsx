import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Briefcase, Plus, Search, Info, Sparkles, Trash2 } from 'lucide-react';
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
 * Admin modul „Obchod / Leady" — Fáze 3A (ruční přidání, detail, editace, změna stavu)
 * + Fáze 6 (jednotlivé i hromadné mazání leadů).
 * Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§1, §2, §5, §17.11).
 *
 * Route je chráněná RequirePermission("sales_leads.manage") v App.tsx; data
 * navíc drží RLS (SELECT jen pro držitele oprávnění / superadmina). Veškerý
 * zápis jde přes SECURITY DEFINER RPC (sales_lead_create / _update_fields /
 * _set_status / _delete / _delete_bulk) — žádný přímý client INSERT/UPDATE/
 * DELETE. Žádné e-maily / AI / Resend. Mazání se týká jen `sales_leads`
 * (a jejích cascade-navázaných aktivit/historie) — nikdy wallets/payments/
 * contests/tickets/winners/Stripe/buy_ticket_atomic.
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
  // `odpovedel` a `jednani` jsou oddělené fáze — nesmí se počítat dvakrát.
  { id: 'replied', label: 'Odpovědělo', statuses: ['odpovedel'] },
  { id: 'talks', label: 'Jednání', statuses: ['jednani'] },
  { id: 'converted', label: 'Spolupráce', statuses: ['konvertovan'] },
  { id: 'not-converted', label: 'Bez spolupráce', statuses: ['odmitl'] },
  { id: 'blocked', label: 'Nekontaktovat', statuses: ['nekontaktovat'] },
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteOneId, setDeleteOneId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Nepřečtené příchozí odpovědi: množina leadů s ≥1 nepřečtenou + celkový počet.
  const [unreadLeadIds, setUnreadLeadIds] = useState<Set<string>>(new Set());
  const [unreadTotal, setUnreadTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, unreadRes] = await Promise.all([
        (supabase as any)
          .from('sales_leads')
          .select('id, company_name, industry, city, status, contact_email, updated_at, assigned_admin_id, lead_group')
          .order('updated_at', { ascending: false }),
        // Nepřečtené odpovědi napříč všemi leady (RLS pustí jen držitele oprávnění).
        (supabase as any)
          .from('sales_lead_activities')
          .select('lead_id')
          .eq('activity_type', 'reply_received')
          .is('read_at', null),
      ]);
      if (leadsRes.error) {
        setTableMissing(true);
        setLeads([]);
      } else {
        setTableMissing(false);
        setLeads((leadsRes.data ?? []) as SalesLeadRow[]);
      }
      // Nepřečtené jsou best-effort — chyba (např. chybějící sloupec před migrací)
      // jen znamená „žádná upozornění", nikdy nerozbije seznam.
      const unreadRows = (unreadRes.error ? [] : unreadRes.data ?? []) as { lead_id: string }[];
      setUnreadLeadIds(new Set(unreadRows.map((r) => r.lead_id)));
      setUnreadTotal(unreadRows.length);
    } catch {
      setTableMissing(true);
      setLeads([]);
      setUnreadLeadIds(new Set());
      setUnreadTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Obnovení bez pollingu: stav leadu mění i věci mimo tuto stránku (příchozí
  // odpověď firmy přes `sales-lead-inbound`, jiná záložka prohlížeče). Místo
  // periodického dotazování načteme data znovu, když se okno vrátí do popředí.
  useEffect(() => {
    const refetchIfVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    // Ihned po označení odpovědí jako přečtených (z detailu) obnovíme počty.
    const refetchNow = () => void load();
    window.addEventListener('focus', refetchIfVisible);
    document.addEventListener('visibilitychange', refetchIfVisible);
    window.addEventListener('sales-leads-unread-changed', refetchNow);
    return () => {
      window.removeEventListener('focus', refetchIfVisible);
      document.removeEventListener('visibilitychange', refetchIfVisible);
      window.removeEventListener('sales-leads-unread-changed', refetchNow);
    };
  }, [load]);

  /** Přepnutí záložky — počty i seznam se osvěží proti aktuálnímu stavu DB. */
  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      void load();
    },
    [load],
  );

  /** Zavření detailu — v detailu se mohl změnit stav, koncept i historie. */
  const handleDetailOpenChange = useCallback(
    (nextOpen: boolean) => {
      setDetailOpen(nextOpen);
      if (!nextOpen) void load();
    },
    [load],
  );

  const openDetail = (id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const confirmDeleteOne = async () => {
    if (!deleteOneId) return;
    setDeleting(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_delete', {
        p_lead_id: deleteOneId,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string };
      if (!res.success) {
        toast.error(res.error === 'access_denied' ? 'Nemáte oprávnění smazat lead.' : 'Lead se nepodařilo smazat.');
        return;
      }
      toast.success('Lead byl smazán.');
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteOneId);
        return next;
      });
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lead se nepodařilo smazat.');
    } finally {
      setDeleting(false);
      setDeleteOneId(null);
    }
  };

  const confirmDeleteBulk = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_delete_bulk', {
        p_lead_ids: Array.from(selectedIds),
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string; deleted_count?: number };
      if (!res.success) {
        toast.error(res.error === 'access_denied' ? 'Nemáte oprávnění mazat leady.' : 'Leady se nepodařilo smazat.');
        return;
      }
      toast.success(`Smazáno leadů: ${res.deleted_count ?? 0}.`);
      setSelectedIds(new Set());
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Leady se nepodařilo smazat.');
    } finally {
      setDeleting(false);
      setBulkDeleteOpen(false);
    }
  };

  const summary = useMemo(
    () => ({
      total: leads.length,
      proposed: leads.filter((l) => l.status === 'navrzeny').length,
      toContact: leads.filter((l) => ['novy', 'priprava'].includes(l.status)).length,
      awaitingApproval: leads.filter((l) => l.status === 'schvaleni_ceka').length,
      contacted: leads.filter((l) => ['osloveno', 'follow_up'].includes(l.status)).length,
      // `odpovedel` = firma odpověděla; `jednani` = už se s ní jedná. Oddělené karty.
      replied: leads.filter((l) => l.status === 'odpovedel').length,
      talks: leads.filter((l) => l.status === 'jednani').length,
      converted: leads.filter((l) => l.status === 'konvertovan').length,
      notConverted: leads.filter((l) => l.status === 'odmitl').length,
      blocked: leads.filter((l) => l.status === 'nekontaktovat').length,
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

  const allVisibleSelected = visibleLeads.length > 0 && visibleLeads.every((l) => selectedIds.has(l.id));
  const someVisibleSelected = visibleLeads.some((l) => selectedIds.has(l.id));

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        visibleLeads.forEach((l) => next.add(l.id));
      } else {
        visibleLeads.forEach((l) => next.delete(l.id));
      }
      return next;
    });
  };

  const summaryCards: { label: string; value: number; unread?: number }[] = [
    { label: 'Celkem leadů', value: summary.total },
    { label: 'Návrhy', value: summary.proposed },
    { label: 'K oslovení', value: summary.toContact },
    { label: 'Čeká na schválení', value: summary.awaitingApproval },
    { label: 'Osloveno', value: summary.contacted },
    { label: 'Odpovědělo', value: summary.replied, unread: unreadTotal },
    { label: 'Jednání', value: summary.talks },
    { label: 'Spolupráce', value: summary.converted },
    { label: 'Bez spolupráce', value: summary.notConverted },
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
              <div className="flex items-baseline gap-2">
                <div className="text-xl font-bold">{loading ? '…' : c.value}</div>
                {!loading && (c.unread ?? 0) > 0 && (
                  <span
                    className="min-w-[1.25rem] rounded-full bg-destructive px-1.5 py-0.5 text-center text-[11px] font-bold text-destructive-foreground"
                    title={`${c.unread} nepřečtených odpovědí`}
                  >
                    {(c.unread ?? 0) > 99 ? '99+' : c.unread}
                  </span>
                )}
              </div>
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
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="h-auto flex-wrap justify-start">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="text-xs">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                Vybráno leadů: <strong className="text-foreground">{selectedIds.size}</strong>
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                data-testid="sl-bulk-delete-btn"
              >
                <Trash2 className="h-4 w-4 mr-1.5" aria-hidden />
                Smazat vybrané ({selectedIds.size})
              </Button>
            </div>
          )}
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                      onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                      aria-label="Vybrat vše"
                    />
                  </TableHead>
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
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onCheckedChange={(checked) => toggleSelected(lead.id, checked === true)}
                        aria-label={`Vybrat ${lead.company_name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {unreadLeadIds.has(lead.id) ? (
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-destructive"
                            aria-label="Nová nepřečtená odpověď"
                          />
                          <span className="font-bold">{lead.company_name}</span>
                        </span>
                      ) : (
                        lead.company_name
                      )}
                    </TableCell>
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
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(lead.id)}>
                          Detail
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteOneId(lead.id)}
                          data-testid="sl-delete-one-btn"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
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
        onOpenChange={handleDetailOpenChange}
        onMutated={load}
      />

      <AlertDialog open={!!deleteOneId} onOpenChange={(o) => !o && setDeleteOneId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Smazat lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce trvale smaže lead včetně navázaných aktivit a historie stavů. Nelze vrátit zpět.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Zrušit</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={confirmDeleteOne} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Smazat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Smazat vybrané leady?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce trvale smaže {selectedIds.size} vybraných leadů včetně navázaných aktivit
              a historie stavů. Nelze vrátit zpět.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Zrušit</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={confirmDeleteBulk} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Smazat ({selectedIds.size})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminSalesLeads;
