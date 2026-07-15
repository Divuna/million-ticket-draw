/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  ListTodo,
  MessageSquarePlus,
  PhoneCall,
  Plus,
  Sparkles,
  StickyNote,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SalesLeadEmailTemplatePicker } from './SalesLeadEmailTemplatePicker';
import {
  validateSalesLeadEmailContent,
  type SalesLeadTemplateContext,
} from './salesLeadEmailTemplates';

type Planned = {
  id: string;
  activity_type: string;
  scheduled_for: string;
  activity_status: string;
  body_snapshot: string | null;
  performed_by: string | null;
  metadata: Record<string, unknown> | null;
};
type Task = { id: string; title: string; due_at: string; status: string; task_type: 'ukol' | 'follow_up'; note: string | null; assigned_admin_id: string };
type Admin = { id: string; full_name: string | null };

const localInput = (date = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
};
const czDate = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', {
    timeZone:'Europe/Prague',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
const typeLabel = (v: string) => (v === 'meeting_logged' ? 'Schůzka' : v === 'call_logged' ? 'Telefonát' : 'Další krok');
const urgency = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const today =
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(now) ===
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(d);
  return d < now ? 'Po termínu' : today ? 'Dnes' : 'Naplánováno';
};

const RailCard = ({
  icon,
  eyebrow,
  title,
  count,
  children,
  accent = false,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  count?: number;
  children: ReactNode;
  accent?: boolean;
}) => (
  <section
    className={`rounded-2xl border p-4 shadow-[0_12px_35px_-24px_rgba(0,0,0,0.9)] ring-1 ring-black/10 transition-colors duration-150 hover:border-white/[0.13] focus-within:border-primary/35 ${
      accent ? 'border-primary/25 bg-gradient-to-br from-primary/[0.1] via-card to-card' : 'border-white/[0.09] bg-card'
    }`}
  >
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.045] text-foreground shadow-sm shadow-black/20">
          {icon}
        </div>
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</div>
          <h3 className="mt-0.5 text-[15px] font-semibold tracking-[-0.02em]">{title}</h3>
        </div>
      </div>
      {typeof count === 'number' && <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]">{count}</Badge>}
    </div>
    {children}
  </section>
);

export function LeadCrmPanel({
  leadId,
  status,
  emailApproved,
  templateContext,
  onChanged,
}: {
  leadId: string;
  status: string;
  emailApproved: boolean;
  templateContext: SalesLeadTemplateContext;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState('telefonat');
  const [result, setResult] = useState('');
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const [when, setWhen] = useState(localInput());
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<'ukol' | 'follow_up'>('ukol');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [taskNote, setTaskNote] = useState('');
  const [fuSubject, setFuSubject] = useState('');
  const [fuBody, setFuBody] = useState('');
  const [followUpComposerOpen, setFollowUpComposerOpen] = useState(false);
  const [followUpPickerOpen, setFollowUpPickerOpen] = useState(false);
  const [activityComposerOpen, setActivityComposerOpen] = useState(false);
  const [taskComposerOpen, setTaskComposerOpen] = useState(false);
  const names = useMemo(() => new Map(admins.map((a) => [a.id, a.full_name || a.id.slice(0, 8)])), [admins]);

  const load = async () => {
    const [{ data: a }, { data: t }, { data: r }] = await Promise.all([
      (supabase as any)
        .from('sales_lead_activities')
        .select('id,activity_type,scheduled_for,activity_status,body_snapshot,performed_by,metadata')
        .eq('lead_id', leadId)
        .in('activity_type', ['call_logged', 'meeting_logged', 'note_added'])
        .in('activity_status', ['naplanovano', 'rozpracovano'])
        .not('scheduled_for', 'is', null)
        .order('scheduled_for'),
      (supabase as any).from('sales_lead_tasks').select('id,title,due_at,status,task_type,note,assigned_admin_id').eq('lead_id', leadId).order('due_at'),
      (supabase as any).from('user_roles').select('user_id').in('role', ['admin', 'superadmin']),
    ]);
    setPlanned(a ?? []);
    setTasks(t ?? []);
    const ids = [...new Set((r ?? []).map((x: any) => x.user_id))] as string[];
    const { data: p } = ids.length
      ? await (supabase as any).from('profiles').select('id,full_name').in('id', ids)
      : { data: [] };
    const nm = new Map((p ?? []).map((x: any) => [x.id, x.full_name]));
    const list = ids.map((id) => ({ id, full_name: nm.get(id) ?? null }));
    setAdmins(list);
    if (!assignee && list[0]) setAssignee(list[0].id);
  };

  useEffect(() => {
    void load();
  }, [leadId]);

  const clear = () => {
    setResult('');
    setNote('');
    setNext('');
    setWhen(localInput());
    setEditing(null);
    setActivityComposerOpen(false);
  };
  const saveActivity = async () => {
    if (!result.trim() || !when) return toast.error('Doplňte účel a datum s časem.');
    setBusy(true);
    const date = new Date(when).toISOString();
    const { data } = editing
      ? await (supabase as any).rpc('sales_lead_scheduled_activity_update', {
          p_activity_id: editing,
          p_scheduled_for: date,
          p_result: result,
          p_next_step: next || null,
          p_note: note || null,
        })
      : await (supabase as any).rpc('sales_lead_log_activity', {
          p_lead_id: leadId,
          p_kind: kind,
          p_happened_at: date,
          p_result: result,
          p_next_step: next || null,
          p_note: note || null,
        });
    setBusy(false);
    if (!data?.success) return toast.error('Aktivitu se nepodařilo uložit.');
    toast.success(
      editing
        ? 'Naplánovaná aktivita upravena.'
        : data.scheduled
          ? 'Aktivita je vidět v sekci Naplánované aktivity.'
          : 'Aktivita uložena do historie.',
    );
    clear();
    await load();
    onChanged();
  };
  const edit = (a: Planned) => {
    setActivityComposerOpen(true);
    setEditing(a.id);
    setKind(a.activity_type === 'meeting_logged' ? 'schuzka' : a.activity_type === 'call_logged' ? 'telefonat' : 'poznamka');
    setWhen(localInput(new Date(a.scheduled_for)));
    setResult(String(a.metadata?.result ?? ''));
    setNext(String(a.metadata?.next_step ?? ''));
    setNote(a.body_snapshot ?? '');
  };
  const setActivityStatus = async (id: string, s: string) => {
    const { data } = await (supabase as any).rpc('sales_lead_scheduled_activity_set_status', { p_activity_id: id, p_status: s });
    if (!data?.success) return toast.error('Stav se nepodařilo změnit.');
    toast.success(s === 'dokonceno' ? 'Aktivita dokončena a přesunuta do historie.' : 'Aktivita zrušena a ponechána v historii.');
    await load();
    onChanged();
  };
  const addTask = async () => {
    if (!title || !due || !assignee) return toast.error('Vyplňte úkol, termín a odpovědnou osobu.');
    setBusy(true);
    const { data } = await (supabase as any).rpc('sales_lead_task_create', {
      p_lead_id: leadId,
      p_title: title,
      p_due_at: new Date(due).toISOString(),
      p_assigned_admin_id: assignee,
      p_note: taskNote || null,
      p_task_type: taskType,
    });
    setBusy(false);
    if (!data?.success) return toast.error('Úkol se nepodařilo vytvořit.');
    setTitle('');
    setTaskType('ukol');
    setDue('');
    setTaskNote('');
    setTaskComposerOpen(false);
    await load();
    onChanged();
  };
  const finishTask = async (id: string, s: string) => {
    const { data } = await (supabase as any).rpc('sales_lead_task_set_status', { p_task_id: id, p_status: s });
    if (!data?.success) return toast.error('Úkol se nepodařilo změnit.');
    await load();
    onChanged();
  };
  const assistFollowUp = async (action: 'personalize' | 'improve') => {
    if (action === 'improve' && (!fuSubject.trim() || !fuBody.trim())) {
      toast.error('Nejdřív vyplňte předmět a text follow-upu.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('sales-lead-draft-email', {
      body: {
        lead_id: leadId,
        mode: 'assist',
        action,
        email_type: 'follow_up',
        subject: fuSubject,
        body: fuBody,
      },
    });
    setBusy(false);
    if (error || !data?.success) return toast.error('AI úpravu follow-upu nyní nelze připravit.');
    setFuSubject(data.subject);
    setFuBody(data.body);
  };
  const openFollowUpComposer = () => {
    setFuSubject('');
    setFuBody('');
    setFollowUpComposerOpen(true);
  };
  const sendFollowUp = async () => {
    const validationErrors = validateSalesLeadEmailContent('follow_up', fuSubject, fuBody);
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }
    if (!confirm('Opravdu ručně odeslat tento follow-up?')) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('send-sales-lead-follow-up', {
      body: { lead_id: leadId, subject: fuSubject, body: fuBody },
    });
    setBusy(false);
    if (error || !data?.success) return toast.error(`Follow-up nebyl odeslán (${data?.error ?? 'chyba'}).`);
    toast.success('Follow-up odeslán.');
    setFuSubject('');
    setFuBody('');
    setFollowUpComposerOpen(false);
    onChanged();
  };
  const followUpValidationErrors = validateSalesLeadEmailContent('follow_up', fuSubject, fuBody);

  return (
    <div className="space-y-3.5">
      <RailCard icon={<CalendarClock className="h-4 w-4" />} eyebrow="Upcoming" title="Naplánované aktivity" count={planned.length} accent>
        {planned.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/[0.09] bg-background/45 px-3.5 py-3 text-left">
            <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            <p className="text-xs leading-relaxed text-muted-foreground">Žádná naplánovaná aktivita.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {planned.map((a, i) => (
              <article
                key={a.id}
                className={`rounded-xl border bg-background/70 p-3 transition-colors duration-150 hover:bg-background/90 ${new Date(a.scheduled_for) < new Date() ? 'border-destructive/60' : 'border-white/[0.09]'}`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="rounded-full text-[9px]">{typeLabel(a.activity_type)}</Badge>
                  <Badge variant={new Date(a.scheduled_for) < new Date() ? 'destructive' : 'secondary'} className="rounded-full text-[9px]">
                    {i === 0 ? urgency(a.scheduled_for) : new Date(a.scheduled_for) < new Date() ? 'Po termínu' : 'Později'}
                  </Badge>
                </div>
                <div className="mt-2 text-sm font-semibold">{czDate(a.scheduled_for)}</div>
                <div className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                  <div><span className="font-medium text-foreground">Výsledek:</span> {String(a.metadata?.result ?? '—')}</div>
                  <div><span className="font-medium text-foreground">Další krok:</span> {String(a.metadata?.next_step ?? '—')}</div>
                  {a.body_snapshot && <div>{a.body_snapshot}</div>}
                  <div className="text-[10px]">Autor: {a.performed_by ? names.get(a.performed_by) || a.performed_by.slice(0, 8) : 'Systém'}</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 px-2 text-[10px]" onClick={() => edit(a)}>Upravit</Button>
                  <Button size="sm" variant="outline" className="h-8 px-2 text-[10px]" onClick={() => setActivityStatus(a.id, a.activity_status === 'rozpracovano' ? 'naplanovano' : 'rozpracovano')}>{a.activity_status === 'rozpracovano' ? 'Vrátit k čekání' : 'Začít'}</Button>
                  <Button size="sm" className="h-8 px-2 text-[10px]" onClick={() => setActivityStatus(a.id, 'dokonceno')}><Check className="mr-1 h-3 w-3" />Hotovo</Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-[10px]" onClick={() => setActivityStatus(a.id, 'zruseno')}><X className="mr-1 h-3 w-3" />Zrušit</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </RailCard>

      <RailCard icon={<PhoneCall className="h-4 w-4" />} eyebrow="Log" title={editing ? 'Upravit aktivitu' : 'Zapsat aktivitu'}>
        {!editing && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'telefonat', label: 'Zavolat', icon: <PhoneCall className="h-4 w-4" /> },
              { value: 'schuzka', label: 'Schůzka', icon: <CalendarDays className="h-4 w-4" /> },
              { value: 'poznamka', label: 'Poznámka', icon: <StickyNote className="h-4 w-4" /> },
            ].map((action) => (
              <Button
                key={action.value}
                variant={activityComposerOpen && kind === action.value ? 'default' : 'outline'}
                className="h-auto flex-col gap-2 rounded-xl border-white/[0.09] bg-background/55 px-2 py-3 text-[11px] transition-colors duration-150 hover:border-primary/30 hover:bg-background/80 focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => { setKind(action.value); setActivityComposerOpen(true); }}
              >
                {action.icon}{action.label}
              </Button>
            ))}
          </div>
        )}
        {activityComposerOpen && (
        <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4">
          <div className="grid grid-cols-2 gap-2">
            <Select value={kind} onValueChange={setKind} disabled={!!editing}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="telefonat">Telefonát</SelectItem>
                <SelectItem value="schuzka">Schůzka</SelectItem>
                <SelectItem value="poznamka">Další krok / poznámka</SelectItem>
              </SelectContent>
            </Select>
            <Input className="h-9 text-xs" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <Input className="h-9 text-xs" placeholder="Účel nebo výsledek" value={result} onChange={(e) => setResult(e.target.value)} />
          <Input className="h-9 text-xs" placeholder="Následující krok (volitelný)" value={next} onChange={(e) => setNext(e.target.value)} />
          <Textarea className="min-h-20 resize-none text-xs" placeholder="Poznámka (volitelná)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" className="h-8 flex-1 text-xs" disabled={busy} onClick={saveActivity}>
              <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />{editing ? 'Uložit změny' : 'Uložit aktivitu'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => editing ? clear() : setActivityComposerOpen(false)}>Zrušit</Button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">Čas zadáváte v českém čase. Budoucí termín se přesune mezi naplánované aktivity.</p>
        </div>
        )}
      </RailCard>

      <RailCard icon={<ListTodo className="h-4 w-4" />} eyebrow="Tasks" title="Úkoly a připomenutí" count={tasks.filter((t) => ['ceka','rozpracovano'].includes(t.status)).length}>
        {tasks.length > 0 && (
          <div className="mb-3 space-y-2">
            {tasks.map((t) => (
              <div
                key={t.id}
                className={`rounded-xl border p-3 transition-colors duration-150 ${['ceka','rozpracovano'].includes(t.status) && new Date(t.due_at) < new Date() ? 'border-destructive/50 bg-destructive/5' : 'border-white/[0.08] bg-background/55 hover:border-white/[0.12]'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium leading-snug">{t.title}</span>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="shrink-0 rounded-full text-[9px]">{t.task_type === 'follow_up' ? 'Follow-up' : 'Úkol'}</Badge>
                    <Badge variant="outline" className="shrink-0 rounded-full text-[9px]">{t.status === 'rozpracovano' ? 'Rozpracováno' : t.status === 'ceka' ? 'Čeká' : t.status === 'dokonceno' ? 'Dokončeno' : 'Zrušeno'}</Badge>
                  </div>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">{czDate(t.due_at)}</div>
                {['ceka','rozpracovano'].includes(t.status) && (
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => finishTask(t.id, t.status === 'rozpracovano' ? 'ceka' : 'rozpracovano')}>{t.status === 'rozpracovano' ? 'Čekat' : 'Začít'}</Button>
                    <Button size="sm" variant="outline" className="h-7 flex-1 text-[10px]" onClick={() => finishTask(t.id, 'dokonceno')}><CheckCircle2 className="mr-1 h-3 w-3" />Dokončit</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => finishTask(t.id, 'zruseno')}>Zrušit</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {tasks.length === 0 && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-dashed border-white/[0.09] bg-background/45 px-3.5 py-3 text-xs text-muted-foreground">
            <ListTodo className="h-4 w-4 shrink-0 opacity-60" />Žádné otevřené úkoly.
          </div>
        )}
        {!taskComposerOpen && (
          <Button variant="outline" className="h-9 w-full rounded-xl border-dashed border-white/[0.11] bg-background/55 text-xs transition-colors duration-150 hover:border-primary/30 hover:bg-background/80 focus-visible:ring-2 focus-visible:ring-primary/40" onClick={() => setTaskComposerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />Nový úkol
          </Button>
        )}
        {taskComposerOpen && (
        <div className="space-y-2 border-t border-white/[0.07] pt-4">
          <Select value={taskType} onValueChange={(value) => setTaskType(value as 'ukol' | 'follow_up')}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ukol">Úkol</SelectItem><SelectItem value="follow_up">Follow-up</SelectItem></SelectContent>
          </Select>
          <Input className="h-9 text-xs" placeholder="Název úkolu" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input className="h-9 text-xs" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Odpovědný administrátor" /></SelectTrigger>
            <SelectContent>{admins.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name || a.id.slice(0, 8)}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="h-9 text-xs" placeholder="Poznámka" value={taskNote} onChange={(e) => setTaskNote(e.target.value)} />
          <div className="flex gap-2">
            <Button className="h-9 flex-1 text-xs" size="sm" disabled={busy} onClick={addTask}><Plus className="mr-1.5 h-3.5 w-3.5" />Vytvořit úkol</Button>
            <Button className="h-9 text-xs" size="sm" variant="ghost" onClick={() => setTaskComposerOpen(false)}>Zrušit</Button>
          </div>
        </div>
        )}
      </RailCard>

      <RailCard icon={<Sparkles className="h-4 w-4" />} eyebrow="Follow-up" title="Navázat bez odpovědi">
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">E-mail můžete napsat ručně nebo volitelně vložit šablonu. AI upraví pouze text v editoru a nic sama neodešle.</p>
        <div className="grid gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full rounded-xl text-xs transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/40"
            disabled={!['osloveno', 'follow_up'].includes(status) || !emailApproved || busy}
            onClick={openFollowUpComposer}
          >
            <Mail className="mr-1.5 h-3.5 w-3.5" />Napsat follow-up
          </Button>
        </div>
        {followUpComposerOpen && (
          <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" className="h-8 w-full text-xs" disabled={busy} onClick={() => setFollowUpPickerOpen(true)}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />Použít šablonu
              </Button>
              <Button type="button" variant="outline" className="h-8 w-full text-xs" disabled={busy || !fuSubject.trim() || !fuBody.trim()} onClick={() => void assistFollowUp('personalize')}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />Personalizovat pro firmu
              </Button>
            </div>
            <Label className="text-xs">Předmět</Label>
            <Input className="h-9 text-xs" value={fuSubject} onChange={(e) => setFuSubject(e.target.value)} />
            <Label className="text-xs">Text</Label>
            <Textarea className="resize-none text-xs" rows={7} value={fuBody} onChange={(e) => setFuBody(e.target.value)} />
            <Button type="button" variant="outline" className="h-8 w-full text-xs" disabled={busy || !fuBody.trim()} onClick={() => void assistFollowUp('improve')}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />Vylepšit text
            </Button>
            {followUpValidationErrors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-[11px] text-destructive">
                {followUpValidationErrors.map((error) => <div key={error}>{error}</div>)}
              </div>
            )}
            <Button className="h-8 w-full text-xs" disabled={busy || followUpValidationErrors.length > 0} onClick={sendFollowUp}>Ručně odeslat follow-up</Button>
          </div>
        )}
      </RailCard>
      <SalesLeadEmailTemplatePicker
        open={followUpPickerOpen}
        onOpenChange={setFollowUpPickerOpen}
        type="follow_up"
        context={templateContext}
        onSelect={(value) => {
          setFuSubject(value.subject);
          setFuBody(value.body);
          setFollowUpComposerOpen(true);
          setFollowUpPickerOpen(false);
          if (value.unresolved.length > 0) toast.warning(`Doplňte proměnné: ${value.unresolved.join(', ')}`);
          else toast.success(`Šablona „${value.templateName}“ byla vložena do editoru.`);
        }}
      />
    </div>
  );
}
