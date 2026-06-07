import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const EMPTY_FORM = {
  company_name: '',
  company_email: '',
  ico: '',
  dic: '',
  website: '',
  contact_person: '',
  contact_phone: '',
  sales_rep_note: '',
};

export function AddCompanyLeadDialog({ open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const set =
    (field: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.company_name.trim()) {
      toast.error('Zadejte název firmy');
      return;
    }
    if (!form.company_email.trim()) {
      toast.error('Zadejte e-mail firmy');
      return;
    }

    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Nejste přihlášeni');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const payload: Record<string, string> = {
        company_name: form.company_name.trim(),
        company_email: form.company_email.trim(),
      };
      if (form.ico.trim())            payload.ico            = form.ico.trim();
      if (form.dic.trim())            payload.dic            = form.dic.trim();
      if (form.website.trim())        payload.website        = form.website.trim();
      if (form.contact_person.trim()) payload.contact_person = form.contact_person.trim();
      if (form.contact_phone.trim())  payload.contact_phone  = form.contact_phone.trim();
      if (form.sales_rep_note.trim()) payload.sales_rep_note = form.sales_rep_note.trim();

      const res = await fetch(
        `${supabaseUrl}/functions/v1/create-affiliate-company-lead`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: anonKey,
          },
          body: JSON.stringify(payload),
        },
      );

      const body = (await res.json()) as Record<string, unknown>;

      if (res.status === 409) {
        toast.error('Žádost již existuje', {
          description: 'Pro tuto firmu již evidujete aktivní žádost.',
        });
        return;
      }
      if (res.status === 403) {
        toast.error('Nemáte oprávnění', {
          description: 'Váš účet nemá aktivní Obchodník přístup.',
        });
        return;
      }
      if (!res.ok || !body.success) {
        throw new Error((body.message as string) || 'Nepodařilo se odeslat žádost');
      }

      toast.success('Žádost odeslána firmě', {
        description:
          'Firma obdrží e-mail s žádostí o potvrzení registrace do OneMil.',
      });
      setForm(EMPTY_FORM);
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nepodařilo se odeslat žádost';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'bg-[hsl(var(--muted)/0.4)] border-[hsl(var(--border)/0.5)] text-[hsl(var(--text-silver))] placeholder:text-[hsl(var(--text-muted-gray)/0.5)]';
  const labelCls = 'text-sm';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-[hsl(var(--card))] border-[hsl(var(--border)/0.5)]">
        <DialogHeader>
          <DialogTitle className="text-[hsl(var(--text-silver))]">
            Pozvat firmu do OneMil
          </DialogTitle>
          <p className="text-sm text-[hsl(var(--text-muted-gray))]">
            Vyplňte kontaktní údaje firmy. Firma dostane e-mail s žádostí o potvrzení.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Povinná pole */}
          <div className="space-y-1">
            <Label htmlFor="acl-company_name" className={labelCls}>
              Název firmy <span className="text-destructive">*</span>
            </Label>
            <Input
              id="acl-company_name"
              value={form.company_name}
              onChange={set('company_name')}
              placeholder="Acme s.r.o."
              disabled={loading}
              required
              className={inputCls}
              data-testid="acl-company-name"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="acl-company_email" className={labelCls}>
              E-mail firmy <span className="text-destructive">*</span>
            </Label>
            <Input
              id="acl-company_email"
              type="email"
              value={form.company_email}
              onChange={set('company_email')}
              placeholder="info@acme.cz"
              disabled={loading}
              required
              className={inputCls}
              data-testid="acl-company-email"
            />
          </div>

          {/* IČO / DIČ */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="acl-ico" className={`${labelCls} text-[hsl(var(--text-muted-gray))]`}>
                IČO
              </Label>
              <Input
                id="acl-ico"
                value={form.ico}
                onChange={set('ico')}
                placeholder="12345678"
                disabled={loading}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="acl-dic" className={`${labelCls} text-[hsl(var(--text-muted-gray))]`}>
                DIČ
              </Label>
              <Input
                id="acl-dic"
                value={form.dic}
                onChange={set('dic')}
                placeholder="CZ12345678"
                disabled={loading}
                className={inputCls}
              />
            </div>
          </div>

          {/* Web */}
          <div className="space-y-1">
            <Label htmlFor="acl-website" className={`${labelCls} text-[hsl(var(--text-muted-gray))]`}>
              Web firmy
            </Label>
            <Input
              id="acl-website"
              type="url"
              value={form.website}
              onChange={set('website')}
              placeholder="https://acme.cz"
              disabled={loading}
              className={inputCls}
            />
          </div>

          {/* Kontaktní osoba / Telefon */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="acl-contact_person" className={`${labelCls} text-[hsl(var(--text-muted-gray))]`}>
                Kontaktní osoba
              </Label>
              <Input
                id="acl-contact_person"
                value={form.contact_person}
                onChange={set('contact_person')}
                placeholder="Jana Nováková"
                disabled={loading}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="acl-contact_phone" className={`${labelCls} text-[hsl(var(--text-muted-gray))]`}>
                Telefon
              </Label>
              <Input
                id="acl-contact_phone"
                type="tel"
                value={form.contact_phone}
                onChange={set('contact_phone')}
                placeholder="+420 600 100 200"
                disabled={loading}
                className={inputCls}
              />
            </div>
          </div>

          {/* Poznámka */}
          <div className="space-y-1">
            <Label htmlFor="acl-sales_rep_note" className={`${labelCls} text-[hsl(var(--text-muted-gray))]`}>
              Poznámka pro OneMil
            </Label>
            <Textarea
              id="acl-sales_rep_note"
              value={form.sales_rep_note}
              onChange={set('sales_rep_note')}
              placeholder="Kontext o firmě, způsob kontaktu, proč je vhodný partner..."
              disabled={loading}
              maxLength={2000}
              rows={3}
              className={`${inputCls} resize-none`}
            />
            <p className="text-xs text-[hsl(var(--text-muted-gray)/0.6)] text-right">
              {form.sales_rep_note.length}/2000
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="border-[hsl(var(--border)/0.5)]"
            >
              Zrušit
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-[hsl(var(--neon-gold))] text-[hsl(220_45%_8%)] hover:bg-[hsl(43_90%_48%)] font-semibold gap-2"
              data-testid="acl-submit-btn"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Odeslat žádost
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
