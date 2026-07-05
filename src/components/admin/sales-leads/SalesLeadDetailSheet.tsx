import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Loader2, Pencil, X, Sparkles, Mail, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import {
  INDUSTRY_OPTIONS,
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  LEAD_GROUP_OPTIONS,
  DISCOVERY_SOURCE_OPTIONS,
  LEAD_QUALITY_LABELS,
  PROPOSED_CONTACT_STATUS_LABELS,
  leadGroupLabel,
  allowedTargets,
  isReasonRequired,
  rpcErrorMessage,
  type SalesLeadDetail,
} from './salesLeadsShared';

interface Props {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Zavolá se po jakékoli úspěšné mutaci, aby se seznam v rodiči obnovil. */
  onMutated: () => void;
}

interface ActivityRow {
  id: string;
  activity_type: string;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
}

const DETAIL_COLUMNS =
  'id, company_name, industry, city, status, contact_email, updated_at, assigned_admin_id, ' +
  'ico, dic, website, company_size, contact_person, contact_role, contact_phone, email_source, ' +
  'email_verified_by_admin, do_not_contact, do_not_contact_reason, notes, created_at, ' +
  'ai_research_summary, ai_research_at, draft_email_subject, draft_email_body, draft_prepared_by, ' +
  'lead_group, lead_quality, discovery_source, discovery_meta, ' +
  'proposed_contact_email, proposed_contact_source_url, proposed_contact_at, ' +
  'proposed_contact_by, proposed_contact_status';

const ACTIVITY_LABELS: Record<string, string> = {
  lead_created: 'Lead založen',
  field_updated: 'Údaje upraveny',
  ai_research: 'AI rešerše firmy',
  draft_created: 'AI návrh e-mailu',
  draft_edited: 'Návrh e-mailu upraven',
  email_sent: 'E-mail odeslán',
  status_changed: 'Změna stavu',
  do_not_contact_set: 'Označeno „Nekontaktovat"',
  converted: 'Konvertován na partnera',
  note_added: 'Přidána poznámka',
  lead_discovered: 'Firma automaticky navržena',
  contact_proposed: 'Navržen kontaktní e-mail',
  contact_approved: 'Kontaktní e-mail schválen',
  contact_rejected: 'Návrh kontaktu zamítnut',
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

type EditForm = {
  company_name: string;
  ico: string;
  dic: string;
  website: string;
  industry: string;
  city: string;
  company_size: string;
  contact_person: string;
  contact_role: string;
  contact_email: string;
  contact_phone: string;
  email_source: string;
  email_verified_by_admin: boolean;
  notes: string;
};

const toForm = (l: SalesLeadDetail): EditForm => ({
  company_name: l.company_name ?? '',
  ico: l.ico ?? '',
  dic: l.dic ?? '',
  website: l.website ?? '',
  industry: l.industry ?? '',
  city: l.city ?? '',
  company_size: l.company_size ?? '',
  contact_person: l.contact_person ?? '',
  contact_role: l.contact_role ?? '',
  contact_email: l.contact_email ?? '',
  contact_phone: l.contact_phone ?? '',
  email_source: l.email_source ?? '',
  email_verified_by_admin: l.email_verified_by_admin ?? false,
  notes: l.notes ?? '',
});

export function SalesLeadDetailSheet({ leadId, open, onOpenChange, onMutated }: Props) {
  const { isSuperAdmin } = useUserRole();
  const [lead, setLead] = useState<SalesLeadDetail | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  // Změna stavu: vybraný cíl + důvod.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  // AI příprava (Fáze 3B).
  const [researchBusy, setResearchBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  // Odeslání konceptu člověkem (Fáze 3C).
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // Zařazení / discovery (Fáze 4B).
  const [clsEditing, setClsEditing] = useState(false);
  const [clsSaving, setClsSaving] = useState(false);
  const [clsGroup, setClsGroup] = useState('');
  const [clsQuality, setClsQuality] = useState('0');
  const [clsSource, setClsSource] = useState('');
  // Dohledání / schválení kontaktu (Fáze 5B).
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [contactReviewBusy, setContactReviewBusy] = useState(false);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const [{ data: leadData, error: leadErr }, { data: actData }] = await Promise.all([
        (supabase as any).from('sales_leads').select(DETAIL_COLUMNS).eq('id', leadId).single(),
        (supabase as any)
          .from('sales_lead_activities')
          .select('id, activity_type, created_at, metadata')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (leadErr) throw new Error(leadErr.message);
      const detail = leadData as SalesLeadDetail;
      setLead(detail);
      setDraftSubject(detail.draft_email_subject ?? '');
      setDraftBody(detail.draft_email_body ?? '');
      setClsGroup(detail.lead_group ?? '');
      setClsQuality(String(detail.lead_quality ?? 0));
      setClsSource(detail.discovery_source ?? '');
      setClsEditing(false);
      setActivities((actData ?? []) as ActivityRow[]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nepodařilo se načíst detail';
      toast.error(msg);
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (open && leadId) {
      setEditing(false);
      setPendingStatus(null);
      setReason('');
      load();
    }
  }, [open, leadId, load]);

  const startEdit = () => {
    if (lead) {
      setForm(toForm(lead));
      setEditing(true);
    }
  };

  const setField =
    (field: keyof EditForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => (prev ? { ...prev, [field]: e.target.value } : prev));

  const saveEdit = async () => {
    if (!lead || !form) return;
    if (!form.company_name.trim()) {
      toast.error('Název firmy je povinný');
      return;
    }
    const website = form.website.trim();
    const normalizedWebsite = website
      ? /^https?:\/\//i.test(website)
        ? website
        : `https://${website}`
      : '';
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_update_fields', {
        p_lead_id: lead.id,
        p_company_name: form.company_name.trim(),
        p_ico: form.ico.trim() || null,
        p_dic: form.dic.trim() || null,
        p_website: normalizedWebsite || null,
        p_industry: form.industry || null,
        p_city: form.city.trim() || null,
        p_company_size: form.company_size || null,
        p_contact_person: form.contact_person.trim() || null,
        p_contact_role: form.contact_role.trim() || null,
        p_contact_email: form.contact_email.trim() || null,
        p_contact_phone: form.contact_phone.trim() || null,
        p_email_source: form.email_source.trim() || null,
        p_email_verified_by_admin: form.email_verified_by_admin,
        p_notes: form.notes.trim() || null,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      toast.success('Údaje uloženy');
      setEditing(false);
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Uložení se nezdařilo';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const targets = useMemo(
    () => (lead ? allowedTargets(lead.status, isSuperAdmin) : []),
    [lead, isSuperAdmin],
  );

  // ── AI příprava (Fáze 3B) — pouze návrhy, nic se neodesílá ────────────────
  const runResearch = async () => {
    if (!lead) return;
    setResearchBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('sales-lead-research', {
        body: { lead_id: lead.id },
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      toast.success('Rešerše dokončena');
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rešerše se nezdařila';
      toast.error(msg);
    } finally {
      setResearchBusy(false);
    }
  };

  const prepareDraft = async () => {
    if (!lead) return;
    setDraftBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('sales-lead-draft-email', {
        body: { lead_id: lead.id },
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string; subject?: string; body?: string };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      setDraftSubject(res.subject ?? '');
      setDraftBody(res.body ?? '');
      toast.success('Návrh e-mailu připraven');
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Příprava návrhu se nezdařila';
      toast.error(msg);
    } finally {
      setDraftBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!lead) return;
    if (!draftSubject.trim() || !draftBody.trim()) {
      toast.error('Předmět i tělo návrhu musí být vyplněné.');
      return;
    }
    setDraftSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_save_draft', {
        p_lead_id: lead.id,
        p_subject: draftSubject.trim(),
        p_body: draftBody.trim(),
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      toast.success('Koncept uložen');
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Uložení konceptu se nezdařilo';
      toast.error(msg);
    } finally {
      setDraftSaving(false);
    }
  };

  // ── Zařazení / discovery (Fáze 4B) — ruční úprava přes SECURITY DEFINER RPC ─
  const saveClassification = async () => {
    if (!lead) return;
    setClsSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_update_discovery', {
        p_lead_id: lead.id,
        p_lead_group: clsGroup || null,
        p_lead_quality: Number(clsQuality),
        p_discovery_source: clsSource || null,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      toast.success('Zařazení uloženo');
      setClsEditing(false);
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Uložení zařazení se nezdařilo';
      toast.error(msg);
    } finally {
      setClsSaving(false);
    }
  };

  // ── Dohledání veřejného kontaktu (Fáze 5B) — AI nevymýšlí, jen návrh ──────
  // EF sales-lead-enrich-contact najde VEŘEJNÝ e-mail a uloží ho jen jako
  // NEOVĚŘENÝ návrh (proposed_contact_*). Odesílací contact_email zůstává beze
  // změny — vyplní ho teprve člověk schválením níže.
  const runEnrich = async () => {
    if (!lead) return;
    setEnrichBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('sales-lead-enrich-contact', {
        body: { lead_id: lead.id },
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string; found?: boolean };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      if (res.found === false) {
        toast.info('Veřejný e-mail se nepodařilo dohledat. AI nic nevymýšlí.');
        return;
      }
      toast.success('Návrh e-mailu uložen — schvalte ho ručně níže.');
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Dohledání kontaktu se nezdařilo';
      toast.error(msg);
    } finally {
      setEnrichBusy(false);
    }
  };

  // Schválení / zamítnutí návrhu kontaktu ČLOVĚKEM. Teprve schválení vyplní
  // odesílací contact_email + email_verified_by_admin=true (RPC to hlídá).
  const reviewContact = async (decision: 'approve' | 'reject') => {
    if (!lead) return;
    setContactReviewBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_review_contact', {
        p_lead_id: lead.id,
        p_decision: decision,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      toast.success(decision === 'approve' ? 'E-mail schválen a nastaven jako kontakt.' : 'Návrh e-mailu zamítnut.');
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Akce se nezdařila';
      toast.error(msg);
    } finally {
      setContactReviewBusy(false);
    }
  };

  // ── Odeslání konceptu ČLOVĚKEM (Fáze 3C) — nikdy ne AI ────────────────────
  // Odešle výhradně uložený koncept z leadu přes EF send-sales-lead-email.
  // Tlačítko je aktivní jen když je koncept uložený, je vyplněný contact_email
  // a lead není do_not_contact. EF navíc všechny bariéry ověřuje server-side.
  const draftSaved = !!(lead?.draft_email_subject && lead?.draft_email_body);
  const hasContactEmail = !!lead?.contact_email;
  const isDoNotContact = !!lead?.do_not_contact;
  const canSend = draftSaved && hasContactEmail && !isDoNotContact;

  const sendEmail = async () => {
    if (!lead) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-sales-lead-email', {
        body: { lead_id: lead.id },
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      toast.success('E-mail odeslán');
      setSendConfirmOpen(false);
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Odeslání e-mailu se nezdařilo';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!lead || !pendingStatus) return;
    if (isReasonRequired(lead.status, pendingStatus) && !reason.trim()) {
      toast.error('U této změny stavu je nutné uvést důvod.');
      return;
    }
    setStatusBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_set_status', {
        p_lead_id: lead.id,
        p_new_status: pendingStatus,
        p_reason: reason.trim() || null,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      toast.success('Stav změněn');
      setPendingStatus(null);
      setReason('');
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Změna stavu se nezdařila';
      toast.error(msg);
    } finally {
      setStatusBusy(false);
    }
  };

  const ReadRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2 break-words">{value || '—'}</span>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {loading || !lead ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Načítám…
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center justify-between gap-3 pr-6">
                <SheetTitle className="text-left">{lead.company_name}</SheetTitle>
                <Badge variant="outline" className={STATUS_BADGE_CLASS[lead.status] ?? ''}>
                  {STATUS_LABELS[lead.status] ?? lead.status}
                </Badge>
              </div>
              <SheetDescription className="text-left">
                Detail leadu · založeno {formatDateTime(lead.created_at)}
              </SheetDescription>
            </SheetHeader>

            {/* Změna stavu */}
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Změna stavu</div>
              {targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Z tohoto stavu není povolen žádný přechod.</p>
              ) : pendingStatus ? (
                <div className="rounded-lg border border-border/60 p-3 space-y-2">
                  <p className="text-sm">
                    Změnit stav na <strong>{STATUS_LABELS[pendingStatus]}</strong>?
                  </p>
                  {(isReasonRequired(lead.status, pendingStatus) || pendingStatus === 'nekontaktovat') && (
                    <div className="space-y-1">
                      <Label htmlFor="sl-reason" className="text-xs">
                        Důvod {isReasonRequired(lead.status, pendingStatus) && <span className="text-destructive">*</span>}
                      </Label>
                      <Textarea
                        id="sl-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        className="resize-none"
                        disabled={statusBusy}
                        placeholder="Krátké odůvodnění…"
                      />
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setPendingStatus(null); setReason(''); }}
                      disabled={statusBusy}
                    >
                      Zrušit
                    </Button>
                    <Button size="sm" onClick={confirmStatusChange} disabled={statusBusy} className="gap-1.5">
                      {statusBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Potvrdit
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {targets.map((t) => {
                    // U navrženého leadu jsou akce popsané jako rozhodnutí člověka.
                    const label =
                      lead.status === 'navrzeny' && t === 'novy'
                        ? 'Schválit návrh'
                        : STATUS_LABELS[t];
                    return (
                      <Button
                        key={t}
                        variant={lead.status === 'navrzeny' && t === 'novy' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => { setPendingStatus(t); setReason(''); }}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              )}
              {lead.status === 'navrzeny' && (
                <p className="text-[11px] text-muted-foreground">
                  Navržený lead: rozhodněte ručně — <strong>Schválit návrh</strong> (→ Nový),
                  <strong> Nekontaktovat</strong> nebo <strong>Archivován</strong>. Do oslovování ani
                  odesílání e-mailu se z návrhu nedostanete přímo — nejdřív musí projít schválením.
                </p>
              )}
              {lead.do_not_contact && lead.do_not_contact_reason && (
                <p className="text-xs text-destructive">Nekontaktovat: {lead.do_not_contact_reason}</p>
              )}
            </div>

            <Separator className="my-4" />

            {/* Zařazení / discovery (Fáze 4B) */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zařazení</div>
              {!clsEditing ? (
                <Button variant="ghost" size="sm" onClick={() => setClsEditing(true)} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Upravit
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setClsEditing(false)} disabled={clsSaving} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Zrušit
                </Button>
              )}
            </div>

            {!clsEditing ? (
              <div className="mt-2 divide-y divide-border/40">
                <ReadRow label="Skupina" value={leadGroupLabel(lead.lead_group)} />
                <ReadRow label="Kvalita" value={LEAD_QUALITY_LABELS[lead.lead_quality ?? 0] ?? String(lead.lead_quality ?? 0)} />
                <ReadRow
                  label="Zdroj nalezení"
                  value={DISCOVERY_SOURCE_OPTIONS.find((o) => o.value === lead.discovery_source)?.label ?? lead.discovery_source}
                />
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="cls-group">Skupina</Label>
                  <Select value={clsGroup} onValueChange={setClsGroup} disabled={clsSaving}>
                    <SelectTrigger id="cls-group"><SelectValue placeholder="Vyberte skupinu" /></SelectTrigger>
                    <SelectContent>
                      {LEAD_GROUP_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="cls-quality">Kvalita</Label>
                    <Select value={clsQuality} onValueChange={setClsQuality} disabled={clsSaving}>
                      <SelectTrigger id="cls-quality"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0, 1, 2, 3].map((q) => (
                          <SelectItem key={q} value={String(q)}>{q} — {LEAD_QUALITY_LABELS[q]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cls-source">Zdroj nalezení</Label>
                    <Select value={clsSource} onValueChange={setClsSource} disabled={clsSaving}>
                      <SelectTrigger id="cls-source"><SelectValue placeholder="Vyberte zdroj" /></SelectTrigger>
                      <SelectContent>
                        {DISCOVERY_SOURCE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setClsEditing(false)} disabled={clsSaving}>Zrušit</Button>
                  <Button size="sm" onClick={saveClassification} disabled={clsSaving} className="gap-1.5">
                    {clsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Uložit zařazení
                  </Button>
                </div>
              </div>
            )}

            {/* discovery_meta — jen čitelný technický kontext, ne hlavní pole */}
            {lead.discovery_meta && Object.keys(lead.discovery_meta).length > 0 && (
              <details className="mt-3 rounded-lg border border-border/50 bg-muted/20 p-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">Technický kontext nalezení (discovery_meta)</summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                  {JSON.stringify(lead.discovery_meta, null, 2)}
                </pre>
              </details>
            )}

            <Separator className="my-4" />

            {/* Údaje firmy */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Údaje firmy</div>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={startEdit} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Upravit
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Zrušit
                </Button>
              )}
            </div>

            {!editing || !form ? (
              <div className="mt-2 divide-y divide-border/40">
                <ReadRow label="Název" value={lead.company_name} />
                <ReadRow label="IČO" value={lead.ico} />
                <ReadRow label="DIČ" value={lead.dic} />
                <ReadRow label="Web" value={lead.website} />
                <ReadRow label="Obor" value={INDUSTRY_OPTIONS.find((o) => o.value === lead.industry)?.label ?? lead.industry} />
                <ReadRow label="Město" value={lead.city} />
                <ReadRow label="Velikost" value={lead.company_size} />
                <ReadRow label="Kontakt" value={lead.contact_person} />
                <ReadRow label="Funkce" value={lead.contact_role} />
                <ReadRow label="E-mail" value={lead.contact_email} />
                <ReadRow label="Telefon" value={lead.contact_phone} />
                <ReadRow label="Zdroj e-mailu" value={lead.email_source} />
                <ReadRow label="E-mail ověřen" value={lead.email_verified_by_admin ? 'Ano' : 'Ne'} />
                <ReadRow label="Poznámka" value={lead.notes} />
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="e-company_name">Název firmy <span className="text-destructive">*</span></Label>
                  <Input id="e-company_name" value={form.company_name} onChange={setField('company_name')} disabled={saving} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="e-ico">IČO</Label>
                    <Input id="e-ico" value={form.ico} onChange={setField('ico')} disabled={saving} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="e-dic">DIČ</Label>
                    <Input id="e-dic" value={form.dic} onChange={setField('dic')} disabled={saving} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="e-website">Web</Label>
                  <Input id="e-website" value={form.website} onChange={setField('website')} disabled={saving} placeholder="https://…" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="e-industry">Obor</Label>
                    <Select value={form.industry} onValueChange={(v) => setForm((p) => (p ? { ...p, industry: v } : p))} disabled={saving}>
                      <SelectTrigger id="e-industry"><SelectValue placeholder="Vyberte" /></SelectTrigger>
                      <SelectContent>
                        {INDUSTRY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="e-city">Město</Label>
                    <Input id="e-city" value={form.city} onChange={setField('city')} disabled={saving} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="e-company_size">Velikost firmy</Label>
                  <Input id="e-company_size" value={form.company_size} onChange={setField('company_size')} disabled={saving} placeholder="mikro / malá / střední / velká" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="e-contact_person">Kontaktní osoba</Label>
                    <Input id="e-contact_person" value={form.contact_person} onChange={setField('contact_person')} disabled={saving} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="e-contact_role">Funkce</Label>
                    <Input id="e-contact_role" value={form.contact_role} onChange={setField('contact_role')} disabled={saving} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="e-contact_email">E-mail</Label>
                    <Input id="e-contact_email" type="email" value={form.contact_email} onChange={setField('contact_email')} disabled={saving} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="e-contact_phone">Telefon</Label>
                    <Input id="e-contact_phone" type="tel" value={form.contact_phone} onChange={setField('contact_phone')} disabled={saving} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="e-email_source">Zdroj e-mailu</Label>
                  <Input id="e-email_source" value={form.email_source} onChange={setField('email_source')} disabled={saving} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.email_verified_by_admin}
                    onCheckedChange={(c) => setForm((p) => (p ? { ...p, email_verified_by_admin: c === true } : p))}
                    disabled={saving}
                  />
                  E-mail je ověřený veřejný firemní kontakt
                </label>
                <div className="space-y-1">
                  <Label htmlFor="e-notes">Interní poznámka</Label>
                  <Textarea id="e-notes" value={form.notes} onChange={setField('notes')} rows={3} className="resize-none" disabled={saving} maxLength={2000} />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Zrušit</Button>
                  <Button onClick={saveEdit} disabled={saving} className="gap-1.5">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Uložit
                  </Button>
                </div>
              </div>
            )}

            <Separator className="my-4" />

            {/* Kontakt firmy — dohledání veřejného e-mailu (Fáze 5B) */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kontaktní e-mail</div>
              <Button variant="outline" size="sm" onClick={runEnrich} disabled={enrichBusy} className="gap-1.5">
                {enrichBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Dohledat e-mail
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              AI dohledá jen <strong>veřejně uvedený</strong> firemní e-mail a uloží ho jako <strong>neověřený návrh</strong>.
              E-mail se nikdy nevymýšlí. Odesílací kontakt se vyplní teprve po vašem ručním schválení.
            </p>

            {lead.proposed_contact_status === 'neovereny' && lead.proposed_contact_email ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">
                    {PROPOSED_CONTACT_STATUS_LABELS.neovereny}
                  </Badge>
                  {lead.proposed_contact_by && (
                    <span className="text-[11px] text-muted-foreground">
                      Navrhl: {lead.proposed_contact_by === 'ai' ? 'AI' : 'admin'} · {formatDateTime(lead.proposed_contact_at)}
                    </span>
                  )}
                </div>
                <div className="text-sm break-all"><strong>{lead.proposed_contact_email}</strong></div>
                {lead.proposed_contact_source_url && (
                  <div className="text-xs text-muted-foreground break-all">
                    Zdroj:{' '}
                    <a
                      href={lead.proposed_contact_source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {lead.proposed_contact_source_url}
                    </a>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Ověřte, že e-mail patří firmě. Schválením se vyplní odesílací kontakt a označí jako ověřený člověkem.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reviewContact('reject')}
                    disabled={contactReviewBusy}
                    className="gap-1.5"
                  >
                    {contactReviewBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    Zamítnout e-mail
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => reviewContact('approve')}
                    disabled={contactReviewBusy}
                    className="gap-1.5"
                  >
                    {contactReviewBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Schválit e-mail
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {lead.contact_email ? (
                  <>
                    Kontaktní e-mail: <strong className="text-foreground break-all">{lead.contact_email}</strong>
                    {lead.email_verified_by_admin ? ' · ověřeno člověkem' : ' · neověřeno'}
                  </>
                ) : lead.proposed_contact_status === 'zamitnuty' ? (
                  'Poslední návrh e-mailu byl zamítnut. Můžete zkusit dohledat znovu.'
                ) : (
                  'Zatím žádný kontaktní e-mail. Použijte „Dohledat e-mail" nebo vyplňte ručně v Údajích firmy.'
                )}
              </div>
            )}

            <Separator className="my-4" />

            {/* AI příprava (Fáze 3B) — jen interní koncepty, nic se neodesílá */}
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> AI příprava
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              AI je jen asistent — výstupy ověřte. E-mail se odsud neodesílá; jde pouze o interní koncept.
            </p>

            {/* Rešerše */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Informace o firmě</span>
                <Button variant="outline" size="sm" onClick={runResearch} disabled={researchBusy} className="gap-1.5">
                  {researchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Zjistit informace o firmě
                </Button>
              </div>
              {lead.ai_research_summary ? (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="whitespace-pre-wrap text-sm">{lead.ai_research_summary}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Výstup AI — ověřte před použitím · {formatDateTime(lead.ai_research_at)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Zatím bez rešerše.</p>
              )}
            </div>

            {/* Návrh e-mailu */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Návrh oslovovacího e-mailu</span>
                <Button variant="outline" size="sm" onClick={prepareDraft} disabled={draftBusy} className="gap-1.5">
                  {draftBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  Připravit návrh e-mailu
                </Button>
              </div>
              {lead.draft_prepared_by && (
                <p className="text-[11px] text-muted-foreground">
                  Připravil: {lead.draft_prepared_by === 'ai' ? 'AI' : 'admin'}
                </p>
              )}
              <div className="space-y-1">
                <Label htmlFor="sl-draft-subject" className="text-xs">Předmět</Label>
                <Input
                  id="sl-draft-subject"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  disabled={draftBusy || draftSaving}
                  placeholder="Předmět e-mailu…"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sl-draft-body" className="text-xs">Tělo e-mailu (koncept)</Label>
                <Textarea
                  id="sl-draft-body"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  disabled={draftBusy || draftSaving}
                  rows={8}
                  className="resize-none"
                  placeholder="Tělo e-mailu — libovolně upravte…"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={saveDraft} disabled={draftSaving || draftBusy || sending} className="gap-1.5">
                  {draftSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Uložit koncept
                </Button>
                <Button
                  size="sm"
                  onClick={() => setSendConfirmOpen(true)}
                  disabled={!canSend || sending || draftSaving || draftBusy}
                  className="gap-1.5"
                  title={
                    !draftSaved
                      ? 'Nejdřív uložte koncept'
                      : !hasContactEmail
                      ? 'Lead nemá kontaktní e-mail'
                      : isDoNotContact
                      ? 'Lead je označený Nekontaktovat'
                      : 'Odeslat uložený koncept na kontaktní e-mail'
                  }
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Odeslat e-mail
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                E-mail odesíláte <strong>vy (člověk)</strong>, ne AI. Odešle se přesně uložený koncept výše na
                kontaktní e-mail leadu. Neuloží-li se koncept nebo chybí kontaktní e-mail, odeslání je zablokované.
              </p>
            </div>

            <Separator className="my-4" />

            {/* Historie */}
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Historie kontaktu</div>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Zatím žádná aktivita.</p>
            ) : (
              <ul className="space-y-2">
                {activities.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    <div>
                      <div className="font-medium">{ACTIVITY_LABELS[a.activity_type] ?? a.activity_type}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SheetContent>

      {/* Potvrzení odeslání — jasné, že odesílá člověk, ne AI */}
      <AlertDialog open={sendConfirmOpen} onOpenChange={(o) => !sending && setSendConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odeslat e-mail firmě?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Odešle se uložený koncept e-mailu na{' '}
                  <strong>{lead?.contact_email ?? '—'}</strong>
                  {lead?.company_name ? <> (firma {lead.company_name})</> : null}.
                </p>
                <p className="text-muted-foreground">
                  E-mail odesíláte <strong>vy jako člověk</strong> s oprávněním „Obchodní leady". AI e-mail nikdy
                  neodesílá. Odeslání proběhne přesně podle konceptu výše, nic se nepřegeneruje.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); sendEmail(); }}
              disabled={sending}
              className="gap-1.5"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Odeslat e-mail
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
