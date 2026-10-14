/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, CirclePlay, Clock3, ExternalLink, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  completedToday,
  SALES_LEAD_TIME_ZONE,
  toLocalDateTimeInput,
  workQueueBucket,
  type WorkQueueBucket,
} from './salesLeadWorkQueue';

type TaskRow = {
  id: string;
  lead_id: string;
  title: string;
  due_at: string;
  assigned_admin_id: string;
  status: 'ceka' | 'rozpracovano' | 'dokonceno';
  task_type: 'ukol' | 'follow_up';
  completed_at: string | null;
};

type ActivityRow = {
  id: string;
  lead_id: string;
  activity_type: 'call_logged' | 'meeting_logged' | 'note_added';
  scheduled_for: string;
  activity_status: 'naplanovano' | 'rozpracovano' | 'dokonceno';
  performed_by: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type WorkItem = {
  id: string;
  source: 'task' | 'activity';
  leadId: string;
  company: string;
  title: string;
  type: 'ukol' | 'follow_up' | 'telefonat' | 'schuzka' | 'dalsi_krok';
  dueAt: string;
  responsibleId: string | null;
  responsible: string;
  status: 'ceka' | 'rozpracovano' | 'dokonceno';
  completedAt: string | null;
};

const TYPE_LABELS: Record<WorkItem['type'], string> = {
  ukol: 'Úkol',
  follow_up: 'Follow-up',
  telefonat: 'Telefonát',
  schuzka: 'Schůzka',
  dalsi_krok: 'Další krok',
};

const STATUS_LABELS: Record<WorkItem['status'], string> = {
  ceka: 'Čeká',
  rozpracovano: 'Rozpracováno',
  dokonceno: 'Dokončeno',
};

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('cs-CZ', {
    timeZone: SALES_LEAD_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

const typeForActivity = (type: ActivityRow['activity_type']): WorkItem['type'] =>
  type === 'call_logged' ? 'telefonat' : type === 'meeting_logged' ? 'schuzka' : 'dalsi_krok';

const titleForActivity = (activity: ActivityRow): string => {
  const result = activity.metadata?.result;
  return typeof result === 'string' && result.trim() ? result : TYPE_LABELS[typeForActivity(activity.activity_type)];
};

export function SalesLeadToday({ onOpenLead }: { onOpenLead: (leadId: string) => void }) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<'due' | 'upcoming' | 'completed'>('due');
  const [rescheduling, setRescheduling] = useState<WorkItem | null>(null);
  const [newDueAt, setNewDueAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const recent = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    try {
      const [openTasks, completedTasks, openActivities, completedActivities] = await Promise.all([
        (supabase as any)
          .from('sales_lead_tasks')
          .select('id,lead_id,title,due_at,assigned_admin_id,status,task_type,completed_at')
          .in('status', ['ceka', 'rozpracovano'])
          .order('due_at'),
        (supabase as any)
          .from('sales_lead_tasks')
          .select('id,lead_id,title,due_at,assigned_admin_id,status,task_type,completed_at')
          .eq('status', 'dokonceno')
          .gte('completed_at', recent)
          .order('completed_at', { ascending: false }),
        (supabase as any)
          .from('sales_lead_activities')
          .select('id,lead_id,activity_type,scheduled_for,activity_status,performed_by,completed_at,metadata')
          .in('activity_type', ['call_logged', 'meeting_logged', 'note_added'])
          .in('activity_status', ['naplanovano', 'rozpracovano'])
          .not('scheduled_for', 'is', null)
          .order('scheduled_for'),
        (supabase as any)
          .from('sales_lead_activities')
          .select('id,lead_id,activity_type,scheduled_for,activity_status,performed_by,completed_at,metadata')
          .in('activity_type', ['call_logged', 'meeting_logged', 'note_added'])
          .eq('activity_status', 'dokonceno')
          .not('scheduled_for', 'is', null)
          .gte('completed_at', recent)
          .order('completed_at', { ascending: false }),
      ]);

      const firstError = [openTasks, completedTasks, openActivities, completedActivities].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      const tasks = [...(openTasks.data ?? []), ...(completedTasks.data ?? [])] as TaskRow[];
      const activities = [...(openActivities.data ?? []), ...(completedActivities.data ?? [])] as ActivityRow[];
      const leadIds = [...new Set([...tasks.map((row) => row.lead_id), ...activities.map((row) => row.lead_id)])];
      const adminIds = [...new Set([
        ...tasks.map((row) => row.assigned_admin_id),
        ...activities.map((row) => row.performed_by).filter(Boolean),
      ])] as string[];

      const [leadsResult, profilesResult] = await Promise.all([
        leadIds.length
          ? (supabase as any).from('sales_leads').select('id,company_name').in('id', leadIds)
          : Promise.resolve({ data: [], error: null }),
        adminIds.length
          ? (supabase as any).from('profiles').select('id,full_name').in('id', adminIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (leadsResult.error) throw leadsResult.error;

      const companies = new Map((leadsResult.data ?? []).map((row: any) => [row.id, row.company_name]));
      const names = new Map((profilesResult.data ?? []).map((row: any) => [row.id, row.full_name]));
      const nameFor = (id: string | null) => id ? names.get(id) || `Admin ${id.slice(0, 8)}` : 'Systém';

      const normalized: WorkItem[] = [
        ...tasks.map((task) => ({
          id: task.id,
          source: 'task' as const,
          leadId: task.lead_id,
          company: companies.get(task.lead_id) || 'Neznámá firma',
          title: task.title,
          type: task.task_type,
          dueAt: task.due_at,
          responsibleId: task.assigned_admin_id,
          responsible: nameFor(task.assigned_admin_id),
          status: task.status,
          completedAt: task.completed_at,
        })),
        ...activities.map((activity) => ({
          id: activity.id,
          source: 'activity' as const,
          leadId: activity.lead_id,
          company: companies.get(activity.lead_id) || 'Neznámá firma',
          title: titleForActivity(activity),
          type: typeForActivity(activity.activity_type),
          dueAt: activity.scheduled_for,
          responsibleId: activity.performed_by,
          responsible: nameFor(activity.performed_by),
          status: activity.activity_status === 'naplanovano' ? 'ceka' as const : activity.activity_status,
          completedAt: activity.completed_at,
        })),
      ];
      setItems(normalized.filter((item) => item.status !== 'dokonceno' || completedToday(item.completedAt)));
    } catch (error: any) {
      toast.error(error?.message || 'Denní přehled se nepodařilo načíst.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openItems = useMemo(() => items.filter((item) => item.status !== 'dokonceno'), [items]);
  const completedItems = useMemo(() => items.filter((item) => item.status === 'dokonceno'), [items]);
  const counts = useMemo(() => ({
    overdue: openItems.filter((item) => workQueueBucket(item.dueAt) === 'overdue').length,
    today: openItems.filter((item) => workQueueBucket(item.dueAt) === 'today').length,
    inProgress: openItems.filter((item) => item.status === 'rozpracovano').length,
    completed: completedItems.length,
  }), [openItems, completedItems]);

  const visibleItems = useMemo(() => {
    if (view === 'completed') return completedItems;
    const buckets: WorkQueueBucket[] = view === 'due' ? ['overdue', 'today'] : ['upcoming'];
    return openItems
      .filter((item) => buckets.includes(workQueueBucket(item.dueAt)))
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }, [completedItems, openItems, view]);

  const setStatus = async (item: WorkItem, status: 'ceka' | 'rozpracovano' | 'dokonceno') => {
    setBusyId(item.id);
    const rpc = item.source === 'task' ? 'sales_lead_task_set_status' : 'sales_lead_scheduled_activity_set_status';
    const args = item.source === 'task'
      ? { p_task_id: item.id, p_status: status }
      : { p_activity_id: item.id, p_status: status === 'ceka' ? 'naplanovano' : status };
    const { data, error } = await (supabase as any).rpc(rpc, args);
    setBusyId(null);
    if (error || !data?.success) return toast.error('Stav práce se nepodařilo změnit.');
    toast.success(status === 'dokonceno' ? 'Položka byla dokončena.' : status === 'rozpracovano' ? 'Položka je rozpracovaná.' : 'Položka znovu čeká na vyřízení.');
    await load();
  };

  const openReschedule = (item: WorkItem) => {
    setRescheduling(item);
    const nextHour = new Date(Math.max(Date.now() + 60 * 60 * 1000, new Date(item.dueAt).getTime()));
    setNewDueAt(toLocalDateTimeInput(nextHour));
  };

  const reschedule = async () => {
    if (!rescheduling || !newDueAt) return;
    const dueAt = new Date(newDueAt);
    if (Number.isNaN(dueAt.getTime()) || dueAt <= new Date()) return toast.error('Vyberte budoucí termín.');
    setBusyId(rescheduling.id);
    const rpc = rescheduling.source === 'task' ? 'sales_lead_task_reschedule' : 'sales_lead_scheduled_activity_reschedule';
    const args = rescheduling.source === 'task'
      ? { p_task_id: rescheduling.id, p_due_at: dueAt.toISOString() }
      : { p_activity_id: rescheduling.id, p_scheduled_for: dueAt.toISOString() };
    const { data, error } = await (supabase as any).rpc(rpc, args);
    setBusyId(null);
    if (error || !data?.success) return toast.error('Termín se nepodařilo přesunout.');
    toast.success('Termín byl přesunut.');
    setRescheduling(null);
    await load();
  };

  return (
    <div className="space-y-4 p-4 sm:p-6" data-testid="sales-lead-today">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Po termínu', counts.overdue, 'text-destructive'],
          ['Dnes', counts.today, 'text-foreground'],
          ['Rozpracováno', counts.inProgress, 'text-primary'],
          ['Dokončeno dnes', counts.completed, 'text-emerald-600'],
        ].map(([label, value, color]) => (
          <Card key={String(label)} className="bg-card/60">
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className={`text-xl font-bold ${color}`}>{loading ? '…' : value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Společný přehled práce</h3>
          <p className="text-xs text-muted-foreground">Zmeškané položky zůstávají viditelné, dokud je nedokončíte nebo nepřesunete.</p>
        </div>
        <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
          <TabsList>
            <TabsTrigger value="due">K vyřízení ({counts.overdue + counts.today})</TabsTrigger>
            <TabsTrigger value="upcoming">Nadcházející</TabsTrigger>
            <TabsTrigger value="completed">Dokončeno dnes</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Načítám práci…</div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">
          {view === 'due' ? 'Pro dnešek ani po termínu není žádná otevřená práce.' : view === 'upcoming' ? 'Žádná nadcházející práce.' : 'Dnes zatím nebyla dokončena žádná položka.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => {
            const bucket = workQueueBucket(item.dueAt);
            const busy = busyId === item.id;
            return (
              <article key={`${item.source}-${item.id}`} className={`rounded-xl border p-4 ${bucket === 'overdue' && item.status !== 'dokonceno' ? 'border-destructive/45 bg-destructive/5' : 'bg-card/55'}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{TYPE_LABELS[item.type]}</Badge>
                      <Badge variant={item.status === 'rozpracovano' ? 'default' : item.status === 'dokonceno' ? 'secondary' : 'outline'}>{STATUS_LABELS[item.status]}</Badge>
                      {bucket === 'overdue' && item.status !== 'dokonceno' && <Badge variant="destructive">Po termínu</Badge>}
                    </div>
                    <button className="block text-left font-semibold hover:underline" onClick={() => onOpenLead(item.leadId)}>{item.company}</button>
                    <p className="text-sm text-muted-foreground">{item.title}</p>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{formatDateTime(item.dueAt)}</span>
                      <span>Odpovídá: <strong className="font-medium text-foreground">{item.responsible}</strong></span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button variant="ghost" size="sm" onClick={() => onOpenLead(item.leadId)}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Lead</Button>
                    {item.status !== 'dokonceno' && (
                      <>
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => openReschedule(item)}><CalendarClock className="mr-1.5 h-3.5 w-3.5" />Přesunout</Button>
                        {item.status === 'ceka' ? (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => void setStatus(item, 'rozpracovano')}><CirclePlay className="mr-1.5 h-3.5 w-3.5" />Začít</Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => void setStatus(item, 'ceka')}>Vrátit k čekání</Button>
                        )}
                        <Button size="sm" disabled={busy} onClick={() => void setStatus(item, 'dokonceno')}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Dokončit</Button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(rescheduling)} onOpenChange={(open) => !open && setRescheduling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Přesunout termín</DialogTitle>
            <DialogDescription>{rescheduling ? `${rescheduling.company} — ${rescheduling.title}` : ''}</DialogDescription>
          </DialogHeader>
          <Input type="datetime-local" value={newDueAt} onChange={(event) => setNewDueAt(event.target.value)} />
          <p className="text-xs text-muted-foreground">Termíny se zobrazují v českém čase.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduling(null)}>Zrušit</Button>
            <Button disabled={!newDueAt || Boolean(busyId)} onClick={() => void reschedule()}>Přesunout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
