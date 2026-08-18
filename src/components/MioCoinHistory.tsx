import { useEffect, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import {
  formatSignedMioCoin,
  getMioCoinHistoryLabel,
  type MioCoinHistoryEntry,
} from '@/lib/miocoinHistory';
import { Button } from '@/components/ui/button';
import { OneMilCoinsIcon } from '@/components/icons/OneMilIcons';

interface MioCoinHistoryProps {
  refreshKey?: number;
}

type MioCoinHistoryRpc = (
  functionName: 'get_my_miocoin_history',
  arguments_: { p_limit: number },
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function MioCoinHistory({ refreshKey = 0 }: MioCoinHistoryProps) {
  const [entries, setEntries] = useState<MioCoinHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      setLoading(true);
      try {
        const rpc = supabase.rpc as unknown as MioCoinHistoryRpc;
        const { data, error } = await rpc('get_my_miocoin_history', {
          p_limit: 100,
        });

        if (error) throw error;
        if (active) setEntries((data ?? []) as MioCoinHistoryEntry[]);
      } catch (error) {
        console.error('Error fetching MioCoin history:', error);
        if (active) setEntries([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadHistory();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const visibleEntries = expanded ? entries : entries.slice(0, 3);

  return (
    <div className="pt-5 border-t border-[rgba(255,138,0,0.12)]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Historie MioCoinů</h3>
          <p className="text-xs text-muted-foreground mt-1">Přehled získaných a použitých MioCoinů</p>
        </div>
        {entries.length > 3 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((current) => !current)}
            className="text-xs text-muted-foreground hover:text-[#FF8A00] shrink-0 flex items-center gap-1"
          >
            {expanded ? 'Skrýt historii' : 'Zobrazit celou historii'}
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Načítám historii MioCoinů...
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Zatím nemáte žádné pohyby MioCoinů.</p>
      ) : (
        <div className={`space-y-2 pr-1 ${expanded ? 'max-h-80 overflow-y-auto' : 'overflow-hidden'}`}>
          {visibleEntries.map((entry, index) => {
            const amount = Number(entry.amount);
            const incoming = amount > 0;
            const outgoing = amount < 0;
            const amountClass = incoming
              ? 'text-green-700'
              : outgoing
                ? 'text-red-600'
                : 'text-muted-foreground';

            return (
              <div
                key={entry.entry_id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-4 rounded-xl border transition-all duration-300 ${
                  incoming
                    ? 'bg-gradient-to-r from-green-500/5 via-transparent to-green-500/5 border-green-500/10 hover:border-green-500/20'
                    : outgoing
                      ? 'bg-gradient-to-r from-red-500/5 via-transparent to-red-500/5 border-red-500/10 hover:border-red-500/20'
                      : 'bg-muted/30 border-border/50'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${incoming ? 'bg-green-500/15' : outgoing ? 'bg-red-500/15' : 'bg-muted'}`}>
                    <OneMilCoinsIcon size={16} className={`h-4 w-4 ${incoming ? 'text-green-600' : outgoing ? 'text-red-500' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground break-words">{getMioCoinHistoryLabel(entry)}</p>
                    {entry.partner_website_url && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-all">{entry.partner_website_url}</p>
                    )}
                    {entry.external_order_id && (
                      <p className="text-xs text-muted-foreground mt-0.5">Objednávka {entry.external_order_id}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4 pl-8 sm:pl-0 shrink-0">
                  <span className={`text-sm font-bold tabular-nums ${amountClass}`}>{formatSignedMioCoin(amount)}</span>
                  <time className="text-xs text-muted-foreground whitespace-nowrap" dateTime={entry.occurred_at}>
                    {new Date(entry.occurred_at).toLocaleString('cs-CZ', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MioCoinHistory;
