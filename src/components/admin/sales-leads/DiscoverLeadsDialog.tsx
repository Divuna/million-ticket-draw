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
  skipped_missing_email: number;
  skipped_email_not_found_on_website: number;
  errored: number;
}

/**
 * Fáze 5A + 5C + 5E — ruční spuštění automatického vyhledávání firem VČETNĚ
 * veřejného kontaktního e-mailu. Člověk vybere skupinu + počet a klikne
 * „Najít nové firmy". EF `sales-lead-discover` navrhne firmy a SÁM projde
 * jejich web (homepage + kontakt/about odkazy + mailto odkazy), aby dohledal
 * veřejný e-mail — AI odhad e-mailu je jen nápověda, nikdy důkaz. Uloží se
 * jako `navrzeny` POUZE firmy, u kterých se e-mail skutečně našel na webu —
 * u ostatních lead vůbec nevznikne. E-mail se ukládá jen jako neověřený
 * návrh; nic se neodesílá a schválení e-mailu musí člověk provést ručně
 * v detailu leadu.
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
        lead_group?: string; created?: number; skipped?: number;
        skipped_missing_email?: number; skipped_email_not_found_on_website?: number;
        errored?: number;
      };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      const summary: DiscoverResult = {
        lead_group: res.lead_group ?? group,
        created: res.created ?? 0,
        skipped: res.skipped ?? 0,
        skipped_missing_email: res.skipped_missing_email ?? 0,
        skipped_email_not_found_on_website: res.skipped_email_not_found_on_website ?? 0,
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
            Spustíte vy (člověk). AI navrhne firmy do skupiny a dohledá jejich veřejný e-mail —
            uloží se jako „Návrhy" jen firmy, u kterých se e-mail podařilo dohledat. Nic se
            neodesílá — každý návrh i e-mail musíte ručně schválit v záložce „Návrhy".
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
              <strong className="text-foreground">Uloží se jen firmy s dohledaným veřejným e-mailem.</strong>{' '}
              Systém sám projde web firmy (homepage, kontakt/o nás stránky, mailto odkazy) — AI
              odhad e-mailu je jen nápověda, nikdy důkaz. Pokud se e-mail na webu nenajde, lead se
              vůbec nevytvoří. Nalezený e-mail je vždy jen neověřený návrh; nic se neposílá a
              schválení e-mailu musíte provést ručně v detailu leadu. Duplicity, partneři a
              blokované domény se také přeskočí.
            </span>
          </div>

          {result && (
            <div className="rounded-lg border border-border/60 p-3 text-sm">
              <div className="font-medium mb-1">Výsledek běhu</div>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>Vytvořeno firem (s dohledaným e-mailem): <strong className="text-foreground">{result.created}</strong></li>
                <li>Přeskočeno celkem: <strong className="text-foreground">{result.skipped}</strong></li>
                <li>— z toho kvůli chybějícímu webu/údaji: <strong className="text-foreground">{result.skipped_missing_email}</strong></li>
                <li>— z toho kvůli nenalezenému e-mailu na webu firmy: <strong className="text-foreground">{result.skipped_email_not_found_on_website}</strong></li>
                {result.errored > 0 && <li>Chyby: <strong className="text-foreground">{result.errored}</strong></li>}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Nové firmy najdete v záložce „Návrhy". Ze stavu „Navržený" je nutné ručně kliknout
                „Schválit návrh" a v detailu ručně „Schválit e-mail", než se s firmou dál pracuje.
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
