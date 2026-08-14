/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Briefcase, FileText, History, MailPlus, Plus, Search, Info, Sparkles, Trash2 } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
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
import { DiscoveryStatusBar } from '@/components/admin/sales-leads/DiscoveryStatusBar';
import { useDiscoveryJob, type DiscoveryJobRow } from '@/components/admin/sales-leads/useDiscoveryJob';
import { SalesLeadOverview } from '@/components/admin/sales-leads/SalesLeadOverview';
import { SalesLeadEmailTemplateManager } from '@/components/admin/sales-leads/SalesLeadEmailTemplateManager';
import { SalesLeadUnassignedEmails } from '@/components/admin/sales-leads/SalesLeadUnassignedEmails';
import { SalesLeadToday } from '@/components/admin/sales-leads/SalesLeadToday';
import { SalesLeadEmailBatchDialog } from '@/components/admin/sales-leads/SalesLeadEmailBatchDialog';
import { SalesLeadEmailBatchesSheet } from '@/components/admin/sales-leads/SalesLeadEmailBatchesSheet';
import {
  ALL_LEAD_FILTER_VALUE,
  EMPTY_LEAD_FILTER_VALUE,
  buildIndustryFilterOptions,
  buildLeadGroupFilterOptions,
  filterSalesLeadList,
  type LeadFilterOption,
} from '@/components/admin/sales-leads/salesLeadListFilters';
import {
  EMPTY_RESPONSE_OVERVIEW,
  RESPONSE_INTEREST_SUMMARY,
  displayOrDash,
  parseResponseOverview,
  sortInterestedRows,
  type SalesLeadResponseOverview,
} from '@/components/admin/sales-leads/salesLeadResponses';

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
const TABS: { id: string; label: string; statuses: string[] | null; draftsOnly?: boolean }[] = [
  { id: 'today', label: 'Dnes', statuses: [] },
  { id: 'all', label: 'Vše', statuses: null },
  // Fáze 4B — navržené leady ke kontrole člověkem.
  { id: 'proposed', label: 'Návrhy', statuses: ['navrzeny'] },
  { id: 'new', label: 'Nové', statuses: ['novy'] },
  // Rozpracované = leady se skutečně ULOŽENÝM konceptem e-mailu
  // (nezávisle na stavu leadu) — `draft_updated_at` je vyplněné.
  { id: 'prep', label: 'Rozpracované', statuses: null, draftsOnly: true },
  { id: 'contacted', label: 'Osloveno', statuses: ['osloveno', 'follow_up'] },
  // Samostatný pohled na potvrzený zájem z tlačítka „Mám zájem“ v obchodním
  // e-mailu. NENÍ to nový stav leadu — lead zůstává `odpovedel`; zdrojem je
  // konečný stav response tokenu (RPC sales_lead_response_overview).
  { id: 'to-contact', label: 'Kontaktovat', statuses: [] },
  // `odpovedel` a `jednani` jsou oddělené fáze — nesmí se počítat dvakrát.
  { id: 'replied', label: 'Odpovědělo', statuses: ['odpovedel'] },
  { id: 'talks', label: 'Jednání', statuses: ['jednani'] },
  { id: 'converted', label: 'Spolupráce', statuses: ['konvertovan'] },
  { id: 'not-converted', label: 'Bez spolupráce', statuses: ['odmitl'] },
  { id: 'blocked', label: 'Nekontaktovat', statuses: ['nekontaktovat'] },
  { id: 'archive', label: 'Archiv', statuses: ['archivovan'] },
  { id: 'unassigned-emails', label: 'Nepřiřazené e-maily', statuses: [] },
];

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
};

/** Datum i čas reakce — u odpovědí z e-mailu je čas podstatný. */
const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' });
};

const AdminSalesLeads: React.FC = () => {
  const { isSuperAdmin } = useUserRole();
  const [leads, setLeads] = useState<SalesLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState(ALL_LEAD_FILTER_VALUE);
  const [industryFilter, setIndustryFilter] = useState(ALL_LEAD_FILTER_VALUE);
  const [leadGroupOptions, setLeadGroupOptions] = useState<LeadFilterOption[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchesOpen, setBatchesOpen] = useState(false);
  const [batchesRefreshKey, setBatchesRefreshKey] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteOneId, setDeleteOneId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Nepřečtené příchozí odpovědi: množina leadů s ≥1 nepřečtenou + celkový počet.
  const [unreadLeadIds, setUnreadLeadIds] = useState<Set<string>>(new Set());
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [openTasks, setOpenTasks] = useState<{lead_id:string;due_at:string}[]>([]);
  const [plannedActivities, setPlannedActivities] = useState<{lead_id:string;scheduled_for:string;activity_type:string}[]>([]);
  const [unassignedEmailCount, setUnassignedEmailCount] = useState(0);
  // Reakce na tlačítka v obchodním e-mailu. Autoritativní zdroj = konečný stav
  // response tokenu přes SECURITY DEFINER RPC (tabulka tokenů je pro
  // authenticated zamčená, frontend ji nesmí číst přímo).
  const [responses, setResponses] = useState<SalesLeadResponseOverview>(EMPTY_RESPONSE_OVERVIEW);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, groupsRes, unreadRes, tasksRes, plannedRes, unassignedRes, responsesRes] = await Promise.all([
        (supabase as any)
          .from('sales_leads')
          .select('id, company_name, industry, city, status, contact_email, updated_at, assigned_admin_id, lead_group, draft_updated_at')
          .order('updated_at', { ascending: false }),
        (supabase as any)
          .from('sales_lead_groups')
          .select('slug, label')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('label', { ascending: true }),
        // Nepřečtené odpovědi napříč všemi leady (RLS pustí jen držitele oprávnění).
        (supabase as any)
          .from('sales_lead_activities')
          .select('lead_id')
          .eq('activity_type', 'reply_received')
          .is('read_at', null),
        (supabase as any).from('sales_lead_tasks').select('lead_id,due_at').in('status',['ceka','rozpracovano']).order('due_at'),
        (supabase as any).from('sales_lead_activities').select('lead_id,scheduled_for,activity_type').in('activity_status',['naplanovano','rozpracovano']).not('scheduled_for','is',null).in('activity_type',['call_logged','meeting_logged','note_added']).order('scheduled_for'),
        (supabase as any).from('sales_lead_unassigned_emails').select('id', { count: 'exact', head: true }).eq('status', 'unassigned'),
        (supabase as any).rpc('sales_lead_response_overview'),
      ]);
      const loadedLeads = (leadsRes.error ? [] : leadsRes.data ?? []) as SalesLeadRow[];
      if (leadsRes.error) {
        setTableMissing(true);
        setLeads([]);
      } else {
        setTableMissing(false);
        setLeads(loadedLeads);
      }
      setLeadGroupOptions(buildLeadGroupFilterOptions(
        groupsRes.error ? null : (groupsRes.data ?? []),
        loadedLeads,
      ));
      // Nepřečtené jsou best-effort — chyba (např. chybějící sloupec před migrací)
      // jen znamená „žádná upozornění", nikdy nerozbije seznam.
      const unreadRows = (unreadRes.error ? [] : unreadRes.data ?? []) as { lead_id: string }[];
      setUnreadLeadIds(new Set(unreadRows.map((r) => r.lead_id)));
      setUnreadTotal(unreadRows.length);
      setOpenTasks((tasksRes.error ? [] : tasksRes.data ?? []) as {lead_id:string;due_at:string}[]);
      setPlannedActivities((plannedRes.error ? [] : plannedRes.data ?? []) as {lead_id:string;scheduled_for:string;activity_type:string}[]);
      setUnassignedEmailCount(unassignedRes.error ? 0 : unassignedRes.count ?? 0);
      // Best-effort jako ostatní počty: chybějící RPC (prostředí před migrací)
      // znamená prázdný přehled, nikdy rozbitý seznam leadů.
      setResponses(
        responsesRes.error
          ? EMPTY_RESPONSE_OVERVIEW
          : parseResponseOverview(responsesRes.data),
      );
    } catch {
      setTableMissing(true);
      setLeads([]);
      setLeadGroupOptions([]);
      setUnreadLeadIds(new Set());
      setUnreadTotal(0);
      setOpenTasks([]);
      setPlannedActivities([]);
      setUnassignedEmailCount(0);
      setResponses(EMPTY_RESPONSE_OVERVIEW);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Sledování hledání nových firem žije NAD dialogem — zavření okna ho
   * nezastaví a stav přežije i refresh stránky (dohledá se poslední běžící
   * úloha admina v `sales_lead_discovery_jobs`).
   */
  const handleDiscoveryFinished = useCallback((finishedJob: DiscoveryJobRow) => {
    // Po dokončení: obnovit seznam i počty a přepnout na „Návrhy".
    load();
    setActiveTab('proposed');
    if (finishedJob.status === 'failed') {
      toast.error('Vyhledávání selhalo.');
    } else if (finishedJob.status === 'stopped') {
      toast.message(`Vyhledávání zastaveno — uloženo ${finishedJob.created_count} firem.`);
    } else {
      toast.success(`Vyhledávání dokončeno — uloženo ${finishedJob.created_count} firem.`);
    }
  }, [load]);

  // Průběžné obnovení během běhu — bez přepínání záložky.
  const discovery = useDiscoveryJob({
    onFinished: handleDiscoveryFinished,
    onProgress: load,
  });

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

  /**
   * Řádky záložky „Kontaktovat“: nepřečtené první, pak nejnovější reakce.
   * Lead ze záložky nezmizí přečtením — odejde až ruční změnou stavu.
   */
  const interestedRows = useMemo(
    () => sortInterestedRows(responses.interested),
    [responses.interested],
  );

  /** Počet leadů s uloženým konceptem — badge u záložky Rozpracované. */
  const draftCount = useMemo(
    () => leads.filter((l) => Boolean(l.draft_updated_at)).length,
    [leads],
  );

  const visibleLeads = useMemo(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    // Rozpracované = jen leady se skutečně uloženým konceptem (draft_updated_at).
    const base = tab?.draftsOnly ? leads.filter((l) => l.draft_updated_at) : leads;
    return filterSalesLeadList(base, {
      statuses: tab?.statuses ?? null,
      searchTerm,
      group: groupFilter,
      industry: industryFilter,
    });
  }, [leads, activeTab, searchTerm, groupFilter, industryFilter]);

  const industryFilterOptions = useMemo(() => buildIndustryFilterOptions(leads), [leads]);

  const resetListFilters = () => {
    setActiveTab('all');
    setSearchTerm('');
    setGroupFilter(ALL_LEAD_FILTER_VALUE);
    setIndustryFilter(ALL_LEAD_FILTER_VALUE);
    setSelectedIds(new Set());
  };

  const hasActiveListFilters = activeTab !== 'all'
    || searchTerm.trim() !== ''
    || groupFilter !== ALL_LEAD_FILTER_VALUE
    || industryFilter !== ALL_LEAD_FILTER_VALUE;

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

  const selectedLeads = useMemo(
    () => leads
      .filter((lead) => selectedIds.has(lead.id))
      .map((lead) => ({ id: lead.id, company_name: lead.company_name })),
    [leads, selectedIds],
  );

  const openBatchDialog = () => {
    if (selectedIds.size > 100) {
      toast.error('Najednou lze připravit nejvýše 100 vybraných firem. Zmenšete výběr.');
      return;
    }
    setBatchDialogOpen(true);
  };

  const summaryCards: { label: string; value: number; unread?: number }[] = [
    { label: 'Celkem leadů', value: summary.total },
    { label: 'Návrhy', value: summary.proposed },
    { label: 'K oslovení', value: summary.toContact },
    { label: 'Čeká na schválení', value: summary.awaitingApproval },
    { label: 'Osloveno', value: summary.contacted },
    // „Kontaktovat“ = firmy s potvrzeným zájmem z tlačítka (response token),
    // „Odpovědělo“ = stav leadu. Různé metriky, každá počítá lead jen jednou.
    { label: 'Kontaktovat', value: responses.interestedTotal, unread: responses.interestedUnread },
    { label: 'Odpovědělo', value: summary.replied, unread: unreadTotal },
    { label: 'Jednání', value: summary.talks },
    { label: 'Spolupráce', value: summary.converted },
    { label: 'Bez spolupráce', value: summary.notConverted },
    { label: 'Nekontaktovat', value: summary.blocked },
    { label: 'Nemá zájem', value: responses.declinedTotal, unread: responses.declinedUnread },
    { label: 'Nevyřízené úkoly', value: openTasks.length },
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
          <Button variant="outline" onClick={() => setBatchesOpen(true)} data-testid="sl-email-batches-btn">
            <History className="h-4 w-4 mr-1.5" aria-hidden />
            E-mailové dávky
          </Button>
          {isSuperAdmin && (
            <Button variant="outline" onClick={() => setTemplateManagerOpen(true)} data-testid="sl-template-manager-btn">
              <FileText className="h-4 w-4 mr-1.5" aria-hidden />
              E-mailové šablony
            </Button>
          )}
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

      <SalesLeadOverview />

      {tableMissing && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>
            Databáze leadů zatím není v tomto prostředí připravená (migrace Fáze 1 čeká na aplikaci).
            Stránka je připravena a načte data automaticky, jakmile bude databáze dostupná.
          </span>
        </div>
      )}

      {/* Stav hledání nových firem — viditelný i při zavřeném dialogu */}
      {discovery.showStatusBar && discovery.job && (
        <DiscoveryStatusBar job={discovery.job} onOpen={() => setDiscoverOpen(true)} />
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
            <CardTitle className="text-base">
              {activeTab === 'today'
                ? 'Dnes'
                : activeTab === 'unassigned-emails'
                ? 'Příchozí pošta bez návaznosti'
                : activeTab === 'to-contact'
                ? 'Firmy s potvrzeným zájmem o spolupráci'
                : 'Seznam leadů'}
            </CardTitle>
          </div>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="h-auto flex-wrap justify-start">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="text-xs">
                  {t.label}
                  {t.id === 'unassigned-emails' && unassignedEmailCount > 0 && (
                    <Badge className="ml-1.5 h-5 min-w-5 justify-center px-1.5">{unassignedEmailCount}</Badge>
                  )}
                  {t.draftsOnly && draftCount > 0 && (
                    <Badge data-testid="sl-drafts-count" className="ml-1.5 h-5 min-w-5 justify-center px-1.5">
                      {draftCount}
                    </Badge>
                  )}
                  {/* Červené počty NOVÝCH reakcí z tlačítek v obchodním e-mailu.
                      Stejný destructive vzhled jako u nepřečtených odpovědí. */}
                  {t.id === 'to-contact' && responses.interestedUnread > 0 && (
                    <span
                      data-testid="sl-interested-unread-count"
                      className="ml-1.5 min-w-[1.25rem] rounded-full bg-destructive px-1.5 py-0.5 text-center text-[11px] font-bold text-destructive-foreground"
                      title={`${responses.interestedUnread} nepřečtených reakcí „Mám zájem“`}
                    >
                      {responses.interestedUnread > 99 ? '99+' : responses.interestedUnread}
                    </span>
                  )}
                  {t.id === 'blocked' && responses.declinedUnread > 0 && (
                    <span
                      data-testid="sl-declined-unread-count"
                      className="ml-1.5 min-w-[1.25rem] rounded-full bg-destructive px-1.5 py-0.5 text-center text-[11px] font-bold text-destructive-foreground"
                      title={`${responses.declinedUnread} nových odmítnutí z obchodního e-mailu`}
                    >
                      {responses.declinedUnread > 99 ? '99+' : responses.declinedUnread}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {!['today', 'unassigned-emails', 'to-contact'].includes(activeTab) && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_minmax(12rem,0.65fr)_minmax(12rem,0.65fr)_auto] lg:items-end">
              <div className="space-y-1">
                <Label htmlFor="sl-search-filter" className="text-xs text-muted-foreground">Hledat</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input
                    id="sl-search-filter"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Název, e-mail, město…"
                    className="pl-8"
                    data-testid="sl-search-filter"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sl-group-filter" className="text-xs text-muted-foreground">Skupina</Label>
                <Select value={groupFilter} onValueChange={setGroupFilter}>
                  <SelectTrigger id="sl-group-filter" data-testid="sl-group-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_LEAD_FILTER_VALUE}>Všechny</SelectItem>
                    <SelectItem value={EMPTY_LEAD_FILTER_VALUE}>Bez skupiny</SelectItem>
                    {leadGroupOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sl-industry-filter" className="text-xs text-muted-foreground">Obor</Label>
                <Select value={industryFilter} onValueChange={setIndustryFilter}>
                  <SelectTrigger id="sl-industry-filter" data-testid="sl-industry-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_LEAD_FILTER_VALUE}>Všechny</SelectItem>
                    <SelectItem value={EMPTY_LEAD_FILTER_VALUE}>Bez oboru</SelectItem>
                    {industryFilterOptions.map((industry) => (
                      <SelectItem key={industry} value={industry}>{INDUSTRY_LABEL(industry)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={resetListFilters}
                disabled={!hasActiveListFilters}
                data-testid="sl-reset-filters"
              >
                Zrušit filtry
              </Button>
            </div>
          )}
          {!['today', 'unassigned-emails', 'to-contact'].includes(activeTab) && selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                Vybráno leadů: <strong className="text-foreground">{selectedIds.size}</strong>
              </span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={openBatchDialog} data-testid="sl-prepare-email-batch-btn">
                  <MailPlus className="h-4 w-4 mr-1.5" aria-hidden />
                  Připravit e-mailovou dávku ({selectedIds.size})
                </Button>
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
            </div>
          )}
        </CardHeader>
        <CardContent className={['today', 'unassigned-emails', 'to-contact'].includes(activeTab) ? 'p-0' : undefined}>
          {activeTab === 'today' ? (
            <SalesLeadToday
              onOpenLead={(leadId) => {
                setActiveTab('all');
                openDetail(leadId);
              }}
            />
          ) : activeTab === 'unassigned-emails' ? (
            <SalesLeadUnassignedEmails
              onCountChange={setUnassignedEmailCount}
              onOpenLead={(leadId) => {
                setActiveTab('all');
                openDetail(leadId);
              }}
            />
          ) : activeTab === 'to-contact' ? (
            loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Načítám…</div>
            ) : interestedRows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Zatím žádná firma nepotvrdila zájem přes tlačítko „Mám zájem“ v obchodním e-mailu.
              </div>
            ) : (
              <Table data-testid="sl-to-contact-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Firma</TableHead>
                    <TableHead>Kontaktní osoba</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Odpověď</TableHead>
                    <TableHead>Dávka</TableHead>
                    <TableHead className="text-right">Akce</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interestedRows.map((row) => (
                    <TableRow key={row.lead_id} data-testid="sl-to-contact-row">
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {row.unread && (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-destructive"
                              aria-label="Nová nepřečtená reakce"
                            />
                          )}
                          <span className={row.unread ? 'font-bold' : undefined}>{row.company_name}</span>
                        </span>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 text-emerald-500">
                            {RESPONSE_INTEREST_SUMMARY}
                          </Badge>
                          {row.priority === 1 && (
                            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                              Vysoká priorita
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{displayOrDash(row.contact_person)}</TableCell>
                      <TableCell>{displayOrDash(row.contact_phone)}</TableCell>
                      <TableCell className="text-muted-foreground">{displayOrDash(row.contact_email)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(row.responded_at)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.batch_item_id ? `${row.batch_item_id.slice(0, 8)}…` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(row.lead_id)}>
                          Detail
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Načítám…</div>
          ) : visibleLeads.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {leads.length === 0
                ? 'Zatím žádné leady. Modul je připravený — první firmy přibudou v další fázi.'
                : 'Žádné leady neodpovídají zvoleným filtrům. Zkuste změnit výběr nebo filtry zrušit.'}
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
                  <TableHead>Nejbližší plán</TableHead>
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
                      {openTasks.some(t=>t.lead_id===lead.id) && <Badge variant="outline" className={`ml-2 ${openTasks.some(t=>t.lead_id===lead.id&&new Date(t.due_at)<new Date())?'border-destructive text-destructive':''}`}>Úkol {openTasks.filter(t=>t.lead_id===lead.id).length}</Badge>}
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
                    <TableCell className="text-muted-foreground">{(()=>{const a=plannedActivities.find(x=>x.lead_id===lead.id);if(!a)return '—';const label=a.activity_type==='meeting_logged'?'Schůzka':a.activity_type==='call_logged'?'Telefonát':'Další krok';return `${label}: ${new Date(a.scheduled_for).toLocaleString('cs-CZ',{timeZone:'Europe/Prague'})}`;})()}</TableCell>
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
      {isSuperAdmin && (
        <SalesLeadEmailTemplateManager open={templateManagerOpen} onOpenChange={setTemplateManagerOpen} />
      )}
      <DiscoverLeadsDialog
        open={discoverOpen}
        onOpenChange={setDiscoverOpen}
        job={discovery.showStatusBar ? discovery.job : null}
        isRunning={discovery.isRunning}
        onStart={discovery.startJob}
        onStop={discovery.stopJob}
        onGroupsChanged={load}
      />
      <SalesLeadDetailSheet
        leadId={detailId}
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
        onMutated={load}
      />
      <SalesLeadEmailBatchDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        selectedLeads={selectedLeads}
        onCreated={async () => {
          setSelectedIds(new Set());
          setBatchesRefreshKey((value) => value + 1);
          await load();
        }}
      />
      <SalesLeadEmailBatchesSheet
        open={batchesOpen}
        onOpenChange={setBatchesOpen}
        refreshKey={batchesRefreshKey}
        onChanged={() => setBatchesRefreshKey((value) => value + 1)}
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
