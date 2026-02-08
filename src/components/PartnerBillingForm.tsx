import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save, Building2 } from 'lucide-react';

interface BillingData {
  company_name: string;
  ico: string;
  dic: string;
  billing_street: string;
  billing_city: string;
  billing_zip: string;
  billing_country: string;
  contact_email: string;
}

interface PartnerBillingFormProps {
  partnerId: string;
  initialData: BillingData;
  onSaved?: () => void;
}

const PartnerBillingForm: React.FC<PartnerBillingFormProps> = ({ partnerId, initialData, onSaved }) => {
  const [form, setForm] = useState<BillingData>(initialData);
  const [saving, setSaving] = useState(false);

  // Sync if parent reloads partner data
  useEffect(() => {
    setForm(initialData);
  }, [initialData]);

  const hasChanges = () => {
    return (Object.keys(initialData) as (keyof BillingData)[]).some(
      (key) => (form[key] ?? '') !== (initialData[key] ?? '')
    );
  };

  const handleChange = (field: keyof BillingData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    // Validate required fields
    const trimmedCompany = form.company_name.trim();
    const trimmedIco = form.ico.trim();
    const trimmedEmail = form.contact_email.trim();

    if (!trimmedCompany) {
      toast.error('Název společnosti je povinný');
      return;
    }
    if (!trimmedIco) {
      toast.error('IČO je povinné');
      return;
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error('Neplatný formát e-mailu');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('partners')
        .update({
          company_name: trimmedCompany,
          ico: trimmedIco,
          dic: form.dic.trim() || null,
          billing_street: form.billing_street.trim() || null,
          billing_city: form.billing_city.trim() || null,
          billing_zip: form.billing_zip.trim() || null,
          billing_country: form.billing_country.trim() || null,
          contact_email: trimmedEmail || null,
        })
        .eq('id', partnerId);

      if (error) throw error;

      toast.success('Fakturační údaje byly uloženy');
      onSaved?.();
    } catch (error) {
      console.error('Error saving billing data:', error);
      toast.error('Nepodařilo se uložit fakturační údaje');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Fakturační údaje
        </CardTitle>
        <CardDescription>
          Údaje použité na fakturách za aktivace MioCoinů
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Company Name */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="billing-company">Název společnosti *</Label>
            <Input
              id="billing-company"
              value={form.company_name}
              onChange={(e) => handleChange('company_name', e.target.value)}
              placeholder="např. Firma s.r.o."
              maxLength={200}
            />
          </div>

          {/* ICO */}
          <div className="space-y-1.5">
            <Label htmlFor="billing-ico">IČO *</Label>
            <Input
              id="billing-ico"
              value={form.ico}
              onChange={(e) => handleChange('ico', e.target.value)}
              placeholder="12345678"
              maxLength={20}
            />
          </div>

          {/* DIC */}
          <div className="space-y-1.5">
            <Label htmlFor="billing-dic">DIČ</Label>
            <Input
              id="billing-dic"
              value={form.dic}
              onChange={(e) => handleChange('dic', e.target.value)}
              placeholder="CZ12345678"
              maxLength={20}
            />
            <p className="text-xs text-muted-foreground">Nepovinné – vyplňte pokud jste plátce DPH</p>
          </div>

          {/* Street */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="billing-street">Ulice a číslo popisné</Label>
            <Input
              id="billing-street"
              value={form.billing_street}
              onChange={(e) => handleChange('billing_street', e.target.value)}
              placeholder="např. Hlavní 123"
              maxLength={200}
            />
          </div>

          {/* City */}
          <div className="space-y-1.5">
            <Label htmlFor="billing-city">Město</Label>
            <Input
              id="billing-city"
              value={form.billing_city}
              onChange={(e) => handleChange('billing_city', e.target.value)}
              placeholder="např. Praha"
              maxLength={100}
            />
          </div>

          {/* ZIP */}
          <div className="space-y-1.5">
            <Label htmlFor="billing-zip">PSČ</Label>
            <Input
              id="billing-zip"
              value={form.billing_zip}
              onChange={(e) => handleChange('billing_zip', e.target.value)}
              placeholder="110 00"
              maxLength={10}
            />
          </div>

          {/* Country */}
          <div className="space-y-1.5">
            <Label htmlFor="billing-country">Země</Label>
            <Input
              id="billing-country"
              value={form.billing_country}
              onChange={(e) => handleChange('billing_country', e.target.value)}
              placeholder="Česká republika"
              maxLength={100}
            />
          </div>

          {/* Contact Email */}
          <div className="space-y-1.5">
            <Label htmlFor="billing-email">Kontaktní e-mail</Label>
            <Input
              id="billing-email"
              type="email"
              value={form.contact_email}
              onChange={(e) => handleChange('contact_email', e.target.value)}
              placeholder="fakturace@firma.cz"
              maxLength={255}
            />
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges()}
            size="sm"
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Uložit fakturační údaje
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PartnerBillingForm;
