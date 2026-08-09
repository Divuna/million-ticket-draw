/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SalesLeadEmailTemplate } from './salesLeadEmailTemplates';
import {
  emailVerificationMethodLabel,
  formatBatchWindow,
  formatPragueDateTime,
  isSafeHttpsUrl,
  nextIsoDate,
  pragueDateString,
  salesLeadEmailBatchReasonMessage,
  type SalesLeadEmailBatchCreateResult,
  type SalesLeadEmailBatchPreview,
} from './salesLeadEmailBatches';

type SelectedLead = { id: string; company_name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLeads: SelectedLead[];
  onCreated: (result: SalesLeadEmailBatchCreateResult) => void | Promise<void>;
};

const emptyPreview: SalesLeadEmailBatchPreview | null = null;

export function SalesLeadEmailBatchDialog({ open, onOpenChange, selectedLeads, onCreated }: Props) {
  const [templates, setTemplates] = useState<SalesLeadEmailTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(pragueDateString());
  const [preview, setPreview] = useState<SalesLeadEmailBatchPreview | null>(emptyPreview);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const wasOpenRef = useRef(false);

  const leadIds = useMemo(() => selectedLeads.map((lead) => lead.id), [selectedLeads]);
  const eligibleCount = preview?.eligible_count ?? preview?.eligible?.length ?? 0;
  const canPrepare = Boolean(preview?.success) && eligibleCount > 0;

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      idempotencyKeyRef.current = crypto.randomUUID();
      setTemplateId('');
      setScheduledDate(pragueDateString());
      setPreview(emptyPreview);
      setConfirmationOpen(false);
    }

    let active = true;
    setTemplatesLoading(true);
    void (supabase as any)
      .from('sales_lead_email_templates')
      .select('id,name,template_type,subject,body,is_active,sort_order,created_at,updated_at')
      .eq('is_active', true)
      .eq('template_type', 'initial')
      .order('sort_order')
      .order('name')
      .then(({ data, error }: { data: unknown; error: { message?: string } | null }) => {
        if (!active) return;
        setTemplatesLoading(false);
        if (error) {
          toast.error('Aktivní šablony prvního e-mailu se nepodařilo načíst.');
          setTemplates([]);
          return;
        }
        setTemplates((data ?? []) as SalesLeadEmailTemplate[]);
      });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || !templateId || !scheduledDate || leadIds.length === 0) {
      setPreview(emptyPreview);
      return;
    }
    let active = true;
    setPreviewLoading(true);
    setPreview(emptyPreview);
    void (supabase as any).rpc('sales_lead_email_batch_preview', {
      p_lead_ids: leadIds,
      p_template_id: templateId,
      p_scheduled_date: scheduledDate,
    }).then(({ data, error }: { data: unknown; error: { message?: string } | null }) => {
      if (!active) return;
      setPreviewLoading(false);
      if (error) {
        toast.error(error.message || 'Serverový náhled se nepodařilo načíst.');
        return;
      }
      const result = (data ?? {}) as SalesLeadEmailBatchPreview;
      if (!result.success && result.error === 'scheduling_window_closed' && scheduledDate === pragueDateString()) {
        const tomorrow = nextIsoDate(scheduledDate);
        setScheduledDate(tomorrow);
        toast.message('Dnešní bezpečné okno už skončilo. Náhled byl přesunut na následující den.');
        return;
      }
      setPreview(result);
      if (!result.success) toast.error(salesLeadEmailBatchReasonMessage(result.error));
    });
    return () => { active = false; };
  }, [leadIds, open, scheduledDate, templateId]);

  const createBatch = async () => {
    if (!canPrepare || creating) return;
    setCreating(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_email_batch_prepare_paused', {
        p_lead_ids: leadIds,
        p_template_id: templateId,
        p_scheduled_date: scheduledDate,
        p_idempotency_key: idempotencyKeyRef.current,
      });
      if (error) {
        toast.error(error.message || 'Dávku se nepodařilo bezpečně uložit. Zkuste akci znovu.');
        return;
      }
      const result = (data ?? {}) as SalesLeadEmailBatchCreateResult;
      if (!result.success) {
        toast.error(salesLeadEmailBatchReasonMessage(result.error));
        return;
      }
      // Safe preparation must always commit as paused, regardless of the global
      // automation state. Sending still requires a separate explicit activation.
      if (result.batch_status !== 'paused') {
        toast.error(salesLeadEmailBatchReasonMessage('unexpected_batch_state'));
        return;
      }
      toast.success(
        'Dávka byla připravena jako pozastavená. Žádný e-mail nebyl odeslán.',
        { description: `Uloženo: ${result.scheduled_count ?? 0}, vyřazeno: ${result.skipped_count ?? 0}.` },
      );
      setConfirmationOpen(false);
      await onCreated(result);
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !creating && onOpenChange(next)}>
        <DialogContent
          className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden p-0"
          data-testid="sales-lead-email-batch-dialog"
        >
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" aria-hidden />
              Připravit e-mailovou dávku
            </DialogTitle>
            <DialogDescription>
              Vybráno firem: {selectedLeads.length}. Server před uložením znovu ověří všechny bezpečnostní podmínky.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <Alert className="border-amber-500/40 bg-amber-500/10" data-testid="batch-preparation-safety">
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>
                {preview?.automation_enabled === true ? 'Automatické odesílání je zapnuté' : 'Automatické odesílání je vypnuté'}
              </AlertTitle>
              <AlertDescription>
                {preview?.automation_enabled === true
                  ? 'Připravená dávka se i tak uloží jako pozastavená. Nic se neodešle, dokud ji výslovně nespustíte.'
                  : 'Připravená dávka se uloží jako pozastavená a žádný e-mail se neodešle.'}
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Aktivní šablona prvního e-mailu</Label>
                <Select value={templateId} onValueChange={setTemplateId} disabled={templatesLoading}>
                  <SelectTrigger data-testid="batch-template-select">
                    <SelectValue placeholder={templatesLoading ? 'Načítám…' : 'Vyberte šablonu'} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!templatesLoading && templates.length === 0 && (
                  <p className="text-xs text-destructive">Není dostupná žádná aktivní šablona prvního e-mailu.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-scheduled-date">Plánovaný den</Label>
                <Input
                  id="batch-scheduled-date"
                  type="date"
                  min={pragueDateString()}
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.target.value)}
                  data-testid="batch-scheduled-date"
                />
                <p className="text-xs text-muted-foreground">Denní limit je nejvýše 20 dávkových e-mailů.</p>
              </div>
            </div>

            <section className="rounded-lg border p-4">
              <h3 className="font-medium">Vybrané firmy ({selectedLeads.length})</h3>
              <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                {selectedLeads.map((lead) => <Badge key={lead.id} variant="secondary">{lead.company_name}</Badge>)}
              </div>
            </section>

            {previewLoading && (
              <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground" data-testid="batch-preview-loading">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Server připravuje bezpečný náhled…
              </div>
            )}

            {preview?.success && !previewLoading && (
              <div className="space-y-5" data-testid="batch-preview">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Způsobilé</div><div className="text-xl font-semibold">{eligibleCount}</div></div>
                  <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Vyřazené</div><div className="text-xl font-semibold">{preview.ineligible_count ?? 0}</div></div>
                  <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Zbývající kapacita</div><div className="text-xl font-semibold">{preview.daily_remaining ?? 0}/{preview.daily_limit ?? 20}</div></div>
                  <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Časové okno</div><div className="text-sm font-semibold">{formatBatchWindow(preview.window_start, preview.window_end)}</div></div>
                </div>

                {(preview.eligible ?? []).length > 0 && (
                  <section className="space-y-3">
                    <h3 className="font-semibold">Výsledné e-maily</h3>
                    {(preview.eligible ?? []).map((item) => (
                      <article key={item.lead_id} className="space-y-3 rounded-lg border p-4" data-testid="batch-eligible-item">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div><div className="font-semibold">{item.company_name}</div><div className="text-sm text-muted-foreground">Příjemce: {item.recipient}</div></div>
                          <Badge variant="outline">{emailVerificationMethodLabel(item.email_verification_method)}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Ověřeno: {formatPragueDateTime(item.email_verified_at)} · Zdroj:{' '}
                          {isSafeHttpsUrl(item.email_source) ? (
                            <a className="inline-flex items-center gap-1 text-primary underline" href={item.email_source} target="_blank" rel="noopener noreferrer">
                              otevřít stránku <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : <span>{item.email_source || '—'}</span>}
                        </div>
                        <div><div className="text-xs font-medium uppercase text-muted-foreground">Předmět</div><div className="mt-1 text-sm font-medium">{item.subject}</div></div>
                        <div><div className="text-xs font-medium uppercase text-muted-foreground">Text e-mailu</div><pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 font-sans text-sm">{item.body_text || item.body_source}</pre></div>
                      </article>
                    ))}
                  </section>
                )}

                {(preview.ineligible ?? []).length > 0 && (
                  <section className="space-y-3" data-testid="batch-ineligible-list">
                    <h3 className="font-semibold">Vyřazené firmy</h3>
                    {(preview.ineligible ?? []).map((item) => (
                      <div key={`${item.lead_id}-${item.reason}`} className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                        <div className="font-medium">{item.company_name || 'Neznámá firma'}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{salesLeadEmailBatchReasonMessage(item.reason)}</div>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>Zavřít</Button>
            <Button
              onClick={() => setConfirmationOpen(true)}
              disabled={!canPrepare || previewLoading || creating}
              data-testid="batch-prepare-confirm-open"
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Připravit dávku ({eligibleCount})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmationOpen} onOpenChange={(next) => !creating && setConfirmationOpen(next)}>
        <AlertDialogContent data-testid="batch-final-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>Opravdu připravit dávku?</AlertDialogTitle>
            <AlertDialogDescription>
              Dávka bude uložena jako pozastavená. Nyní se neodešle žádný e-mail. Odesílání začne až po samostatném kliknutí na „Spustit dávku“.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating}>Zpět</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void createBatch(); }} disabled={creating} data-testid="batch-final-confirm">
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Potvrdit bezpečné uložení
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
