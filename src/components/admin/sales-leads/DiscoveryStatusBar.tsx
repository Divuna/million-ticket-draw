import { CheckCircle2, Loader2, Square, XCircle } from 'lucide-react';
import { isDiscoveryRunning, type DiscoveryJobRow } from './useDiscoveryJob';

interface Props {
  job: DiscoveryJobRow;
  /** Otevře dialog s aktuálním průběhem téže úlohy. */
  onOpen: () => void;
}

/**
 * Stavový pruh běžícího/dokončeného hledání firem na hlavní stránce
 * Obchod / Leady. Je vidět i při zavřeném dialogu; kliknutím se dialog
 * znovu otevře s aktuálním průběhem.
 */
export function DiscoveryStatusBar({ job, onOpen }: Props) {
  const running = isDiscoveryRunning(job.status);

  const label = running
    ? `Probíhá hledání nových firem… Uloženo ${job.created_count} z ${job.requested_count}`
    : job.status === 'done'
      ? `Vyhledávání dokončeno — uloženo ${job.created_count} firem.`
      : job.status === 'stopped'
        ? `Vyhledávání zastaveno — uloženo ${job.created_count} firem.`
        : `Vyhledávání selhalo — uloženo ${job.created_count} firem.`;

  const Icon = running ? Loader2 : job.status === 'done' ? CheckCircle2 : job.status === 'stopped' ? Square : XCircle;

  const tone = running
    ? 'border-[rgba(255,138,0,0.35)] bg-[rgba(255,138,0,0.06)]'
    : job.status === 'failed'
      ? 'border-destructive/40 bg-destructive/5'
      : 'border-border/60 bg-muted/20';

  const iconTone = running
    ? 'text-[#FF8A00] animate-spin'
    : job.status === 'done'
      ? 'text-green-500'
      : job.status === 'failed'
        ? 'text-destructive'
        : 'text-muted-foreground';

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="sl-discovery-status-bar"
      data-status={job.status}
      aria-label={`${label} — otevřít průběh hledání`}
      className={`w-full overflow-hidden rounded-lg border text-left transition-colors hover:bg-[rgba(255,138,0,0.1)] ${tone}`}
    >
      {/* Tenká animovaná oranžová linka — jen když hledání běží */}
      <div className="h-[3px] w-full overflow-hidden" aria-hidden>
        {running ? (
          <div
            className="h-full w-full animate-golden-shimmer"
            style={{
              background:
                'linear-gradient(90deg, rgba(255,138,0,0) 0%, rgba(255,138,0,0.35) 20%, rgba(255,181,71,0.95) 50%, rgba(255,138,0,0.35) 80%, rgba(255,138,0,0) 100%)',
              backgroundSize: '200% 100%',
            }}
          />
        ) : (
          <div className="h-full w-full bg-border/40" />
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        <Icon className={`h-4 w-4 shrink-0 ${iconTone}`} aria-hidden />
        <span className="text-sm">{label}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {running ? 'Zobrazit průběh' : 'Zobrazit výsledek'}
        </span>
      </div>
    </button>
  );
}
