import { useEffect, useState } from 'react';
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
import { Loader2, Search, Info, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { LEAD_GROUP_OPTIONS, rpcErrorMessage, type LeadGroupOption } from './salesLeadsShared';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Zavolá se po úspěšném běhu, aby se seznam v rodiči obnovil. */
  onSuccess: () => void;
}

const LIMIT_OPTIONS = [3, 5, 10];

interface DiscoverResult {
  lead_group: string;
  candidates_checked: number;
  created: number;
  skipped: number;
  errored: number;
  websites_verified: number;
  websites_rejected: number;
}

/**
 * Ruční spuštění automatického vyhledávání firem. Člověk vybere skupinu +
 * počet a klikne „Najít nové firmy". EF `sales-lead-discover` navrhne názvy
 * firem, sám dohledá pravděpodobný oficiální web přes webové vyhledávání a
 * nezávisle ho ověří (funkční, skutečný obsah, identita firmy, ne zaparkovaná
 * doména, ne zpravodajský/katalogový web). Firma bez ověřeného webu se NEUKLÁDÁ.
 * E-mail se při discovery NEsbírá — kontakt dohledá až člověk ručně tlačítkem
 * „Dohledat e-mail" v detailu leadu. Nic se neodesílá a schválení návrhu musí
 * člověk provést ručně v detailu.
 */
export function DiscoverLeadsDialog({ open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState('');
  const [groups, setGroups] = useState<LeadGroupOption[]>(LEAD_GROUP_OPTIONS);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [limit, setLimit] = useState('5');
  const [result, setResult] = useState<DiscoverResult | null>(null);

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const { data, error } = await (supabase as any)
        .from('sales_lead_groups')
        .select('slug, label')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });
      if (error) {
        setGroups(LEAD_GROUP_OPTIONS);
        return;
      }
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

  useEffect(() => {
    if (open) void loadGroups();
  }, [open]);

  const handleClose = () => {
    if (!loading && !addingGroup) {
      setResult(null);
      setNewGroupLabel('');
      onOpenChange(false);
    }
  };

  const addGroup = async () => {
    const label = newGroupLabel.trim();
    if (label.length < 2) {
      toast.error('Zadejte název skupiny.');
      return;
    }
    setAddingGroup(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_group_create', {
        p_label: label,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string; slug?: string; label?: string };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
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

  const run = async () => {
    if (!group) {
      toast.error('Vyberte skupinu firem.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('sales-lead-discover', {
        body: { lead_group: group, limit: Number(limit) },
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as {
        success?: boolean; error?: string;
        lead_group?: string; candidates_checked?: number; created?: number;
        skipped?: number; errored?: number;
        websites_verified?: number; websites_rejected?: number;
      };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      const summary: DiscoverResult = {
        lead_group: res.lead_group ?? group,
        candidates_checked: res.candidates_checked ?? 0,
        created: res.created ?? 0,
        skipped: res.skipped ?? 0,
        errored: res.errored ?? 0,
        websites_verified: res.websites_verified ?? 0,
        websites_rejected: res.websites_rejected ?? 0,
      };
      setResult(summary);
      toast.success(`Uloženo ${summary.created} firem s ověřeným webem`);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Vyhledávání se nezdařilo';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Najít nové firmy</DialogTitle>
          <DialogDescription>
            Spustíte vy (člověk). AI pouze navrhne firmy. Uloží se jen firma s nezávisle
            ověřeným oficiálním webem. E-mail se při hledání firem NEsbírá — kontakt dohledáte
            ručně tlačítkem „Dohledat e-mail" v detailu leadu. Nic se neodesílá.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label htmlFor="disc-group">Skupina firem</Label>
            <Select value={group} onValueChange={setGroup} disabled={loading || loadingGroups}>
              <SelectTrigger id="disc-group"><SelectValue placeholder={loadingGroups ? 'Načítám skupiny…' : 'Vyberte skupinu'} /></SelectTrigger>
              <SelectContent>
                {groups.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border/60 p-3 space-y-2">
            <Label htmlFor="disc-new-group" className="text-xs text-muted-foreground">
              Přidat vlastní skupinu pro další hledání
            </Label>
            <div className="flex gap-2">
              <Input
                id="disc-new-group"
                value={newGroupLabel}
                onChange={(e) => setNewGroupLabel(e.target.value)}
                placeholder="Např. Reklamní agentury"
                disabled={loading || addingGroup}
              />
              <Button type="button" variant="outline" onClick={addGroup} disabled={loading || addingGroup || !newGroupLabel.trim()}>
                {addingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Skupina se uloží do číselníku a zůstane dostupná pro další hledání.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="disc-limit">Počet návrhů (max 10)</Label>
            <Select value={limit} onValueChange={setLimit} disabled={loading}>
              <SelectTrigger id="disc-limit"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong className="text-foreground">Uloží se jen firmy s ověřeným oficiálním webem.</strong>{' '}
              AI navrhne názvy firem, systém sám dohledá pravděpodobný web přes vyhledávání a
              nezávisle ho ověří (funkční, skutečný obsah, identita firmy, ne zaparkovaná doména,
              ne zpravodajský/katalogový web). Firma bez ověřeného webu se neuloží. <strong className="text-foreground">E-mail
              se při hledání firem NEsbírá</strong> — kontakt dohledáte až ručně tlačítkem
              „Dohledat e-mail" v detailu leadu (neověřený návrh k ručnímu potvrzení). Nic se
              neposílá; schválení návrhu provedete ručně v detailu leadu. Duplicity, partneři a
              blokované domény se přeskočí.
            </span>
          </div>

          {result && (
            <div className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="font-medium mb-1">Výsledek běhu</div>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>Prověřeno kandidátů: <strong className="text-foreground">{result.candidates_checked}</strong></li>
                <li>Uloženo firem (s ověřeným webem): <strong className="text-foreground">{result.created}</strong></li>
                <li>Ověřené weby: <strong className="text-foreground">{result.websites_verified}</strong></li>
                <li>Odmítnuto (neověřený web): <strong className="text-foreground">{result.websites_rejected}</strong></li>
                <li>Přeskočeno (duplicity/partneři/blokace): <strong className="text-foreground">{result.skipped}</strong></li>
                {result.errored > 0 && <li>Chyby: <strong className="text-foreground">{result.errored}</strong></li>}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Nové firmy najdete v záložce „Návrhy". Ze stavu „Navržený" je nutné ručně kliknout
                „Schválit návrh". Kontaktní e-mail dohledáte a schválíte ručně v detailu leadu
                tlačítkem „Dohledat e-mail".
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading || addingGroup}>
              {result ? 'Zavřít' : 'Zrušit'}
            </Button>
            <Button onClick={run} disabled={loading || addingGroup || !group} className="gap-2" data-testid="sl-discover-run">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Najít nové firmy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
