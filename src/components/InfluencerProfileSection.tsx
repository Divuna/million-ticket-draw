/**
 * INFLUENCER SYSTEM — Monetary CZK payouts, invoiced, admin-controlled.
 * Manages influencer profile & payout details via the `partners` table.
 * ⚠️  Intentionally separate from the Player referral system. MUST NOT be unified.
 */
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
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
  Landmark,
  Camera,
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
  payout_account: string;
  payout_bank: string;
  payout_currency: string;
  payout_ready: boolean;
}

interface Props {
  partnerId: string;
  logoUrl?: string;
  onLogoUpdated?: () => void;
}

const InfluencerProfileSection: React.FC<Props> = ({ partnerId, logoUrl, onLogoUpdated }) => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('partners')
        .select('name, contact_email, contact_phone, website_url, billing_street, billing_city, billing_zip, billing_country, currency, status, company_name, ico, payout_account, payout_bank, payout_currency, payout_ready')
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
          payout_account: (data.payout_account as string) || '',
          payout_bank: (data.payout_bank as string) || '',
          payout_currency: (data.payout_currency as string) || 'CZK',
          payout_ready: data.payout_ready || false,
        });
      }
      setLoading(false);
    };
    load();
  }, [partnerId]);

  const handleChange = (field: keyof ProfileData, value: string) => {
    setProfile(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const computePayoutReady = (account: string): boolean => {
    return !!account && account.trim().length >= 8;
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    const newPayoutReady = computePayoutReady(profile.payout_account);
    const wasPayoutReady = profile.payout_ready;

    const updatePayload: Record<string, unknown> = {
      name: profile.name,
      contact_email: profile.contact_email || null,
      contact_phone: profile.contact_phone || null,
      website_url: profile.website_url,
      billing_street: profile.billing_street || null,
      billing_city: profile.billing_city || null,
      billing_zip: profile.billing_zip || null,
      billing_country: profile.billing_country || null,
      currency: profile.currency,
      payout_account: profile.payout_account || null,
      payout_bank: profile.payout_bank || null,
      payout_ready: newPayoutReady,
    };

    if (newPayoutReady && !wasPayoutReady) {
      updatePayload.payout_updated_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('partners')
      .update(updatePayload)
      .eq('id', partnerId);

    setSaving(false);
    if (error) {
      toast.error('Nepodařilo se uložit změny');
    } else {
      setProfile(prev => prev ? { ...prev, payout_ready: newPayoutReady } : prev);
      toast.success('Profil byl úspěšně uložen');
    }
  };

  const isPayoutReady = profile ? computePayoutReady(profile.payout_account) : false;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Nahrajte prosím obrázek (JPG, PNG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Maximální velikost souboru je 5 MB');
      return;
    }

    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${partnerId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('partner-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('partner-logos')
        .getPublicUrl(filePath);

      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('partners')
        .update({ logo_url: publicUrl })
        .eq('id', partnerId);

      if (updateError) throw updateError;

      toast.success('Profilové foto bylo aktualizováno');
      onLogoUpdated?.();
    } catch (err) {
      console.error('Photo upload error:', err);
      toast.error('Nepodařilo se nahrát foto');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
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

  const inputClass = "w-full bg-[hsl(var(--muted)/0.4)] border border-[hsl(var(--border)/0.5)] rounded-md px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-2";
  const readOnlyClass = "w-full bg-[hsl(var(--muted)/0.2)] border border-[hsl(var(--border)/0.3)] rounded-md px-3 py-2 text-sm text-[hsl(var(--muted-foreground))] cursor-not-allowed";
  const labelClass = "text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))] flex items-center gap-1.5";

  return (
    <div className="luxury-card overflow-hidden">
      <div className="p-6 space-y-6">
        {/* Header with avatar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <Avatar className="w-14 h-14 border-2 border-[hsl(var(--border)/0.5)]">
                {logoUrl ? (
                  <AvatarImage src={logoUrl} alt="Profilové foto" />
                ) : null}
                <AvatarFallback className="bg-[hsl(var(--muted)/0.5)] text-[hsl(var(--text-muted-gray))]">
                  <User className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-wait"
              >
                {uploadingPhoto ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Profil a výplaty</h3>
              <p className="text-[11px] text-[hsl(var(--text-muted-gray))]">Klikněte na foto pro změnu</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColor(profile.status)}`}>
              {statusLabel(profile.status)}
            </span>
          </div>
        </div>

        {/* Payout status bar */}
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
              <span className="text-sm text-[hsl(43_90%_55%)]">Chybí údaje pro výplatu — doplňte číslo účtu (min. 8 znaků)</span>
            </>
          )}
        </div>

        {/* Contact fields */}
        <div>
          <p className="text-xs font-medium text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-3">Kontaktní údaje</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}><User className="w-3.5 h-3.5" />Jméno / Nick</label>
              <input className={inputClass} value={profile.name} onChange={e => handleChange('name', e.target.value)} placeholder="Vaše jméno" />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}><Mail className="w-3.5 h-3.5" />Kontaktní e-mail</label>
              <input className={inputClass} value={profile.contact_email} onChange={e => handleChange('contact_email', e.target.value)} placeholder="email@example.com" />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}><Phone className="w-3.5 h-3.5" />Telefon</label>
              <input className={inputClass} value={profile.contact_phone} onChange={e => handleChange('contact_phone', e.target.value)} placeholder="+420 ..." />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}><Globe className="w-3.5 h-3.5" />Web / Sociální síť</label>
              <input className={inputClass} value={profile.website_url} onChange={e => handleChange('website_url', e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </div>

        {/* Payout fields */}
        <div>
          <p className="text-xs font-medium text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-1">Platební údaje</p>
          <p className="text-xs text-[hsl(var(--text-muted-gray))] mb-3">Na tento účet budou zasílány vaše výplaty.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}><Landmark className="w-3.5 h-3.5" />Číslo účtu / IBAN</label>
              <input className={inputClass} value={profile.payout_account} onChange={e => handleChange('payout_account', e.target.value)} placeholder="123456789/0800 nebo CZ65 0800 0000 0012 3456 7899" />
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">U českého účtu uveďte i kód banky za lomítkem.</p>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}><Building className="w-3.5 h-3.5" />Banka (volitelné)</label>
              <input className={inputClass} value={profile.payout_bank} onChange={e => handleChange('payout_bank', e.target.value)} placeholder="Název banky" />
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Pouze pro přehled – výplata se řídí číslem účtu.</p>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}><CreditCard className="w-3.5 h-3.5" />Měna výplaty</label>
              <input className={readOnlyClass} value={profile.payout_currency} readOnly />
            </div>
          </div>
        </div>

        {/* Billing address */}
        <div>
          <p className="text-xs font-medium text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-3">Fakturační adresa</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}><Building className="w-3.5 h-3.5" />Ulice</label>
              <input className={inputClass} value={profile.billing_street} onChange={e => handleChange('billing_street', e.target.value)} placeholder="Ulice a číslo popisné" />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}><Building className="w-3.5 h-3.5" />Město</label>
              <input className={inputClass} value={profile.billing_city} onChange={e => handleChange('billing_city', e.target.value)} placeholder="Praha" />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}><Building className="w-3.5 h-3.5" />PSČ</label>
              <input className={inputClass} value={profile.billing_zip} onChange={e => handleChange('billing_zip', e.target.value)} placeholder="110 00" />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}><Globe className="w-3.5 h-3.5" />Země</label>
              <input className={inputClass} value={profile.billing_country} onChange={e => handleChange('billing_country', e.target.value)} placeholder="Česká republika" />
            </div>
          </div>
        </div>

        {/* Read-only company info */}
        {(profile.company_name || profile.ico) && (
          <div>
            <p className="text-xs font-medium text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-3">Firemní údaje (pouze pro čtení)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {profile.company_name && (
                <div className="space-y-1.5">
                  <label className={labelClass}><Building className="w-3.5 h-3.5" />Název firmy</label>
                  <input className={readOnlyClass} value={profile.company_name} readOnly />
                </div>
              )}
              {profile.ico && (
                <div className="space-y-1.5">
                  <label className={labelClass}><CreditCard className="w-3.5 h-3.5" />IČO</label>
                  <input className={readOnlyClass} value={profile.ico} readOnly />
                </div>
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
