import React, { useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock, Gift, TrendingUp } from 'lucide-react';

export interface TicketProgressBarProps {
  ticketsTotal: number;
  ticketsSold: number;
  soldPercent: number;
  /** Positions from bonus_prizes.ticket_position — NOT individual ticket rows */
  bonusPositions: number[];
  ticketsLast24h?: number;
  estimatedRevenue?: number;
  className?: string;
}

/**
 * DENSITY_BUCKETS: number of equal-width segments used for the bonus heatmap.
 * Keeping this small (200) means ≤ 200 DOM elements regardless of bonus count.
 */
const DENSITY_BUCKETS = 200;

/**
 * Below this bonus count we overlay individual 1-px pin markers on top of the
 * heatmap so the admin can see exact positions.  Above it the heatmap alone is
 * informative enough and individual pins would be invisible at this scale.
 */
const MAX_INDIVIDUAL_PINS = 300;

export const TicketProgressBar: React.FC<TicketProgressBarProps> = ({
  ticketsTotal,
  ticketsSold,
  soldPercent,
  bonusPositions,
  ticketsLast24h = 0,
  estimatedRevenue = 0,
  className = '',
}) => {
  const ticketsRemaining = Math.max(ticketsTotal - ticketsSold, 0);
  const filledPct = Math.min(Math.max(soldPercent, 0), 100);

  /**
   * Pre-compute density buckets from bonus positions.
   * Each bucket holds the relative opacity (0–1) for the orange heatmap layer.
   * Pure arithmetic — no DB call needed here.
   */
  const bonusDensity = useMemo(() => {
    if (bonusPositions.length === 0 || ticketsTotal === 0) return [];
    const buckets = new Array<number>(DENSITY_BUCKETS).fill(0);
    const bucketSize = ticketsTotal / DENSITY_BUCKETS;
    for (const pos of bonusPositions) {
      const idx = Math.min(Math.floor((pos - 1) / bucketSize), DENSITY_BUCKETS - 1);
      buckets[idx]++;
    }
    const maxDensity = Math.max(...buckets, 1);
    return buckets.map((count) => count / maxDensity);
  }, [bonusPositions, ticketsTotal]);

  const showPins = bonusPositions.length > 0 && bonusPositions.length <= MAX_INDIVIDUAL_PINS;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* ── Main bar ─────────────────────────────────────────── */}
      <div className="relative h-10 rounded-lg overflow-hidden bg-white/5 border border-white/10 select-none">

        {/* Layer 1 – sold portion (blue fill) */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#FF8A00] to-[#FFB547] transition-[width] duration-500 ease-out"
          style={{ width: `${filledPct}%` }}
        />

        {/* Layer 2 – bonus density heatmap (orange, always rendered) */}
        {bonusDensity.length > 0 && (
          <div className="absolute inset-0 flex pointer-events-none" aria-hidden>
            {bonusDensity.map((opacity, i) =>
              opacity > 0 ? (
                <div
                  key={i}
                  className="h-full flex-1"
                  style={{ backgroundColor: `rgba(249,115,22,${Math.min(opacity * 0.8, 0.9)})` }}
                />
              ) : (
                <div key={i} className="h-full flex-1" />
              ),
            )}
          </div>
        )}

        {/* Layer 3 – individual pin markers (when count is small enough) */}
        {showPins && (
          <TooltipProvider delayDuration={0}>
            {bonusPositions.map((pos, i) => {
              const leftPct = ticketsTotal > 1
                ? ((pos - 1) / (ticketsTotal - 1)) * 100
                : 0;
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div
                      className="absolute top-0 bottom-0 w-px bg-orange-300/90 hover:bg-white cursor-default z-20"
                      style={{ left: `${leftPct}%` }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Bonus: tiket #{pos.toLocaleString('cs-CZ')}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        )}

        {/* Layer 4 – inline text labels */}
        <div className="absolute inset-0 flex items-center justify-between px-2.5 pointer-events-none">
          {filledPct > 18 ? (
            <span className="text-[11px] font-semibold text-white/90 drop-shadow">
              {ticketsSold.toLocaleString('cs-CZ')} prodáno
            </span>
          ) : (
            <span />
          )}
          {filledPct < 82 ? (
            <span className="text-[11px] font-medium text-white/40">
              {ticketsRemaining.toLocaleString('cs-CZ')} zbývá
            </span>
          ) : (
            <span />
          )}
        </div>

        {/* Layer 5 – percentage badge (centered) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[11px] font-bold text-white/70 tabular-nums">
            {filledPct.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* ── Scale ticks ──────────────────────────────────────── */}
      <div className="relative h-3 px-0">
        {[0, 25, 50, 75, 100].map((pct) => (
          <div
            key={pct}
            className="absolute flex flex-col items-center"
            style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
          >
            <div className="w-px h-1.5 bg-white/20" />
            <span className="text-[9px] text-white/25 mt-0.5 tabular-nums">
              {pct === 0 ? '1' : pct === 100 ? '1M' : `${pct * 10}K`}
            </span>
          </div>
        ))}
      </div>

      {/* ── Legend / stat chips ───────────────────────────────── */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground pt-0.5">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#FF8A00] shrink-0" />
          Prodáno:&nbsp;
          <span className="font-medium text-foreground tabular-nums">
            {ticketsSold.toLocaleString('cs-CZ')}
          </span>
        </span>

        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-white/10 border border-white/20 shrink-0" />
          Zbývá:&nbsp;
          <span className="font-medium text-foreground tabular-nums">
            {ticketsRemaining.toLocaleString('cs-CZ')}
          </span>
        </span>

        {bonusPositions.length > 0 && (
          <span className="flex items-center gap-1.5">
            <Gift className="w-3 h-3 text-orange-400 shrink-0" />
            Bonus pozic:&nbsp;
            <span className="font-medium text-foreground tabular-nums">
              {bonusPositions.length.toLocaleString('cs-CZ')}
            </span>
          </span>
        )}

        {ticketsLast24h > 0 && (
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-[#FFB547] shrink-0" />
            Za 24h:&nbsp;
            <span className="font-medium text-foreground tabular-nums">
              +{ticketsLast24h.toLocaleString('cs-CZ')}
            </span>
          </span>
        )}

        {estimatedRevenue > 0 && (
          <span className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-[#FFB547] shrink-0" />
            Výnos:&nbsp;
            <span className="font-medium text-foreground tabular-nums">
              {estimatedRevenue.toLocaleString('cs-CZ')} MC
            </span>
          </span>
        )}
      </div>
    </div>
  );
};

export default TicketProgressBar;
