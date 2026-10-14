import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { INDUSTRY_OPTIONS, rpcErrorMessage, type DuplicateConflict } from './salesLeadsShared';
import { DuplicateConflictAlert } from './DuplicateConflictAlert';
import { isNonOfficialWebsiteUrl } from '../../../../supabase/functions/_shared/officialWebsitePolicy';
import {
  applyAresResult,
  isValidSalesLeadIco,
  lookupSalesLeadAres,
  SALES_LEAD_ICO_ERROR,
} from './salesLeadAres';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (leadId?: string) => void;
  initialValues?: Partial<FormState>;
}

const EMPTY_FORM = {
  company_name: '',
  ico: '',
  dic: '',
  website: '',
  industry: '',
  city: '',
  address: '',
  company_size: '',
  contact_person: '',
  contact_role: '',
  contact_email: '',
  contact_phone: '',
  email_source: '',
  notes: '',
};

type FormState = typeof EMPTY_FORM;

/**
 * Ruční založení leadu (Fáze 3A). Zapisuje výhradně přes SECURITY DEFINER RPC
 * `sales_lead_create` — žádný přímý client INSERT (RLS nemá write policy).
 * Neposílá e-maily, nevolá AI ani Resend.
 */
export function AddSalesLeadDialog({ open, onOpenChange, onSuccess, initialValues }: Props) {
  const [loading, setLoading] = useState(false);
  const [aresLoading, setAresLoading] = useState(false);
  const [icoError, setIcoError] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [duplicateConflicts, setDuplicateConflicts] = useState<DuplicateConflict[]>([]);
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY_FORM, ...initialValues });
    setDuplicateConflicts([]);
    setOverrideReason('');
    setIcoError('');
  }, [open, initialValues]);

  const setField =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (field === 'contact_email') { setDuplicateConflicts([]); setOverrideReason(''); }
      if (field === 'ico') setIcoError('');
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const loadFromAres = async () => {
    const ico = form.ico.trim();
    if (!isValidSalesLeadIco(ico)) {
      setIcoError(SALES_LEAD_ICO_ERROR);
      return;
    }

    setAresLoading(true);
    setIcoError('');
    try {
      const outcome = await lookupSalesLeadAres(
        (functionName, options) => supabase.functions.invoke(functionName, options),
        ico,
      );
      if (!outcome.ok) {
        setIcoError(outcome.message);
        return;
      }

      setForm((prev) => applyAresResult(prev, outcome.result));
      toast.success('Údaje firmy byly načteny z ARES');
    } finally {
      setAresLoading(false);
    }
  };

  const previewDuplicate = async () => {
    const email = form.contact_email.trim();
    if (!email.includes('@')) return;
    const { data } = await (supabase as any).rpc('sales_lead_check_duplicate', {
      p_contact_email: email, p_exclude_lead_id: null,
    });
    const res = (data ?? {}) as { success?: boolean; conflicts?: DuplicateConflict[] };
    if (res.success) setDuplicateConflicts(res.conflicts ?? []);
  };

  const handleClose = () => {
    if (!loading && !aresLoading) onOpenChange(false);
  };

  const submit = async (confirmOverride: boolean) => {
    if (form.ico.trim() && !isValidSalesLeadIco(form.ico)) {
      setIcoError(SALES_LEAD_ICO_ERROR);
      return;
    }
    if (!form.company_name.trim()) {
      toast.error('Zadejte název firmy');
      return;
    }
    const website = form.website.trim();
    const normalizedWebsite = website
      ? /^https?:\/\//i.test(website)
        ? website
        : `https://${website}`
      : '';
    if (normalizedWebsite && isNonOfficialWebsiteUrl(normalizedWebsite)) {
      toast.error('Katalog, rejstřík, sociální síť ani cizí profil nelze uložit jako firemní web.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_create', {
        p_company_name: form.company_name.trim(),
        p_ico: form.ico.trim() || null,
        p_dic: form.dic.trim() || null,
        p_website: normalizedWebsite || null,
        p_industry: form.industry || null,
        p_city: form.city.trim() || null,
        p_address: form.address.trim() || null,
        p_company_size: form.company_size || null,
        p_contact_person: form.contact_person.trim() || null,
        p_contact_role: form.contact_role.trim() || null,
        p_contact_email: form.contact_email.trim() || null,
        p_contact_phone: form.contact_phone.trim() || null,
        p_email_source: form.email_source.trim() || null,
        p_notes: form.notes.trim() || null,
        p_duplicate_override: confirmOverride,
        p_duplicate_override_reason: confirmOverride ? overrideReason.trim() : null,
      });

      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; error?: string; conflicts?: DuplicateConflict[]; lead_id?: string };
      if (!res.success) {
        if (res.error === 'duplicate_conflict' || res.error === 'duplicate_override_reason_required') {
          setDuplicateConflicts(res.conflicts ?? []);
        }
        toast.error(rpcErrorMessage(res.error));
        return;
      }

      toast.success('Firma přidána do evidence');
      setForm(EMPTY_FORM);
      setDuplicateConflicts([]);
      setOverrideReason('');
      onOpenChange(false);
      onSuccess(res.lead_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nepodařilo se přidat firmu';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submit(false);
  };

  const confirmDuplicateOverride = async () => {
    if (overrideReason.trim().length < 3) {
      toast.error('Uveďte důvod výjimky alespoň 3 znaky.');
      return;
    }
    await submit(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Přidat firmu</DialogTitle>
          <DialogDescription>
            Ruční založení leadu. Firma se uloží do evidence ve stavu „Nový". Žádný e-mail se neodesílá.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="sl-ico">IČO</Label>
            <div className="flex gap-2">
              <Input id="sl-ico" value={form.ico} onChange={setField('ico')} placeholder="12345678"
                inputMode="numeric" maxLength={8} disabled={loading || aresLoading} aria-invalid={Boolean(icoError)}
                aria-describedby={icoError ? 'sl-ico-error' : undefined} data-testid="sl-ico" />
              <Button type="button" variant="outline" onClick={loadFromAres} disabled={loading || aresLoading}
                className="shrink-0 gap-2" data-testid="sl-ares-lookup">
                {aresLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Načíst z ARES
              </Button>
            </div>
            {icoError && <p id="sl-ico-error" role="alert" className="text-xs text-destructive">{icoError}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="sl-company_name">
              Název firmy <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sl-company_name"
              value={form.company_name}
              onChange={setField('company_name')}
              placeholder="Acme s.r.o."
              disabled={loading || aresLoading}
              required
              data-testid="sl-company-name"
            />
          </div>

          <DuplicateConflictAlert conflicts={duplicateConflicts} reason={overrideReason}
            onReasonChange={setOverrideReason} disabled={loading} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sl-dic">DIČ</Label>
              <Input id="sl-dic" value={form.dic} onChange={setField('dic')} placeholder="CZ12345678" disabled={loading || aresLoading} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sl-city">Město</Label>
              <Input id="sl-city" value={form.city} onChange={setField('city')} placeholder="Praha" disabled={loading || aresLoading} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sl-address">Adresa sídla</Label>
            <Input id="sl-address" value={form.address} onChange={setField('address')}
              placeholder="Ulice 123, 110 00 Praha" disabled={loading || aresLoading} maxLength={500} data-testid="sl-address" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="sl-industry">Obor</Label>
            <Select
              value={form.industry}
              onValueChange={(v) => setForm((p) => ({ ...p, industry: v }))}
              disabled={loading}
            >
              <SelectTrigger id="sl-industry">
                <SelectValue placeholder="Vyberte obor" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sl-website">Web firmy</Label>
            <Input
              id="sl-website"
              value={form.website}
              onChange={setField('website')}
              placeholder="https://acme.cz"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sl-contact_person">Kontaktní osoba</Label>
              <Input
                id="sl-contact_person"
                value={form.contact_person}
                onChange={setField('contact_person')}
                placeholder="Jana Nováková"
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sl-contact_role">Funkce</Label>
              <Input
                id="sl-contact_role"
                value={form.contact_role}
                onChange={setField('contact_role')}
                placeholder="jednatel / marketing"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sl-contact_email">Kontaktní e-mail</Label>
              <Input
                id="sl-contact_email"
                type="email"
                value={form.contact_email}
                onChange={setField('contact_email')}
                onBlur={previewDuplicate}
                placeholder="info@acme.cz"
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sl-contact_phone">Telefon</Label>
              <Input
                id="sl-contact_phone"
                type="tel"
                value={form.contact_phone}
                onChange={setField('contact_phone')}
                placeholder="+420 600 100 200"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="sl-email_source">Zdroj e-mailu</Label>
            <Input
              id="sl-email_source"
              value={form.email_source}
              onChange={setField('email_source')}
              placeholder="web firmy / veřejný rejstřík / ručně"
              disabled={loading}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="sl-notes">Interní poznámka</Label>
            <Textarea
              id="sl-notes"
              value={form.notes}
              onChange={setField('notes')}
              placeholder="Kontext o firmě, proč je vhodný partner…"
              disabled={loading}
              rows={3}
              maxLength={2000}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Zrušit
            </Button>
            <Button type={duplicateConflicts.length > 0 ? 'button' : 'submit'} disabled={loading}
              onClick={duplicateConflicts.length > 0 ? confirmDuplicateOverride : undefined}
              variant={duplicateConflicts.length > 0 ? 'destructive' : 'default'} className="gap-2" data-testid="sl-submit-btn">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {duplicateConflicts.length > 0 ? 'Potvrdit výjimku a pokračovat' : 'Přidat firmu'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
