import { AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { STATUS_LABELS, type DuplicateConflict } from './salesLeadsShared';

interface Props {
  conflicts: DuplicateConflict[];
  reason: string;
  onReasonChange: (value: string) => void;
  disabled?: boolean;
}

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Dosud neosloveno';

export function DuplicateConflictAlert({ conflicts, reason, onReasonChange, disabled }: Props) {
  if (conflicts.length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border-2 border-destructive bg-destructive/10 p-4 text-destructive" data-testid="duplicate-conflict-alert">
      <div className="flex items-start gap-2 font-semibold">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <span>Tento e-mail nebo jeho firemní doména už byla použita.</span>
      </div>
      <div className="space-y-2 text-sm text-foreground">
        {conflicts.map((conflict) => (
          <div key={`${conflict.lead_id}-${conflict.match_type}`} className="rounded border border-destructive/30 bg-background p-3">
            <div className="font-medium">{conflict.company_name}</div>
            <div>{conflict.contact_email ?? '—'}</div>
            <div>Shoda: {conflict.match_type === 'exact_email' ? 'stejný e-mail' : `firemní doména @${conflict.matched_value}`}</div>
            <div>Stav: {STATUS_LABELS[conflict.status] ?? conflict.status}</div>
            <div>První oslovení: {formatDate(conflict.first_contacted_at)}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1 text-foreground">
        <Label htmlFor="duplicate-override-reason">Důvod výjimky *</Label>
        <Textarea id="duplicate-override-reason" value={reason} onChange={(e) => onReasonChange(e.target.value)}
          disabled={disabled} maxLength={1000} rows={2} placeholder="Proč je bezpečné pokračovat…" />
      </div>
    </div>
  );
}
