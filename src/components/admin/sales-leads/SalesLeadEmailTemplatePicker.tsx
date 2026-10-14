/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, Search, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  renderSalesLeadEmailTemplate,
  TEMPLATE_TYPE_LABELS,
  type SalesLeadEmailTemplate,
  type SalesLeadEmailTemplateType,
  type SalesLeadTemplateContext,
} from './salesLeadEmailTemplates';

export function SalesLeadEmailTemplatePicker({
  open,
  onOpenChange,
  type,
  context,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: SalesLeadEmailTemplateType;
  context: SalesLeadTemplateContext;
  onSelect: (value: { subject: string; body: string; unresolved: string[]; templateName: string }) => void;
}) {
  const [templates, setTemplates] = useState<SalesLeadEmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('sales_lead_email_templates')
      .select('id,name,template_type,subject,body,is_active,sort_order,created_at,updated_at')
      .eq('template_type', type)
      .eq('is_active', true)
      .order('sort_order')
      .order('name');
    setTemplates((data ?? []) as SalesLeadEmailTemplate[]);
    setLoading(false);
  }, [type]);

  useEffect(() => {
    if (open) {
      setQuery('');
      void load();
    }
  }, [open, load]);

  const visible = templates.filter((template) =>
    `${template.name} ${template.subject}`.toLocaleLowerCase('cs-CZ').includes(query.trim().toLocaleLowerCase('cs-CZ')),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden border-white/[0.1] bg-card p-0" data-testid={`sales-lead-template-picker-${type}`}>
        <DialogHeader className="border-b border-white/[0.08] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Sparkles className="h-4 w-4" /></span>
            <div>
              <DialogTitle>Vybrat šablonu</DialogTitle>
              <DialogDescription>{TEMPLATE_TYPE_LABELS[type]} · šablona pouze vyplní současný editor.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 pb-6 pt-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hledat podle názvu nebo předmětu" className="pl-9" />
          </div>

          {loading ? (
            <div className="flex min-h-44 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Načítám šablony…</div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.1] bg-background/45 px-6 text-center">
              <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" />
              <div className="font-medium">Žádná aktivní šablona</div>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Superadmin ji může vytvořit ve správě e-mailových šablon.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visible.map((template) => {
                const rendered = renderSalesLeadEmailTemplate(template, context);
                return (
                  <article key={template.id} className="flex min-h-48 flex-col rounded-2xl border border-white/[0.09] bg-background/60 p-4 shadow-sm transition-colors hover:border-primary/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold tracking-tight">{template.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{rendered.subject}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 rounded-full">{TEMPLATE_TYPE_LABELS[type]}</Badge>
                    </div>
                    <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{rendered.body}</p>
                    {rendered.unresolved.length > 0 && (
                      <p className="mt-3 text-xs font-medium text-amber-500">Po výběru doplňte: {rendered.unresolved.join(', ')}</p>
                    )}
                    <Button className="mt-auto w-full" onClick={() => { onSelect({ ...rendered, templateName: template.name }); onOpenChange(false); }}>
                      Použít šablonu
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
