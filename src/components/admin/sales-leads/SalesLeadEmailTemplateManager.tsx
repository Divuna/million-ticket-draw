/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react';
import { FilePlus2, FileText, Loader2, Power, PowerOff, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  SALES_LEAD_TEMPLATE_VARIABLES,
  TEMPLATE_TYPE_LABELS,
  salesLeadEmailTemplateSaveErrorMessage,
  validateSalesLeadEmailTemplateDefinition,
  type SalesLeadEmailTemplate,
  type SalesLeadEmailTemplateType,
} from './salesLeadEmailTemplates';

const emptyForm = () => ({ id: null as string | null, name: '', template_type: 'initial' as SalesLeadEmailTemplateType, subject: '', body: '', sort_order: '0' });

export function SalesLeadEmailTemplateManager({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [templates, setTemplates] = useState<SalesLeadEmailTemplate[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('sales_lead_email_templates')
      .select('id,name,template_type,subject,body,is_active,sort_order,created_at,updated_at')
      .order('template_type')
      .order('sort_order')
      .order('name');
    if (error) toast.error('Šablony se nepodařilo načíst.');
    setTemplates((data ?? []) as SalesLeadEmailTemplate[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      void load();
    }
  }, [open, load]);

  const edit = (template: SalesLeadEmailTemplate) => setForm({
    id: template.id,
    name: template.name,
    template_type: template.template_type,
    subject: template.subject,
    body: template.body,
    sort_order: String(template.sort_order),
  });

  const save = async () => {
    const errors = validateSalesLeadEmailTemplateDefinition(form.template_type, form.subject, form.body);
    if (!form.name.trim()) errors.unshift('Název šablony je povinný.');
    if (errors.length > 0) return toast.error(errors[0]);
    setSaving(true);
    const { data, error } = await (supabase as any).rpc('sales_lead_email_template_upsert', {
      p_id: form.id,
      p_name: form.name.trim(),
      p_template_type: form.template_type,
      p_subject: form.subject.trim(),
      p_body: form.body.trim(),
      p_sort_order: Number(form.sort_order) || 0,
    });
    setSaving(false);
    if (error || !data?.success) return toast.error(salesLeadEmailTemplateSaveErrorMessage(error?.message, data?.error));
    toast.success(form.id ? 'Šablona upravena.' : 'Šablona vytvořena.');
    setForm(emptyForm());
    await load();
  };

  const setActive = async (template: SalesLeadEmailTemplate, active: boolean) => {
    const { data, error } = await (supabase as any).rpc('sales_lead_email_template_set_active', { p_id: template.id, p_is_active: active });
    if (error || !data?.success) return toast.error('Stav šablony se nepodařilo změnit.');
    toast.success(active ? 'Šablona aktivována.' : 'Šablona deaktivována.');
    await load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92vh,860px)] max-w-6xl flex-col overflow-hidden border-white/[0.1] bg-card p-0" data-testid="sales-lead-template-manager">
        <DialogHeader className="border-b border-white/[0.08] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary"><ShieldCheck className="h-4 w-4" /></span>
            <div>
              <DialogTitle>E-mailové šablony</DialogTitle>
              <DialogDescription>Týmové plain-text šablony. Spravovat je může pouze superadmin.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[0.9fr_1.1fr]">
          <section className="min-h-0 overflow-y-auto border-b border-white/[0.08] p-5 lg:border-b-0 lg:border-r">
            <div className="mb-4 flex items-center justify-between">
              <div><div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Knihovna</div><h3 className="mt-1 text-lg font-semibold">Týmové šablony</h3></div>
              <Button variant="outline" size="sm" onClick={() => setForm(emptyForm())}><FilePlus2 className="mr-1.5 h-4 w-4" />Nová</Button>
            </div>
            {loading ? (
              <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Načítám…</div>
            ) : templates.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.1] bg-background/45 text-center">
                <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" /><div className="font-medium">Zatím bez šablon</div><p className="mt-1 text-sm text-muted-foreground">První týmovou šablonu vytvořte vpravo.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {templates.map((template) => (
                  <article key={template.id} className={`rounded-2xl border p-4 transition-colors ${form.id === template.id ? 'border-primary/45 bg-primary/[0.08]' : 'border-white/[0.08] bg-background/55 hover:border-white/[0.14]'}`}>
                    <button type="button" className="w-full text-left" onClick={() => edit(template)}>
                      <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{template.name}</div><div className="mt-1 text-xs text-muted-foreground">{template.subject}</div></div><Badge variant={template.is_active ? 'default' : 'secondary'} className="rounded-full">{template.is_active ? 'Aktivní' : 'Neaktivní'}</Badge></div>
                      <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{TEMPLATE_TYPE_LABELS[template.template_type]}</div>
                    </button>
                    <Button variant="ghost" size="sm" className="mt-2 h-8" onClick={() => void setActive(template, !template.is_active)}>
                      {template.is_active ? <PowerOff className="mr-1.5 h-3.5 w-3.5" /> : <Power className="mr-1.5 h-3.5 w-3.5" />}{template.is_active ? 'Deaktivovat' : 'Aktivovat'}
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="min-h-0 overflow-y-auto p-5">
            <div className="mb-4"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Editor</div><h3 className="mt-1 text-lg font-semibold">{form.id ? 'Upravit šablonu' : 'Nová šablona'}</h3></div>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_180px_100px]">
                <div className="space-y-1.5"><Label htmlFor="template-name">Název</Label><Input id="template-name" value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} placeholder="Např. První oslovení e-shopu" /></div>
                <div className="space-y-1.5"><Label>Typ</Label><Select value={form.template_type} onValueChange={(value) => setForm((current) => ({ ...current, template_type: value as SalesLeadEmailTemplateType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="initial">První e-mail</SelectItem><SelectItem value="reply">Odpověď</SelectItem><SelectItem value="follow_up">Follow-up</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="template-order">Pořadí</Label><Input id="template-order" type="number" min="0" max="10000" value={form.sort_order} onChange={(event) => setForm((value) => ({ ...value, sort_order: event.target.value }))} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="template-subject">Předmět</Label><Input id="template-subject" maxLength={300} value={form.subject} onChange={(event) => setForm((value) => ({ ...value, subject: event.target.value }))} placeholder="Předmět e-mailu" /></div>
              <div className="space-y-1.5"><Label htmlFor="template-body">Text šablony</Label><Textarea id="template-body" rows={13} maxLength={20000} className="resize-y leading-6" value={form.body} onChange={(event) => setForm((value) => ({ ...value, body: event.target.value }))} placeholder="Plain-text obsah e-mailu" /></div>
              <div className="rounded-2xl border border-white/[0.08] bg-background/55 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Povolené proměnné</div>
                <div className="mt-3 flex flex-wrap gap-2">{SALES_LEAD_TEMPLATE_VARIABLES.map((variable) => <button type="button" key={variable.key} onClick={() => setForm((value) => ({ ...value, body: `${value.body}${value.body ? ' ' : ''}${variable.token}` }))} className="rounded-full border border-white/[0.1] bg-card px-3 py-1.5 text-xs hover:border-primary/35"><span className="font-mono text-primary">{variable.token}</span><span className="ml-1.5 text-muted-foreground">{variable.label}</span></button>)}</div>
              </div>
              <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setForm(emptyForm())}>Vyčistit</Button><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{form.id ? 'Uložit změny' : 'Vytvořit šablonu'}</Button></div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
