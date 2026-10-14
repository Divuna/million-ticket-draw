import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Ban, CheckCircle2, Inbox, Link2, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddSalesLeadDialog } from './AddSalesLeadDialog';

type QueueStatus = 'unassigned' | 'resolved' | 'ignored';

interface UnassignedEmail {
  id: string;
  resend_email_id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_snapshot: string | null;
  received_at: string;
  status: QueueStatus;
  assigned_lead_id: string | null;
  in_reply_to: string | null;
  references_ids: string[];
}

interface LeadOption {
  id: string;
  company_name: string;
  contact_email: string | null;
}

interface Props {
  onCountChange?: (count: number) => void;
  onOpenLead?: (leadId: string) => void;
}

export function SalesLeadUnassignedEmails({ onCountChange, onOpenLead }: Props) {
  const [emails, setEmails] = useState<UnassignedEmail[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [status, setStatus] = useState<QueueStatus>('unassigned');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Record<string, string>>({});
  const [createFrom, setCreateFrom] = useState<UnassignedEmail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [emailsResult, leadsResult, countResult] = await Promise.all([
      (supabase as any).from('sales_lead_unassigned_emails').select('*')
        .eq('status', status).order('received_at', { ascending: false }),
      (supabase as any).from('sales_leads').select('id,company_name,contact_email')
        .neq('status', 'archivovan').order('company_name'),
      (supabase as any).from('sales_lead_unassigned_emails')
        .select('id', { count: 'exact', head: true }).eq('status', 'unassigned'),
    ]);
    if (emailsResult.error) toast.error('Nepřiřazené e-maily se nepodařilo načíst.');
    setEmails((emailsResult.data ?? []) as UnassignedEmail[]);
    setLeads((leadsResult.data ?? []) as LeadOption[]);
    onCountChange?.(countResult.count ?? 0);
    setLoading(false);
  }, [onCountChange, status]);

  useEffect(() => { void load(); }, [load]);

  const assign = async (emailId: string, leadId: string) => {
    if (!leadId) return;
    setBusyId(emailId);
    const { data, error } = await (supabase as any).rpc('sales_lead_unassigned_email_assign', {
      p_email_id: emailId,
      p_lead_id: leadId,
    });
    const result = (data ?? {}) as { success?: boolean; error?: string };
    if (error || !result.success) {
      toast.error('E-mail se nepodařilo přiřadit. Možná už byl mezitím vyřešen.');
    } else {
      toast.success('E-mail byl přiřazen k leadu a doplněn do historie.');
      await load();
      onOpenLead?.(leadId);
    }
    setBusyId(null);
  };

  const setQueueStatus = async (emailId: string, nextStatus: 'resolved' | 'ignored') => {
    setBusyId(emailId);
    const { data, error } = await (supabase as any).rpc('sales_lead_unassigned_email_set_status', {
      p_email_id: emailId,
      p_status: nextStatus,
      p_note: null,
    });
    const result = (data ?? {}) as { success?: boolean };
    if (error || !result.success) toast.error('Stav e-mailu se nepodařilo změnit.');
    else {
      toast.success(nextStatus === 'ignored' ? 'E-mail byl označen jako ignorovaný.' : 'E-mail byl vyřešen.');
      await load();
    }
    setBusyId(null);
  };

  const createInitialValues = useMemo(() => createFrom ? {
    contact_person: createFrom.from_name ?? '',
    contact_email: createFrom.from_email,
    email_source: 'Příchozí e-mail na b2b@onemil.cz',
    notes: `Nový lead vytvořen z nepřiřazeného e-mailu: ${createFrom.subject ?? 'bez předmětu'}`,
  } : undefined, [createFrom]);

  const handleCreated = async (leadId?: string) => {
    const email = createFrom;
    setCreateFrom(null);
    if (!email || !leadId) {
      await load();
      return;
    }
    await assign(email.id, leadId);
  };

  return (
    <Card data-testid="sl-unassigned-emails" className="border-0 shadow-none">
      <CardHeader className="gap-3 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Inbox className="h-5 w-5 text-primary" aria-hidden />
              Nepřiřazené e-maily
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Zprávy bez jednoznačné návaznosti na dříve odeslaný e-mail.
            </p>
          </div>
          <Tabs value={status} onValueChange={(value) => setStatus(value as QueueStatus)}>
            <TabsList>
              <TabsTrigger value="unassigned">K vyřízení</TabsTrigger>
              <TabsTrigger value="resolved">Vyřešené</TabsTrigger>
              <TabsTrigger value="ignored">Ignorované</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Načítám e-maily…
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500/70" aria-hidden />
            <p className="font-medium">V této části nejsou žádné zprávy.</p>
            <p className="text-sm text-muted-foreground">Nové nepřiřazené e-maily se zde objeví automaticky.</p>
          </div>
        ) : (
          <div className="divide-y">
            {emails.map((email) => {
              const busy = busyId === email.id;
              return (
                <article key={email.id} className="space-y-4 p-5 transition-colors hover:bg-muted/20">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{email.subject || 'Bez předmětu'}</h3>
                        {email.status !== 'unassigned' && <Badge variant="outline">{email.status === 'resolved' ? 'Vyřešeno' : 'Ignorováno'}</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {email.from_name ? `${email.from_name} · ` : ''}{email.from_email}
                        {' · '}{new Date(email.received_at).toLocaleString('cs-CZ')}
                      </p>
                    </div>
                    {!email.in_reply_to && email.references_ids.length === 0 && (
                      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-3 w-3" aria-hidden /> Bez návaznosti
                      </Badge>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/25 p-4 text-sm leading-6">
                    {email.body_snapshot || 'Zpráva nemá textový obsah.'}
                  </div>

                  {email.status === 'unassigned' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={selectedLead[email.id] ?? ''} onValueChange={(value) => setSelectedLead((prev) => ({ ...prev, [email.id]: value }))}>
                        <SelectTrigger className="w-full sm:w-72" aria-label="Vybrat existující lead">
                          <SelectValue placeholder="Vybrat existující lead" />
                        </SelectTrigger>
                        <SelectContent>
                          {leads.map((lead) => (
                            <SelectItem key={lead.id} value={lead.id}>
                              {lead.company_name}{lead.contact_email ? ` · ${lead.contact_email}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" disabled={busy || !selectedLead[email.id]} onClick={() => assign(email.id, selectedLead[email.id])}>
                        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}
                        Přiřadit
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setCreateFrom(email)}>
                        <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Vytvořit nový lead
                      </Button>
                      <div className="flex-1" />
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setQueueStatus(email.id, 'resolved')}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden /> Vyřešeno
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busy} onClick={() => setQueueStatus(email.id, 'ignored')}>
                        <Ban className="mr-1.5 h-4 w-4" aria-hidden /> Ignorovat
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </CardContent>

      <AddSalesLeadDialog
        open={Boolean(createFrom)}
        onOpenChange={(open) => { if (!open) setCreateFrom(null); }}
        onSuccess={handleCreated}
        initialValues={createInitialValues}
      />
    </Card>
  );
}
