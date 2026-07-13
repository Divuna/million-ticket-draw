import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  type DuplicateConflict,
} from './salesLeadsShared';
import { DuplicateConflictAlert } from './DuplicateConflictAlert';
import { LeadCrmPanel } from './LeadCrmPanel';

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
  /** 'outbound' | 'inbound' | 'internal' — rozlišuje směr e-mailové komunikace. */
  direction: string | null;
  created_at: string | null;
  scheduled_for: string | null;
  activity_status: string | null;
  performed_by: string | null;
  subject: string | null;
  /** Plný snapshot těla e-mailu. Zobrazuje se zkráceně, v DB se NIKDY neořezává. */
  body_snapshot: string | null;
  /** U `reply_received`: NULL = nepřečteno, vyplněno = přečteno. */
  read_at: string | null;
  metadata: Record<string, unknown> | null;
}

const DETAIL_COLUMNS =
  'id, company_name, industry, city, status, contact_email, updated_at, assigned_admin_id, ' +
  'ico, dic, website, company_size, contact_person, contact_role, contact_phone, email_source, ' +
  'email_verified_by_admin, do_not_contact, do_not_contact_reason, notes, created_at, ' +
  'ai_research_summary, ai_research_at, draft_email_subject, draft_email_body, draft_prepared_by, ' +
  'lead_group, lead_quality, discovery_source, discovery_meta, website_verification_status, website_verification_source, website_confidence, website_verified_at, website_verification_evidence, alternative_websites, contact_data_provenance, ' +
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
  converted: 'Spolupráce potvrzena',
  note_added: 'Přidána poznámka',
  lead_discovered: 'Firma automaticky navržena',
  contact_proposed: 'Navržen kontaktní e-mail',
  contact_approved: 'Kontaktní e-mail schválen',
  contact_rejected: 'Návrh kontaktu zamítnut',
  // Příchozí odpovědi firem zapisuje EF `sales-lead-inbound` (Resend Receiving
  // API) a stav posouvá RPC `sales_lead_mark_replied`.
  reply_received: 'Odpověď přijata',
  // NEIMPLEMENTOVÁNO: tyto typy jsou povolené v DB CHECK constraintu od Fáze 1,
  // ale žádná cesta v aplikaci je zatím nezakládá. Popisky tu jsou proto, aby
  // se v historii nikdy nezobrazil syrový kód, kdyby takový řádek vznikl.
  email_failed: 'Odeslání e-mailu selhalo',
  call_logged: 'Zaznamenán hovor',
  duplicate_override_confirmed: 'Potvrzena výjimka duplicity',
  meeting_logged: 'Zaznamenána schůzka',
  task_created: 'Úkol vytvořen', task_completed: 'Úkol dokončen', task_cancelled: 'Úkol zrušen',
  email_delivered: 'E-mail doručen', email_delivery_delayed: 'Doručení e-mailu zpožděno',
  email_bounced: 'E-mail se vrátil jako nedoručený', email_suppressed: 'E-mail byl potlačen',
};

/** Typy aktivit, které představují e-mailovou zprávu (mají směr, předmět a tělo). */
const EMAIL_ACTIVITY_TYPES = new Set(['email_sent', 'reply_received']);

/**
 * Rozdělí tělo e-mailu na vlastní text a citovanou část původního vlákna.
 * Detekce je konzervativní: hledá první řádek začínající `>` (klasický quote
 * marker, který používá Gmail i většina klientů). Pokud žádný není, vrátí
 * celé tělo jako `main`. NIKDY nemění data v DB — jde čistě o zobrazení.
 */
const splitQuotedReply = (body: string): { main: string; quoted: string | null } => {
  const lines = body.split('\n');
  const firstQuoted = lines.findIndex((l) => l.trimStart().startsWith('>'));
  if (firstQuoted === -1) return { main: body, quoted: null };
  const main = lines.slice(0, firstQuoted).join('\n').replace(/\s+$/, '');
  const quoted = lines.slice(firstQuoted).join('\n');
  return { main: main.length > 0 ? main : body, quoted: main.length > 0 ? quoted : null };
};

/** Nad tuto délku se hlavní text sbalí a nabídne „Zobrazit celý e-mail“. */
const BODY_PREVIEW_CHARS = 320;

const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/**
 * Jedna e-mailová zpráva ve vlákně historie kontaktu.
 * Odchozí (`outbound`) a příchozí (`inbound`) se liší barvou i orientací.
 * Dlouhý text i citovaná část původního vlákna jsou sbalené.
 */
const EmailActivityItem = ({
  activity,
  onReply,
  replyForm,
}: {
  activity: ActivityRow;
  onReply?: (activity: ActivityRow) => void;
  /** Formulář odpovědi — renderuje se přímo pod TOUTO zprávou, jen když je otevřený. */
  replyForm?: ReactNode;
}) => {
  const [showFullBody, setShowFullBody] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);

  const isInbound = activity.direction === 'inbound';
  // Nepřečtená příchozí odpověď — zvýrazní se a označí štítkem „Nové".
  const isUnread = activity.activity_type === 'reply_received' && !activity.read_at;
  const counterparty =
    (isInbound ? activity.metadata?.from : activity.metadata?.to) ?? null;

  const body = activity.body_snapshot ?? '';
  const { main, quoted } = splitQuotedReply(body);
  const isLong = main.length > BODY_PREVIEW_CHARS;
  const visibleMain = isLong && !showFullBody ? `${main.slice(0, BODY_PREVIEW_CHARS).trimEnd()}…` : main;

  return (
    <li className="flex">
      <div
        className={
          isUnread
            ? 'w-full rounded-lg border-2 border-destructive/60 bg-destructive/5 p-3'
            : isInbound
            ? 'w-full rounded-lg border border-primary/30 bg-primary/5 p-3'
            : 'w-full rounded-lg border border-border bg-muted/30 p-3'
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {ACTIVITY_LABELS[activity.activity_type] ?? activity.activity_type}
          </span>
          <span
            className={
              isInbound
                ? 'rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary'
                : 'rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'
            }
          >
            {isInbound ? 'Příchozí' : 'Odchozí'}
          </span>
          {isUnread && (
            <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">
              Nové
            </span>
          )}
        </div>

        {typeof counterparty === 'string' && counterparty.length > 0 && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {isInbound ? 'Od' : 'Komu'}: {counterparty}
          </div>
        )}
        {activity.subject && (
          <div className="text-xs text-muted-foreground">Předmět: {activity.subject}</div>
        )}

        {body.length > 0 ? (
          <div className="mt-2 whitespace-pre-wrap break-words rounded border border-border/60 bg-background/60 p-2 text-sm">
            {visibleMain}
            {isLong && (
              <button
                type="button"
                onClick={() => setShowFullBody((v) => !v)}
                className="mt-1 block text-xs font-medium text-primary hover:underline"
              >
                {showFullBody ? 'Zobrazit méně' : 'Zobrazit celý e-mail'}
              </button>
            )}
            {quoted && (
              <>
                <button
                  type="button"
                  onClick={() => setShowQuoted((v) => !v)}
                  className="mt-1 block text-xs font-medium text-muted-foreground hover:underline"
                >
                  {showQuoted ? 'Skrýt citovanou část' : 'Zobrazit citovanou část'}
                </button>
                {showQuoted && (
                  <div className="mt-1 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                    {quoted}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="mt-2 text-xs italic text-muted-foreground">Text zprávy není k dispozici.</div>
        )}

        <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(activity.created_at)}</div>
        {/* Tlačítko „Odpovědět" jen když formulář NENÍ otevřený u této zprávy. */}
        {isInbound && onReply && !replyForm && (
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onReply(activity)}>
            Odpovědět
          </Button>
        )}
        {/* Formulář odpovědi — přímo pod zprávou, na kterou uživatel klikl. */}
        {replyForm}
      </div>
    </li>
  );
};

/**
 * Formulář odpovědi zobrazený inline pod vybranou příchozí zprávou.
 * Po otevření sám odscrolluje do zorného pole. Odesílání i serverovou ochranu
 * (EF `send-sales-lead-reply`) řídí rodič přes `onSend` — zde se nemění.
 */
const InlineReplyForm = ({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  onSend,
  onCancel,
  sending,
  repliedToAt,
}: {
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
  sending: boolean;
  repliedToAt: string | null;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);
  return (
    <div ref={ref} className="mt-3 space-y-3 rounded-lg border border-primary/40 bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Odpověď na e-mail z {formatDateTime(repliedToAt)}</div>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={sending}>Zrušit</Button>
      </div>
      <div className="space-y-1">
        <Label htmlFor="reply-subject">Předmět</Label>
        <Input id="reply-subject" value={subject} onChange={(e) => onSubjectChange(e.target.value)} disabled={sending} maxLength={300} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="reply-body">Text odpovědi</Label>
        <Textarea id="reply-body" value={body} onChange={(e) => onBodyChange(e.target.value)} disabled={sending} rows={6} maxLength={20000} />
      </div>
      <div className="flex justify-end">
        <Button onClick={onSend} disabled={sending || !subject.trim() || !body.trim()} className="gap-1.5">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Odeslat odpověď
        </Button>
      </div>
    </div>
  );
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
  const [activityAuthors, setActivityAuthors] = useState<Record<string,string>>({});
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
  const [duplicateConflicts, setDuplicateConflicts] = useState<DuplicateConflict[]>([]);
  const [overrideReason, setOverrideReason] = useState('');
  const [replyToActivity, setReplyToActivity] = useState<ActivityRow | null>(null);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replySending, setReplySending] = useState(false);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const [{ data: leadData, error: leadErr }, { data: actData }] = await Promise.all([
        (supabase as any).from('sales_leads').select(DETAIL_COLUMNS).eq('id', leadId).single(),
        (supabase as any)
          .from('sales_lead_activities')
          .select('id, activity_type, direction, created_at, scheduled_for, activity_status, performed_by, subject, body_snapshot, read_at, metadata')
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
      const authorIds = [...new Set(((actData ?? []) as ActivityRow[]).map(a => a.performed_by).filter(Boolean))] as string[];
      if (authorIds.length > 0) {
        const { data: profiles } = await (supabase as any).from('profiles').select('id,full_name').in('id', authorIds);
        setActivityAuthors(Object.fromEntries((profiles ?? []).map((p: {id:string;full_name:string|null}) => [p.id, p.full_name ?? p.id.slice(0,8)])));
      } else setActivityAuthors({});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nepodařilo se načíst detail';
      toast.error(msg);
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  // Po otevření detailu označí nepřečtené odpovědi jako přečtené. Záměrně
  // NEnačítá znovu aktivity — zvýraznění „Nové" tak zůstane vidět v otevřeném
  // detailu, ale globální počet (nav badge, karta, seznam) klesne ihned.
  // Nikdy nemění stav leadu (`jednani`/`odpovedel` beze změny).
  const markRepliesRead = useCallback(async () => {
    if (!leadId) return;
    try {
      const { data } = await (supabase as any).rpc('sales_lead_mark_replies_read', { p_lead_id: leadId });
      const res = (data ?? {}) as { success?: boolean; marked_count?: number };
      if (res.success && (res.marked_count ?? 0) > 0) {
        window.dispatchEvent(new Event('sales-leads-unread-changed'));
        onMutated();
      }
    } catch {
      // best-effort — zvýraznění zůstává, upozornění se aktualizuje při dalším načtení
    }
  }, [leadId, onMutated]);

  useEffect(() => {
    if (open && leadId) {
      setEditing(false);
      setPendingStatus(null);
      setReason('');
      setDuplicateConflicts([]);
      setOverrideReason('');
      setReplyToActivity(null);
      void (async () => {
        await load();
        await markRepliesRead();
      })();
    }
  }, [open, leadId, load, markRepliesRead]);

  const startEdit = () => {
    if (lead) {
      setForm(toForm(lead));
      setEditing(true);
    }
  };

  const setField =
    (field: keyof EditForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (field === 'contact_email') { setDuplicateConflicts([]); setOverrideReason(''); }
      setForm((prev) => (prev ? { ...prev, [field]: e.target.value } : prev));
    };

  const previewDuplicate = async () => {
    if (!lead || !form?.contact_email.trim().includes('@')) return;
    const { data } = await (supabase as any).rpc('sales_lead_check_duplicate', {
      p_contact_email: form.contact_email.trim(), p_exclude_lead_id: lead.id,
    });
    const res = (data ?? {}) as { success?: boolean; conflicts?: DuplicateConflict[] };
    if (res.success) setDuplicateConflicts(res.conflicts ?? []);
  };

  const saveEdit = async (confirmOverride = false) => {
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
        p_duplicate_override: confirmOverride,
        p_duplicate_override_reason: confirmOverride ? overrideReason.trim() : null,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string; conflicts?: DuplicateConflict[] };
      if (!res.success) {
        if (res.error === 'duplicate_conflict' || res.error === 'duplicate_override_reason_required') {
          setDuplicateConflicts(res.conflicts ?? []);
        }
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      toast.success('Údaje uloženy');
      setEditing(false);
      setDuplicateConflicts([]);
      setOverrideReason('');
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Uložení se nezdařilo';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const confirmEditOverride = async () => {
    if (overrideReason.trim().length < 3) {
      toast.error('Uveďte důvod výjimky alespoň 3 znaky.');
      return;
    }
    await saveEdit(true);
  };

  const startReply = (activity: ActivityRow) => {
    setReplyToActivity(activity);
    setReplySubject(activity.subject?.toLowerCase().startsWith('re:') ? activity.subject : `Re: ${activity.subject ?? ''}`);
    setReplyBody('');
  };

  const sendReply = async () => {
    if (!lead || !replyToActivity || !replySubject.trim() || !replyBody.trim()) {
      toast.error('Vyplňte předmět i text odpovědi.');
      return;
    }
    setReplySending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-sales-lead-reply', {
        body: { lead_id: lead.id, reply_to_activity_id: replyToActivity.id, subject: replySubject.trim(), body: replyBody.trim() },
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string; warning?: string };
      if (!res.success) { toast.error(rpcErrorMessage(res.error)); return; }
      if (res.warning) toast.warning(rpcErrorMessage(res.warning));
      else toast.success('Odpověď byla odeslána.');
      setReplyToActivity(null); setReplyBody(''); setReplySubject('');
      await load(); onMutated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Odpověď se nepodařilo odeslat.');
    } finally { setReplySending(false); }
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
  // activities je řazeno created_at DESC → první email_sent je ten poslední.
  const lastEmailSent = activities.find((a) => a.activity_type === 'email_sent') ?? null;

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

  const ReadRow = ({ label, value, href }: { label: string; value: string | null | undefined; href?: string | null }) => {
    const linkHref = href && value
      ? (/^https?:\/\//i.test(href) ? href : `https://${href}`)
      : null;
    return (
      <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="col-span-2 break-words">
          {linkHref ? (
            <a
              href={linkHref}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary underline underline-offset-2 hover:opacity-80"
            >
              {value}
            </a>
          ) : (
            value || '—'
          )}
        </span>
      </div>
    );
  };

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
                <ReadRow label="Web" value={lead.website} href={lead.website} />
                <ReadRow label="Stav webu" value={lead.website_verification_status === 'overeny' ? 'Ověřený' : 'Neověřený web'} />
                <ReadRow label="Zdroj webu" value={lead.website_verification_source} />
                <ReadRow label="Důvěra webu" value={lead.website_confidence == null ? null : `${lead.website_confidence} %`} />
                <ReadRow label="Ověřeno" value={lead.website_verified_at ? formatDateTime(lead.website_verified_at) : null} />
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
                    <Input id="e-contact_email" type="email" value={form.contact_email} onChange={setField('contact_email')}
                      onBlur={previewDuplicate} disabled={saving} />
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
                <DuplicateConflictAlert conflicts={duplicateConflicts} reason={overrideReason}
                  onReasonChange={setOverrideReason} disabled={saving} />
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Zrušit</Button>
                  <Button onClick={duplicateConflicts.length > 0 ? confirmEditOverride : () => saveEdit(false)}
                    variant={duplicateConflicts.length > 0 ? 'destructive' : 'default'} disabled={saving} className="gap-1.5">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {duplicateConflicts.length > 0 ? 'Potvrdit výjimku a pokračovat' : 'Uložit'}
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
              {lastEmailSent && (
                <p className="text-[11px] text-muted-foreground">
                  Poslední e-mail odeslán: <strong className="text-foreground">{formatDateTime(lastEmailSent.created_at)}</strong>
                  {typeof lastEmailSent.metadata?.to === 'string' ? (
                    <> na <strong className="text-foreground">{lastEmailSent.metadata?.to as string}</strong></>
                  ) : null}
                </p>
              )}
            </div>

            <Separator className="my-4" />

            <LeadCrmPanel leadId={lead.id} status={lead.status} emailApproved={lead.email_verified_by_admin} onChanged={() => { void load(); onMutated(); }} />

            {/* Historie */}
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Historie kontaktu</div>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Zatím žádná aktivita.</p>
            ) : (
              <ul className="space-y-2">
                {activities.filter((a) => !(a.activity_status === 'naplanovano' && a.scheduled_for && new Date(a.scheduled_for) > new Date())).map((a) =>
                  EMAIL_ACTIVITY_TYPES.has(a.activity_type) ? (
                    // E-mailová zpráva — plné vlákno (odesílatel/příjemce, předmět, text).
                    <EmailActivityItem
                      key={a.id}
                      activity={a}
                      onReply={startReply}
                      replyForm={
                        replyToActivity?.id === a.id ? (
                          <InlineReplyForm
                            subject={replySubject}
                            body={replyBody}
                            onSubjectChange={setReplySubject}
                            onBodyChange={setReplyBody}
                            onSend={sendReply}
                            onCancel={() => setReplyToActivity(null)}
                            sending={replySending}
                            repliedToAt={replyToActivity.created_at}
                          />
                        ) : undefined
                      }
                    />
                  ) : (
                    // Systémová aktivita — tenký řádek mezi zprávami.
                    <li key={a.id} className={a.activity_type === 'duplicate_override_confirmed'
                      ? 'rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm'
                      : 'flex items-start gap-2 text-sm'}>
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                      <div>
                        <div className="font-medium">{ACTIVITY_LABELS[a.activity_type] ?? a.activity_type}</div>
                        {['call_logged','meeting_logged','note_added'].includes(a.activity_type) && (
                          <div className="mt-1 space-y-0.5 text-xs">
                            <div><strong>Datum a čas:</strong> {formatDateTime(a.scheduled_for ?? a.created_at)}</div>
                            <div><strong>Účel/výsledek:</strong> {String(a.metadata?.result ?? '—')}</div>
                            <div><strong>Poznámka:</strong> {a.body_snapshot ?? '—'}</div>
                            <div><strong>Následující krok:</strong> {String(a.metadata?.next_step ?? '—')}</div>
                            <div><strong>Stav:</strong> {a.activity_status === 'zruseno' ? 'Zrušeno' : a.activity_status === 'dokonceno' ? 'Dokončeno' : 'Naplánováno'}</div>
                            <div><strong>Autor:</strong> {a.performed_by ? activityAuthors[a.performed_by] ?? a.performed_by.slice(0,8) : 'Systém'}</div>
                          </div>
                        )}
                        {a.activity_type === 'duplicate_override_confirmed' && (
                          <div className="mt-1 space-y-1 text-xs">
                            <div>Důvod: {String(a.metadata?.reason ?? '—')}</div>
                            {Array.isArray(a.metadata?.conflicts) && (a.metadata?.conflicts as DuplicateConflict[]).map((c) => (
                              <div key={`${c.lead_id}-${c.match_type}`}>
                                Původní lead: <strong>{c.company_name}</strong> · {c.contact_email ?? '—'} · první oslovení {formatDateTime(c.first_contacted_at)}
                              </div>
                            ))}
                          </div>
                        )}
                        {!['call_logged','meeting_logged','note_added'].includes(a.activity_type) && <div className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</div>}
                      </div>
                    </li>
                  ),
                )}
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
