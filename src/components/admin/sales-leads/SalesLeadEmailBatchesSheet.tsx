/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, History, Loader2, PlayCircle, ShieldOff, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import {
  formatPragueDateTime,
  SALES_LEAD_EMAIL_BATCH_ITEM_STATUS_LABELS,
  SALES_LEAD_EMAIL_BATCH_STATUS_LABELS,
  salesLeadEmailBatchReasonMessage,
  type SalesLeadEmailBatchItemRow,
  type SalesLeadEmailBatchRow,
  type SalesLeadEmailBatchSkipRow,
} from './salesLeadEmailBatches';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refreshKey: number;
  onChanged?: () => void;
};

const batchWindow = (batch: SalesLeadEmailBatchRow) => (
  `${batch.window_start.slice(0, 5)}–${batch.window_end.slice(0, 5)} ${batch.timezone}`
);

export function SalesLeadEmailBatchesSheet({ open, onOpenChange, refreshKey, onChanged }: Props) {
  const [batches, setBatches] = useState<SalesLeadEmailBatchRow[]>([]);
  const [items, setItems] = useState<SalesLeadEmailBatchItemRow[]>([]);
  const [skips, setSkips] = useState<SalesLeadEmailBatchSkipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelBatch, setCancelBatch] = useState<SalesLeadEmailBatchRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const batchesResult = await (supabase as any)
      .from('sales_lead_email_batches')
      .select('id,status,template_name_snapshot,created_at,scheduled_date,timezone,window_start,window_end,scheduled_count,skipped_count,cancel_reason')
      .order('created_at', { ascending: false })
      .limit(20);
    if (batchesResult.error) {
      setLoading(false);
      setBatches([]);
      setItems([]);
      setSkips([]);
      toast.error('Přehled e-mailových dávek se nepodařilo načíst.');
      return;
    }
    const loadedBatches = (batchesResult.data ?? []) as SalesLeadEmailBatchRow[];
    const batchIds = loadedBatches.map((batch) => batch.id);
    if (batchIds.length === 0) {
      setBatches([]);
      setItems([]);
      setSkips([]);
      setLoading(false);
      return;
    }
    const [itemsResult, skipsResult] = await Promise.all([
      (supabase as any)
        .from('sales_lead_email_batch_items')
        .select('id,batch_id,status,scheduled_for,recipient_snapshot,subject_snapshot,company_name_snapshot')
        .in('batch_id', batchIds)
        .order('scheduled_for'),
      (supabase as any)
        .from('sales_lead_email_batch_skips')
        .select('id,batch_id,requested_lead_id,company_name_snapshot,reason')
        .in('batch_id', batchIds)
        .order('created_at'),
    ]);
    setBatches(loadedBatches);
    setItems((itemsResult.error ? [] : itemsResult.data ?? []) as SalesLeadEmailBatchItemRow[]);
    setSkips((skipsResult.error ? [] : skipsResult.data ?? []) as SalesLeadEmailBatchSkipRow[]);
    if (itemsResult.error || skipsResult.error) toast.error('Detail některých dávek se nepodařilo načíst celý.');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [load, open, refreshKey]);

  const itemsByBatch = useMemo(() => {
    const grouped = new Map<string, SalesLeadEmailBatchItemRow[]>();
    for (const item of items) grouped.set(item.batch_id, [...(grouped.get(item.batch_id) ?? []), item]);
    return grouped;
  }, [items]);

  const skipsByBatch = useMemo(() => {
    const grouped = new Map<string, SalesLeadEmailBatchSkipRow[]>();
    for (const skip of skips) grouped.set(skip.batch_id, [...(grouped.get(skip.batch_id) ?? []), skip]);
    return grouped;
  }, [skips]);

  // Spuštění dávky = pouze paused → scheduled. Neodesílá e-mail a nezapíná
  // kill-switch; dokud je automatika vypnutá, worker si položku nevezme.
  const activate = async (batch: SalesLeadEmailBatchRow) => {
    if (activatingId) return;
    setActivatingId(batch.id);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_email_batch_activate_admin', {
        p_batch_id: batch.id,
      });
      if (error) {
        toast.error(error.message || 'Dávku se nepodařilo spustit.');
        return;
      }
      const result = (data ?? {}) as { success?: boolean; error?: string; batch_status?: string };
      if (!result.success) {
        toast.error(salesLeadEmailBatchReasonMessage(result.error));
        return;
      }
      toast.success('Dávka je naplánovaná.', {
        description: 'Zatím se nic neodeslalo — odesílání hlídá samostatný přepínač automatiky.',
      });
      await load();
      onChanged?.();
    } finally {
      setActivatingId(null);
    }
  };

  const cancel = async () => {
    if (!cancelBatch || cancelling || cancelReason.trim().length < 3 || cancelReason.trim().length > 1000) return;
    setCancelling(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_email_batch_cancel', {
        p_batch_id: cancelBatch.id,
        p_reason: cancelReason.trim(),
      });
      if (error) {
        toast.error(error.message || 'Dávku se nepodařilo zrušit.');
        return;
      }
      const result = (data ?? {}) as { success?: boolean; error?: string; cancelled_count?: number };
      if (!result.success) {
        toast.error(salesLeadEmailBatchReasonMessage(result.error));
        return;
      }
      toast.success('Dávka byla zrušena. Žádný e-mail nebyl odeslán.', {
        description: `Vyřazené čekající položky: ${result.cancelled_count ?? 0}.`,
      });
      setCancelBatch(null);
      setCancelReason('');
      await load();
      onChanged?.();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl" data-testid="sales-lead-email-batches-sheet">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" />E-mailové dávky</SheetTitle>
            <SheetDescription>
              Posledních 20 ručně připravených dávek. Pozastavené dávky nic neodesílají.
            </SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Načítám dávky…</div>
          ) : batches.length === 0 ? (
            <div className="mt-8 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Zatím nebyla připravena žádná e-mailová dávka.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {batches.map((batch) => {
                const batchItems = itemsByBatch.get(batch.id) ?? [];
                const batchSkips = skipsByBatch.get(batch.id) ?? [];
                return (
                  <Collapsible key={batch.id} className="rounded-lg border" data-testid="email-batch-row">
                    <div className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{batch.template_name_snapshot}</span>
                            <Badge variant={batch.status === 'paused' ? 'secondary' : 'outline'}>
                              {SALES_LEAD_EMAIL_BATCH_STATUS_LABELS[batch.status]}
                            </Badge>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Vytvořeno {formatPragueDateTime(batch.created_at)} · Plánovaný den {new Date(`${batch.scheduled_date}T12:00:00Z`).toLocaleDateString('cs-CZ')} · {batchWindow(batch)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Položky: {batch.scheduled_count} · Vyřazené: {batch.skipped_count}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {batch.status === 'paused' && (
                            <Button
                              size="sm"
                              data-testid="batch-activate-button"
                              disabled={activatingId !== null}
                              onClick={() => activate(batch)}
                            >
                              <PlayCircle className="mr-1.5 h-4 w-4" />
                              {activatingId === batch.id ? 'Spouštím…' : 'Spustit dávku'}
                            </Button>
                          )}
                          {(['paused', 'scheduled'] as const).includes(batch.status as 'paused' | 'scheduled') && (
                            <Button variant="outline" size="sm" onClick={() => { setCancelReason(''); setCancelBatch(batch); }}>
                              <XCircle className="mr-1.5 h-4 w-4" />Zrušit dávku
                            </Button>
                          )}
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm"><ChevronDown className="mr-1.5 h-4 w-4" />Detail</Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>
                    </div>
                    <CollapsibleContent className="border-t bg-muted/20 p-4">
                      <div className="space-y-5">
                        <section>
                          <h4 className="text-sm font-semibold">Položky dávky</h4>
                          <div className="mt-2 space-y-2">
                            {batchItems.map((item) => (
                              <div key={item.id} className="rounded-md border bg-background p-3 text-sm">
                                <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-medium">{item.company_name_snapshot}</div><div className="text-muted-foreground">{item.recipient_snapshot}</div></div><Badge variant="outline">{SALES_LEAD_EMAIL_BATCH_ITEM_STATUS_LABELS[item.status]}</Badge></div>
                                <div className="mt-2 text-muted-foreground">Předmět: {item.subject_snapshot}</div>
                                <div className="mt-1 text-xs text-muted-foreground">Plán: {formatPragueDateTime(item.scheduled_for)}</div>
                              </div>
                            ))}
                          </div>
                        </section>
                        {batchSkips.length > 0 && (
                          <section>
                            <h4 className="text-sm font-semibold">Vyřazené firmy</h4>
                            <div className="mt-2 space-y-2">
                              {batchSkips.map((skip) => (
                                <div key={skip.id} className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm">
                                  <div className="font-medium">{skip.company_name_snapshot || 'Neznámá firma'}</div>
                                  <div className="mt-1 text-muted-foreground">{salesLeadEmailBatchReasonMessage(skip.reason)}</div>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                        {batch.cancel_reason && <div className="text-sm text-muted-foreground">Důvod zrušení: {batch.cancel_reason}</div>}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
            <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            Tento přehled neobsahuje ovládání pro spuštění, obnovení ani zapnutí automatiky.
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!cancelBatch} onOpenChange={(next) => !cancelling && !next && setCancelBatch(null)}>
        <AlertDialogContent data-testid="batch-cancel-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Zrušit e-mailovou dávku?</AlertDialogTitle>
            <AlertDialogDescription>
              Zrušením se všechny čekající položky vyřadí. Žádný e-mail se neodešle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="batch-cancel-reason">Důvod zrušení</Label>
            <Textarea
              id="batch-cancel-reason"
              minLength={3}
              maxLength={1000}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Napište důvod v délce 3 až 1000 znaků."
              data-testid="batch-cancel-reason"
            />
            <div className="text-right text-xs text-muted-foreground">{cancelReason.trim().length}/1000</div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Zpět</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); void cancel(); }}
              disabled={cancelling || cancelReason.trim().length < 3 || cancelReason.trim().length > 1000}
              data-testid="batch-cancel-confirm"
            >
              {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Zrušit dávku
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
