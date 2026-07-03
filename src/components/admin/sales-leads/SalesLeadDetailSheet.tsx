import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import {
  INDUSTRY_OPTIONS,
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  allowedTargets,
  isReasonRequired,
  rpcErrorMessage,
  type SalesLeadDetail,
} from './salesLeadsShared';

interface Props {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Zavolá se po jakékoli úspěšné mutaci, aby se seznam v rodiči obnovil. */
  onMutated: () => void;
}

interface ActivityRow {
  id: string;
  activity_type: string;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
}

const DETAIL_COLUMNS =
  'id, company_name, industry, city, status, contact_email, updated_at, assigned_admin_id, ' +
  'ico, dic, website, company_size, contact_person, contact_role, contact_phone, email_source, ' +
  'email_verified_by_admin, do_not_contact, do_not_contact_reason, notes, created_at';

const ACTIVITY_LABELS: Record<string, string> = {
  lead_created: 'Lead založen',
  field_updated: 'Údaje upraveny',
  status_changed: 'Změna stavu',
  do_not_contact_set: 'Označeno „Nekontaktovat"',
  converted: 'Konvertován na partnera',
  note_added: 'Přidána poznámka',
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

type EditForm = {
  company_name: string;
  ico: string;
  dic: string;
  website: string;
  industry: string;
  city: string;
  company_size: string;
  contact_person: string;
  contact_role: string;
  contact_email: string;
  contact_phone: string;
  email_source: string;
  email_verified_by_admin: boolean;
  notes: string;
};

const toForm = (l: SalesLeadDetail): EditForm => ({
  company_name: l.company_name ?? '',
  ico: l.ico ?? '',
  dic: l.dic ?? '',
  website: l.website ?? '',
  industry: l.industry ?? '',
  city: l.city ?? '',
  company_size: l.company_size ?? '',
  contact_person: l.contact_person ?? '',
  contact_role: l.contact_role ?? '',
  contact_email: l.contact_email ?? '',
  contact_phone: l.contact_phone ?? '',
  email_source: l.email_source ?? '',
  email_verified_by_admin: l.email_verified_by_admin ?? false,
  notes: l.notes ?? '',
});

export function SalesLeadDetailSheet({ leadId, open, onOpenChange, onMutated }: Props) {
  const { isSuperAdmin } = useUserRole();
  const [lead, setLead] = useState<SalesLeadDetail | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  // Změna stavu: vybraný cíl + důvod.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const [{ data: leadData, error: leadErr }, { data: actData }] = await Promise.all([
        (supabase as any).from('sales_leads').select(DETAIL_COLUMNS).eq('id', leadId).single(),
        (supabase as any)
          .from('sales_lead_activities')
          .select('id, activity_type, created_at, metadata')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (leadErr) throw new Error(leadErr.message);
      setLead(leadData as SalesLeadDetail);
      setActivities((actData ?? []) as ActivityRow[]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nepodařilo se načíst detail';
      toast.error(msg);
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (open && leadId) {
      setEditing(false);
      setPendingStatus(null);
      setReason('');
      load();
    }
  }, [open, leadId, load]);

  const startEdit = () => {
    if (lead) {
      setForm(toForm(lead));
      setEditing(true);
    }
  };

  const setField =
    (field: keyof EditForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => (prev ? { ...prev, [field]: e.target.value } : prev));

  const saveEdit = async () => {
    if (!lead || !form) return;
    if (!form.company_name.trim()) {
      toast.error('Název firmy je povinný');
      return;
    }
    const website = form.website.trim();
    const normalizedWebsite = website
      ? /^https?:\/\//i.test(website)
        ? website
        : `https://${website}`
      : '';
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_update_fields', {
        p_lead_id: lead.id,
        p_company_name: form.company_name.trim(),
        p_ico: form.ico.trim() || null,
        p_dic: form.dic.trim() || null,
        p_website: normalizedWebsite || null,
        p_industry: form.industry || null,
        p_city: form.city.trim() || null,
        p_company_size: form.company_size || null,
        p_contact_person: form.contact_person.trim() || null,
        p_contact_role: form.contact_role.trim() || null,
        p_contact_email: form.contact_email.trim() || null,
        p_contact_phone: form.contact_phone.trim() || null,
        p_email_source: form.email_source.trim() || null,
        p_email_verified_by_admin: form.email_verified_by_admin,
        p_notes: form.notes.trim() || null,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      toast.success('Údaje uloženy');
      setEditing(false);
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Uložení se nezdařilo';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const targets = useMemo(
    () => (lead ? allowedTargets(lead.status, isSuperAdmin) : []),
    [lead, isSuperAdmin],
  );

  const confirmStatusChange = async () => {
    if (!lead || !pendingStatus) return;
    if (isReasonRequired(lead.status, pendingStatus) && !reason.trim()) {
      toast.error('U této změny stavu je nutné uvést důvod.');
      return;
    }
    setStatusBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_set_status', {
        p_lead_id: lead.id,
        p_new_status: pendingStatus,
        p_reason: reason.trim() || null,
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string };
      if (!res.success) {
        toast.error(rpcErrorMessage(res.error));
        return;
      }
      toast.success('Stav změněn');
      setPendingStatus(null);
      setReason('');
      await load();
      onMutated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Změna stavu se nezdařila';
      toast.error(msg);
    } finally {
      setStatusBusy(false);
    }
  };

  const ReadRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2 break-words">{value || '—'}</span>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {loading || !lead ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Načítám…
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center justify-between gap-3 pr-6">
                <SheetTitle className="text-left">{lead.company_name}</SheetTitle>
                <Badge variant="outline" className={STATUS_BADGE_CLASS[lead.status] ?? ''}>
                  {STATUS_LABELS[lead.status] ?? lead.status}
                </Badge>
              </div>
              <SheetDescription className="text-left">
                Detail leadu · založeno {formatDateTime(lead.created_at)}
              </SheetDescription>
            </SheetHeader>

            {/* Změna stavu */}
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Změna stavu</div>
              {targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Z tohoto stavu není povolen žádný přechod.</p>
              ) : pendingStatus ? (
                <div className="rounded-lg border border-border/60 p-3 space-y-2">
                  <p className="text-sm">
                    Změnit stav na <strong>{STATUS_LABELS[pendingStatus]}</strong>?
                  </p>
                  {(isReasonRequired(lead.status, pendingStatus) || pendingStatus === 'nekontaktovat') && (
                    <div className="space-y-1">
                      <Label htmlFor="sl-reason" className="text-xs">
                        Důvod {isReasonRequired(lead.status, pendingStatus) && <span className="text-destructive">*</span>}
                      </Label>
                      <Textarea
                        id="sl-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        className="resize-none"
                        disabled={statusBusy}
                        placeholder="Krátké odůvodnění…"
                      />
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setPendingStatus(null); setReason(''); }}
                      disabled={statusBusy}
                    >
                      Zrušit
                    </Button>
                    <Button size="sm" onClick={confirmStatusChange} disabled={statusBusy} className="gap-1.5">
                      {statusBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Potvrdit
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {targets.map((t) => (
                    <Button
                      key={t}
                      variant="outline"
                      size="sm"
                      onClick={() => { setPendingStatus(t); setReason(''); }}
                    >
                      {STATUS_LABELS[t]}
                    </Button>
                  ))}
                </div>
              )}
              {lead.do_not_contact && lead.do_not_contact_reason && (
                <p className="text-xs text-destructive">Nekontaktovat: {lead.do_not_contact_reason}</p>
              )}
            </div>

            <Separator className="my-4" />

            {/* Údaje firmy */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Údaje firmy</div>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={startEdit} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Upravit
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Zrušit
                </Button>
              )}
            </div>

            {!editing || !form ? (
              <div className="mt-2 divide-y divide-border/40">
                <ReadRow label="Název" value={lead.company_name} />
                <ReadRow label="IČO" value={lead.ico} />
                <ReadRow label="DIČ" value={lead.dic} />
                <ReadRow label="Web" value={lead.website} />
                <ReadRow label="Obor" value={INDUSTRY_OPTIONS.find((o) => o.value === lead.industry)?.label ?? lead.industry} />
                <ReadRow label="Město" value={lead.city} />
                <ReadRow label="Velikost" value={lead.company_size} />
                <ReadRow label="Kontakt" value={lead.contact_person} />
                <ReadRow label="Funkce" value={lead.contact_role} />
                <ReadRow label="E-mail" value={lead.contact_email} />
                <ReadRow label="Telefon" value={lead.contact_phone} />
                <ReadRow label="Zdroj e-mailu" value={lead.email_source} />
                <ReadRow label="E-mail ověřen" value={lead.email_verified_by_admin ? 'Ano' : 'Ne'} />
                <ReadRow label="Poznámka" value={lead.notes} />
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="e-company_name">Název firmy <span className="text-destructive">*</span></Label>
                  <Input id="e-company_name" value={form.company_name} onChange={setField('company_name')} disabled={saving} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="e-ico">IČO</Label>
                    <Input id="e-ico" value={form.ico} onChange={setField('ico')} disabled={saving} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="e-dic">DIČ</Label>
                    <Input id="e-dic" value={form.dic} onChange={setField('dic')} disabled={saving} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="e-website">Web</Label>
                  <Input id="e-website" value={form.website} onChange={setField('website')} disabled={saving} placeholder="https://…" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="e-industry">Obor</Label>
                    <Select value={form.industry} onValueChange={(v) => setForm((p) => (p ? { ...p, industry: v } : p))} disabled={saving}>
                      <SelectTrigger id="e-industry"><SelectValue placeholder="Vyberte" /></SelectTrigger>
                      <SelectContent>
                        {INDUSTRY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="e-city">Město</Label>
                    <Input id="e-city" value={form.city} onChange={setField('city')} disabled={saving} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="e-company_size">Velikost firmy</Label>
                  <Input id="e-company_size" value={form.company_size} onChange={setField('company_size')} disabled={saving} placeholder="mikro / malá / střední / velká" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="e-contact_person">Kontaktní osoba</Label>
                    <Input id="e-contact_person" value={form.contact_person} onChange={setField('contact_person')} disabled={saving} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="e-contact_role">Funkce</Label>
                    <Input id="e-contact_role" value={form.contact_role} onChange={setField('contact_role')} disabled={saving} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="e-contact_email">E-mail</Label>
                    <Input id="e-contact_email" type="email" value={form.contact_email} onChange={setField('contact_email')} disabled={saving} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="e-contact_phone">Telefon</Label>
                    <Input id="e-contact_phone" type="tel" value={form.contact_phone} onChange={setField('contact_phone')} disabled={saving} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="e-email_source">Zdroj e-mailu</Label>
                  <Input id="e-email_source" value={form.email_source} onChange={setField('email_source')} disabled={saving} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.email_verified_by_admin}
                    onCheckedChange={(c) => setForm((p) => (p ? { ...p, email_verified_by_admin: c === true } : p))}
                    disabled={saving}
                  />
                  E-mail je ověřený veřejný firemní kontakt
                </label>
                <div className="space-y-1">
                  <Label htmlFor="e-notes">Interní poznámka</Label>
                  <Textarea id="e-notes" value={form.notes} onChange={setField('notes')} rows={3} className="resize-none" disabled={saving} maxLength={2000} />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Zrušit</Button>
                  <Button onClick={saveEdit} disabled={saving} className="gap-1.5">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Uložit
                  </Button>
                </div>
              </div>
            )}

            <Separator className="my-4" />

            {/* Historie */}
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Historie kontaktu</div>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Zatím žádná aktivita.</p>
            ) : (
              <ul className="space-y-2">
                {activities.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    <div>
                      <div className="font-medium">{ACTIVITY_LABELS[a.activity_type] ?? a.activity_type}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
