import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, Info, Plus, Square } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { LEAD_GROUP_OPTIONS, rpcErrorMessage, type LeadGroupOption } from './salesLeadsShared';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Zavolá se při změně, aby se seznam v rodiči obnovil. */
  onSuccess: () => void;
}

const LIMIT_OPTIONS = [5, 10, 15, 20, 25];

interface JobRow {
  id: string;
  status: 'queued' | 'running' | 'done' | 'stopped' | 'failed';
  requested_count: number;
  candidates_checked: number;
  created_count: number;
  duplicates: number;
  websites_rejected: number;
  wrong_category: number;
  with_ico: number;
  with_dic: number;
  with_address: number;
  with_phone: number;
  finish_reason: string | null;
}

const FINISH_REASON_LABEL: Record<string, string> = {
  target_reached: 'Cíl splněn — dodán požadovaný počet ověřených firem.',
  max_candidates_reached: 'Dosažen bezpečnostní limit prověřených kandidátů.',
  candidates_exhausted: 'Došli dostupní kandidáti z vyhledávání.',
  stopped_by_user: 'Zastaveno uživatelem.',
};

/**
 * „Najít nové firmy" jako Discovery Job. Kandidáti se získávají AKTIVNÍM
 * webovým vyhledáváním (ne AI); AI jen klasifikuje obor/relevanci. Job běží na
 * pozadí po dávkách, dokud nedodá požadovaný počet ULOŽENÝCH firem s ověřeným
 * webem, nedojdou kandidáti nebo se nedosáhne bezpečnostního limitu. Okno lze
 * zavřít — job pokračuje. E-mail se při discovery NEsbírá; kontakt dohledá
 * člověk ručně v detailu leadu.
 */
export function DiscoverLeadsDialog({ open, onOpenChange, onSuccess }: Props) {
  const [group, setGroup] = useState('');
  const [groups, setGroups] = useState<LeadGroupOption[]>(LEAD_GROUP_OPTIONS);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [limit, setLimit] = useState('10');
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const notifiedDone = useRef(false);

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const { data, error } = await (supabase as any)
        .from('sales_lead_groups')
        .select('slug, label')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });
      if (error) { setGroups(LEAD_GROUP_OPTIONS); return; }
      const next = (data ?? [])
        .map((row: { slug?: string; label?: string }) => ({ value: row.slug ?? '', label: row.label ?? '' }))
        .filter((row: LeadGroupOption) => row.value && row.label);
      setGroups(next.length > 0 ? next : LEAD_GROUP_OPTIONS);
    } catch {
      setGroups(LEAD_GROUP_OPTIONS);
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => { if (open) void loadGroups(); }, [open]);

  // Poll běžícího jobu; okno lze zavřít, job pokračuje na pozadí (cron).
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const tick = async () => {
      const { data } = await (supabase as any)
        .from('sales_lead_discovery_jobs')
        .select('*').eq('id', jobId).maybeSingle();
      if (!active || !data) return;
      setJob(data as JobRow);
      if (['done', 'stopped', 'failed'].includes((data as JobRow).status)) {
        onSuccess();
        if (!notifiedDone.current) {
          notifiedDone.current = true;
          toast.success(`Hotovo — uloženo ${(data as JobRow).created_count} firem.`);
        }
      } else {
        onSuccess();
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => { active = false; clearInterval(id); };
  }, [jobId, onSuccess]);

  const isRunning = job ? ['queued', 'running'].includes(job.status) : false;

  const handleClose = () => {
    if (!starting && !addingGroup) {
      setJobId(null);
      setJob(null);
      notifiedDone.current = false;
      setNewGroupLabel('');
      onOpenChange(false);
    }
  };

  const addGroup = async () => {
    const label = newGroupLabel.trim();
    if (label.length < 2) { toast.error('Zadejte název skupiny.'); return; }
    setAddingGroup(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_group_create', { p_label: label });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string; slug?: string; label?: string };
      if (!res.success) { toast.error(rpcErrorMessage(res.error)); return; }
      toast.success(`Skupina „${res.label ?? label}“ byla přidána.`);
      setNewGroupLabel('');
      await loadGroups();
      if (res.slug) setGroup(res.slug);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Skupinu se nepodařilo přidat.');
    } finally {
      setAddingGroup(false);
    }
  };

  const start = async () => {
    if (!group) { toast.error('Vyberte skupinu firem.'); return; }
    setStarting(true);
    setJob(null);
    notifiedDone.current = false;
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_discovery_job_create', {
        p_lead_group: group,
        p_requested_count: Number(limit),
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string; job_id?: string };
      if (!res.success || !res.job_id) { toast.error(rpcErrorMessage(res.error)); return; }
      setJobId(res.job_id);
      toast.success('Hledání spuštěno na pozadí. Okno můžete zavřít.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Spuštění se nezdařilo');
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    if (!jobId) return;
    try {
      await (supabase as any).rpc('sales_lead_discovery_job_stop', { p_id: jobId });
      toast.message('Zastavuji…');
    } catch { /* ignore */ }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Najít nové firmy</DialogTitle>
          <DialogDescription>
            Kandidáti se hledají aktivním webovým vyhledáváním (ne AI). Ukládají se jen firmy s
            nezávisle ověřeným oficiálním webem. „Počet" = kolik ověřených firem se má uložit.
            Běží na pozadí — okno můžete zavřít. E-mail se NEsbírá.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label htmlFor="disc-group">Segment firem</Label>
            <Select value={group} onValueChange={setGroup} disabled={isRunning || loadingGroups}>
              <SelectTrigger id="disc-group"><SelectValue placeholder={loadingGroups ? 'Načítám skupiny…' : 'Vyberte segment'} /></SelectTrigger>
              <SelectContent>
                {groups.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border/60 p-3 space-y-2">
            <Label htmlFor="disc-new-group" className="text-xs text-muted-foreground">Přidat vlastní segment</Label>
            <div className="flex gap-2">
              <Input id="disc-new-group" value={newGroupLabel} onChange={(e) => setNewGroupLabel(e.target.value)}
                placeholder="Např. Reklamní agentury" disabled={isRunning || addingGroup} />
              <Button type="button" variant="outline" onClick={addGroup} disabled={isRunning || addingGroup || !newGroupLabel.trim()}>
                {addingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="disc-limit">Počet uložených firem (cíl)</Label>
            <Select value={limit} onValueChange={setLimit} disabled={isRunning}>
              <SelectTrigger id="disc-limit"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((n) => (<SelectItem key={n} value={String(n)}>{n}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong className="text-foreground">Cíl = počet ULOŽENÝCH firem s ověřeným webem</strong>, ne počet
              prověřených kandidátů — systém prověří i desítky firem, dokud cíl nedodá (nebo nedojdou
              kandidáti / nedosáhne bezpečnostního limitu). IČO/DIČ/adresa se doplní z ARES,
              telefon/kontaktní formulář z ověřeného webu — nic se nehádá. E-mail se NEsbírá.
            </span>
          </div>

          {job && (
            <div className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="font-medium mb-1 flex items-center gap-2">
                {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isRunning ? 'Probíhá hledání…' : 'Výsledek běhu'}
              </div>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>Cíl (uložit): <strong className="text-foreground">{job.requested_count}</strong></li>
                <li>Prověřeno kandidátů: <strong className="text-foreground">{job.candidates_checked}</strong></li>
                <li>Uloženo do segmentu: <strong className="text-foreground">{job.created_count} / {job.requested_count}</strong></li>
                <li>Uloženo do jiné kategorie: <strong className="text-foreground">{job.wrong_category}</strong></li>
                <li>Odmítnuto (neověřený web): <strong className="text-foreground">{job.websites_rejected}</strong></li>
                <li>Duplicity: <strong className="text-foreground">{job.duplicates}</strong></li>
                <li>Z toho má IČO / DIČ / adresu / telefon: <strong className="text-foreground">{job.with_ico} / {job.with_dic} / {job.with_address} / {job.with_phone}</strong></li>
              </ul>
              {!isRunning && job.finish_reason && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {FINISH_REASON_LABEL[job.finish_reason] ?? job.finish_reason}
                  {job.created_count < job.requested_count && ` Dodáno ${job.created_count} z ${job.requested_count}.`}
                </p>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Nové firmy najdete v záložce „Návrhy". Ze stavu „Navržený" ručně „Schválit návrh";
                kontaktní e-mail dohledáte ručně v detailu tlačítkem „Dohledat e-mail".
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            {isRunning && (
              <Button type="button" variant="outline" onClick={stop} className="gap-2">
                <Square className="h-4 w-4" /> Zastavit
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleClose} disabled={starting || addingGroup}>
              {isRunning ? 'Zavřít (běží dál)' : job ? 'Zavřít' : 'Zrušit'}
            </Button>
            {!isRunning && (
              <Button onClick={start} disabled={starting || addingGroup || !group} className="gap-2" data-testid="sl-discover-run">
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {job ? 'Spustit znovu' : 'Najít nové firmy'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
