import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { LEAD_GROUP_OPTIONS, rpcErrorMessage } from './salesLeadsShared';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Zavolá se po úspěšném běhu, aby se seznam v rodiči obnovil. */
  onSuccess: () => void;
}

const LIMIT_OPTIONS = [3, 5, 10];

interface DiscoverResult {
  lead_group: string;
  created: number;
  skipped: number;
  errored: number;
}

/**
 * Fáze 5A — ruční spuštění automatického vyhledávání firem.
 * Člověk vybere skupinu + počet a klikne „Najít nové firmy". EF
 * `sales-lead-discover` navrhne firmy a uloží je jako `navrzeny`. NIC se
 * neodesílá; návrhy musí člověk ručně schválit v záložce „Návrhy".
 */
export function DiscoverLeadsDialog({ open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState('');
  const [limit, setLimit] = useState('5');
  const [result, setResult] = useState<DiscoverResult | null>(null);

  const handleClose = () => {
    if (!loading) {
      setResult(null);
      onOpenChange(false);
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
        lead_group?: string; created?: number; skipped?: number; errored?: number;
      };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      const summary: DiscoverResult = {
        lead_group: res.lead_group ?? group,
        created: res.created ?? 0,
        skipped: res.skipped ?? 0,
        errored: res.errored ?? 0,
      };
      setResult(summary);
      toast.success(`Vzniklo ${summary.created} návrhů · přeskočeno ${summary.skipped}`);
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
            Spustíte vy (člověk). AI navrhne firmy do skupiny a uloží je jako „Návrhy".
            Nic se neodesílá — každý návrh musíte ručně schválit v záložce „Návrhy".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label htmlFor="disc-group">Skupina firem</Label>
            <Select value={group} onValueChange={setGroup} disabled={loading}>
              <SelectTrigger id="disc-group"><SelectValue placeholder="Vyberte skupinu" /></SelectTrigger>
              <SelectContent>
                {LEAD_GROUP_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              AI jen navrhuje firmy jako „Návrhy". Neposílá žádné e-maily, nevyplňuje kontakty jako
              ověřené a nic sama neschvaluje. Duplicity, partneři a blokované domény se přeskočí.
            </span>
          </div>

          {result && (
            <div className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="font-medium mb-1">Výsledek běhu</div>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>Vzniklo návrhů: <strong className="text-foreground">{result.created}</strong></li>
                <li>Přeskočeno (duplicity / blokace): <strong className="text-foreground">{result.skipped}</strong></li>
                {result.errored > 0 && <li>Chyby: <strong className="text-foreground">{result.errored}</strong></li>}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Nové firmy najdete v záložce „Návrhy". Ze stavu „Navržený" je nutné ručně kliknout
                „Schválit návrh", než se s firmou dál pracuje.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              {result ? 'Zavřít' : 'Zrušit'}
            </Button>
            <Button onClick={run} disabled={loading || !group} className="gap-2" data-testid="sl-discover-run">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Najít nové firmy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
