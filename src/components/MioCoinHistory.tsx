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
  /** Vykreslení na tmavé kartě peněženky (profil v novém vzhledu). */
  dark?: boolean;
}

type MioCoinHistoryRpc = (
  functionName: 'get_my_miocoin_history',
  arguments_: { p_limit: number },
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function MioCoinHistory({ refreshKey = 0, dark = false }: MioCoinHistoryProps) {
  const [entries, setEntries] = useState<MioCoinHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      setLoading(true);
      try {
        const rpc = supabase.rpc.bind(supabase) as unknown as MioCoinHistoryRpc;
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

  const formatTime = (value: string) =>
    new Date(value).toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (dark) {
    return (
      <div className="om-pf-history">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="om-pf-kicker" style={{ marginBottom: 2 }}>Historie MIO</p>
            <p className="om-pf-note">Přehled získaných a použitých MIO</p>
          </div>
          {entries.length > 3 && (
            <button
              type="button"
              className="om-pf-refresh shrink-0"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
            >
              {expanded ? 'Skrýt historii' : 'Zobrazit celou historii'}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          )}
        </div>

        {loading ? (
          <p className="om-pf-note flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Načítám historii MIO…
          </p>
        ) : entries.length === 0 ? (
          <p className="om-pf-note italic">Zatím nemáš žádné pohyby MIO.</p>
        ) : (
          <div className={expanded ? 'max-h-80 overflow-y-auto pr-1' : ''}>
            {visibleEntries.map((entry) => {
              const amount = Number(entry.amount);
              const amountColor = amount > 0 ? '#7FE0A6' : amount < 0 ? '#FF9AAA' : '#A9AAB3';
              return (
                <div key={entry.entry_id} className="om-pf-history-row">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#ECEDEF] break-words m-0">{getMioCoinHistoryLabel(entry)}</p>
                    {entry.partner_website_url && (
                      <p className="text-[11.5px] text-[#A9AAB3] break-all m-0">{entry.partner_website_url}</p>
                    )}
                    {entry.external_order_id && (
                      <p className="text-[11.5px] text-[#A9AAB3] m-0">Objednávka {entry.external_order_id}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[13px] font-extrabold tabular-nums" style={{ color: amountColor }}>
                      {formatSignedMioCoin(amount)}
                    </span>
                    <time className="text-[11px] text-[#A9AAB3] whitespace-nowrap" dateTime={entry.occurred_at}>
                      {formatTime(entry.occurred_at)}
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

  return (
    <div className="pt-5 border-t border-[rgba(194,144,47,0.12)]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Historie MIO</h3>
          <p className="text-xs text-muted-foreground mt-1">Přehled získaných a použitých MIO</p>
        </div>
        {entries.length > 3 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((current) => !current)}
            className="text-xs text-muted-foreground hover:text-[#C2902F] shrink-0 flex items-center gap-1"
          >
            {expanded ? 'Skrýt historii' : 'Zobrazit celou historii'}
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Načítám historii MIO...
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Zatím nemáš žádné pohyby MIO.</p>
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
                    {formatTime(entry.occurred_at)}
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
