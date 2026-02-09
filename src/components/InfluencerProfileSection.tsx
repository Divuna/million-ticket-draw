import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  User,
  Mail,
  Phone,
  Globe,
  Building,
  CreditCard,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface ProfileData {
  name: string;
  contact_email: string;
  contact_phone: string;
  website_url: string;
  billing_street: string;
  billing_city: string;
  billing_zip: string;
  billing_country: string;
  currency: string;
  status: string;
  company_name: string;
  ico: string;
}

interface Props {
  partnerId: string;
}

const InfluencerProfileSection: React.FC<Props> = ({ partnerId }) => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('partners')
        .select('name, contact_email, contact_phone, website_url, billing_street, billing_city, billing_zip, billing_country, currency, status, company_name, ico')
        .eq('id', partnerId)
        .single();
      if (!error && data) {
        setProfile({
          name: data.name || '',
          contact_email: (data.contact_email as string) || '',
          contact_phone: (data.contact_phone as string) || '',
          website_url: data.website_url || '',
          billing_street: (data.billing_street as string) || '',
          billing_city: (data.billing_city as string) || '',
          billing_zip: (data.billing_zip as string) || '',
          billing_country: (data.billing_country as string) || '',
          currency: data.currency || 'CZK',
          status: data.status || '',
          company_name: (data.company_name as string) || '',
          ico: (data.ico as string) || '',
        });
      }
      setLoading(false);
    };
    load();
  }, [partnerId]);

  const handleChange = (field: keyof ProfileData, value: string) => {
    if (!profile) return;
    setProfile({ ...profile, [field]: value });
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('partners')
      .update({
        name: profile.name,
        contact_email: profile.contact_email || null,
        contact_phone: profile.contact_phone || null,
        website_url: profile.website_url,
        billing_street: profile.billing_street || null,
        billing_city: profile.billing_city || null,
        billing_zip: profile.billing_zip || null,
        billing_country: profile.billing_country || null,
        currency: profile.currency,
      })
      .eq('id', partnerId);
    setSaving(false);
    if (error) {
      toast.error('Nepodařilo se uložit změny');
    } else {
      toast.success('Profil byl úspěšně uložen');
    }
  };

  const isPayoutReady = profile
    ? !!(profile.billing_street && profile.billing_city && profile.billing_zip && profile.contact_email)
    : false;

  const statusLabel = (s: string) => {
    switch (s) {
      case 'approved': return 'Schválený';
      case 'pending': return 'Čeká na schválení';
      case 'rejected': return 'Zamítnutý';
      case 'suspended': return 'Pozastavený';
      default: return s;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'approved': return 'bg-[hsl(160_55%_45%/0.15)] text-[hsl(160_55%_45%)] border-[hsl(160_55%_45%/0.3)]';
      case 'pending': return 'bg-[hsl(43_90%_55%/0.15)] text-[hsl(43_90%_55%)] border-[hsl(43_90%_55%/0.3)]';
      default: return 'bg-[hsl(0_72%_51%/0.15)] text-[hsl(0_72%_51%)] border-[hsl(0_72%_51%/0.3)]';
    }
  };

  if (loading) {
    return (
      <div className="luxury-card p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--neon-gold))]" />
      </div>
    );
  }

  if (!profile) return null;

  const Field = ({ icon: Icon, label, field, placeholder, readOnly = false }: {
    icon: React.ElementType;
    label: string;
    field: keyof ProfileData;
    placeholder: string;
    readOnly?: boolean;
  }) => (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))] flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </label>
      <Input
        value={profile[field]}
        onChange={(e) => handleChange(field, e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className="bg-[hsl(var(--muted)/0.4)] border-[hsl(var(--border)/0.5)] text-sm"
      />
    </div>
  );

  return (
    <div className="luxury-card overflow-hidden">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
            <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Profil a výplaty</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColor(profile.status)}`}>
              {statusLabel(profile.status)}
            </span>
          </div>
        </div>

        {/* Status bar */}
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${
          isPayoutReady
            ? 'border-[hsl(160_55%_45%/0.3)] bg-[hsl(160_55%_45%/0.06)]'
            : 'border-[hsl(43_90%_55%/0.3)] bg-[hsl(43_90%_55%/0.06)]'
        }`}>
          {isPayoutReady ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-[hsl(160_55%_45%)] shrink-0" />
              <span className="text-sm text-[hsl(160_55%_45%)]">Připraveno k výplatě</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-[hsl(43_90%_55%)] shrink-0" />
              <span className="text-sm text-[hsl(43_90%_55%)]">Chybí údaje pro výplatu — doplňte adresu a e-mail</span>
            </>
          )}
        </div>

        {/* Profile fields */}
        <div>
          <p className="text-xs font-medium text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-3">Kontaktní údaje</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field icon={User} label="Jméno / Nick" field="name" placeholder="Vaše jméno" />
            <Field icon={Mail} label="Kontaktní e-mail" field="contact_email" placeholder="email@example.com" />
            <Field icon={Phone} label="Telefon" field="contact_phone" placeholder="+420 ..." />
            <Field icon={Globe} label="Web / Sociální síť" field="website_url" placeholder="https://..." />
          </div>
        </div>

        {/* Payout fields */}
        <div>
          <p className="text-xs font-medium text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-1">Fakturační adresa</p>
          <p className="text-xs text-[hsl(var(--text-muted-gray))] mb-3">Na tuto adresu budou zasílány vaše výplaty.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field icon={Building} label="Ulice" field="billing_street" placeholder="Ulice a číslo popisné" />
            <Field icon={Building} label="Město" field="billing_city" placeholder="Praha" />
            <Field icon={Building} label="PSČ" field="billing_zip" placeholder="110 00" />
            <Field icon={Globe} label="Země" field="billing_country" placeholder="Česká republika" />
          </div>
        </div>

        {/* Read-only company info */}
        {(profile.company_name || profile.ico) && (
          <div>
            <p className="text-xs font-medium text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-3">Firemní údaje (pouze pro čtení)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {profile.company_name && (
                <Field icon={Building} label="Název firmy" field="company_name" placeholder="" readOnly />
              )}
              {profile.ico && (
                <Field icon={CreditCard} label="IČO" field="ico" placeholder="" readOnly />
              )}
            </div>
          </div>
        )}

        {/* Save */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-2 bg-[hsl(var(--neon-gold))] text-[hsl(220_45%_8%)] hover:bg-[hsl(43_90%_48%)] font-semibold"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Ukládám...' : 'Uložit změny'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InfluencerProfileSection;
