/**
 * AFFILIATE v2 — Profil a výplatní údaje.
 * Edituje vlastní affiliate_accounts řádek přes SECURITY DEFINER RPC
 * update_affiliate_own_profile (migrace 20260603_affiliate_profile_update.sql).
 *
 * Bezpečnost: RPC ověřuje auth.uid(). Affiliate nemůže měnit ref_code, modes,
 * status ani commission_rate_*. Jen kontaktní, adresní a výplatní údaje.
 */
import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  User, Mail, Phone, Globe, Building, Landmark, CreditCard,
  Save, Loader2, CheckCircle2, AlertTriangle, Camera, FileDigit,
  Banknote, Receipt, Instagram, Youtube, Facebook, Music2, Users, Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface AffiliateProfileData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  ref_code?: string;
  modes?: string[];
  status?: string;
  vat_id: string | null;       // DIČ
  ico: string | null;          // IČO — requires migration
  is_vat_payer: boolean;
  payout_account: string | null;
  payout_bank: string | null;
  billing_street: string | null;   // requires migration
  billing_city: string | null;     // requires migration
  billing_zip: string | null;      // requires migration
  billing_country: string | null;  // requires migration (default CZ)
  website_url: string | null;      // requires migration
  instagram_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  facebook_url?: string | null;
  audience_size?: string | null;
  content_categories?: string | null;
}

interface Props {
  profile: AffiliateProfileData;
  onSaved?: () => void;
}

/* ── Constants ──────────────────────────────────────────────────────────────── */

const COUNTRIES = [
  { code: 'CZ', label: 'Česká republika' },
  { code: 'SK', label: 'Slovenská republika' },
  { code: 'DE', label: 'Německo' },
  { code: 'AT', label: 'Rakousko' },
  { code: 'PL', label: 'Polsko' },
  { code: 'HU', label: 'Maďarsko' },
  { code: 'OTHER', label: 'Jiná země' },
];

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

const inputCls = "w-full bg-[hsl(var(--muted)/0.4)] border border-[hsl(var(--border)/0.5)] rounded-md px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-transparent transition-colors";
const labelCls = "text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))] flex items-center gap-1.5 mb-1.5";
const readonlyCls = "rounded-lg border border-[hsl(var(--border)/0.35)] bg-[hsl(var(--muted)/0.18)] px-3 py-2";

const formatModes = (modes?: string[]) => {
  if (!modes?.length) return 'Neuvedeno';
  return modes.map(mode => mode === 'influencer' ? 'Influencer' : mode === 'sales_rep' ? 'Obchodník' : mode).join(' + ');
};

const formatStatus = (status?: string) => {
  switch (status) {
    case 'approved': return 'Schváleno';
    case 'pending': return 'Čeká na schválení';
    case 'rejected': return 'Zamítnuto';
    case 'suspended': return 'Pozastaveno';
    default: return status || 'Neuvedeno';
  }
};

function ReadonlyItem({ label, value, testId }: { label: string; value?: string | null; testId?: string }) {
  return (
    <div className={readonlyCls}>
      <p className="text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))] mb-1">{label}</p>
      <p data-testid={testId} className="text-sm font-medium text-[hsl(var(--text-silver))] break-words">{value || 'Neuvedeno'}</p>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-0">
      <label className={labelCls}><Icon className="w-3.5 h-3.5" />{label}</label>
      {children}
    </div>
  );
}

/* ── Component ──────────────────────────────────────────────────────────────── */

const AffiliateProfileSection: React.FC<Props> = ({ profile: initial, onSaved }) => {
  const [form, setForm] = useState<AffiliateProfileData>({ ...initial });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Re-sync the form when the incoming profile data actually changes (e.g. after
  // a successful save triggers the parent to re-fetch from the DB). useState only
  // reads `initial` once on mount, so without this the form would keep showing the
  // pre-reload values. Compared by serialized value — not object reference — so a
  // parent re-render with identical data does NOT clobber in-progress edits.
  const initialSig = JSON.stringify(initial);
  const lastSigRef = React.useRef(initialSig);
  React.useEffect(() => {
    if (lastSigRef.current !== initialSig) {
      lastSigRef.current = initialSig;
      setForm({ ...initial });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSig]);

  const set = (field: keyof AffiliateProfileData, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const isPayoutReady = !!(form.payout_account && form.payout_account.trim().length >= 8);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('update_affiliate_own_profile', {
        p_name:            form.name,
        p_email:           form.email,
        p_phone:           form.phone || '',
        p_vat_id:          form.vat_id || '',
        p_ico:             form.ico || '',
        p_is_vat_payer:    form.is_vat_payer,
        p_payout_account:  form.payout_account || '',
        p_payout_bank:     form.payout_bank || '',
        p_billing_street:  form.billing_street || '',
        p_billing_city:    form.billing_city || '',
        p_billing_zip:     form.billing_zip || '',
        p_billing_country: form.billing_country || 'CZ',
        p_website_url:     form.website_url || '',
        p_instagram_url:      form.instagram_url ?? '',
        p_tiktok_url:         form.tiktok_url ?? '',
        p_youtube_url:        form.youtube_url ?? '',
        p_facebook_url:       form.facebook_url ?? '',
        p_audience_size:      form.audience_size ?? '',
        p_content_categories: form.content_categories ?? '',
      });

      if (error) throw error;

      const status = (data as any)?.status;
      if (status === 'ok') {
        toast.success('Profil byl úspěšně uložen');
        onSaved?.();
      } else if (status === 'invalid_input') {
        toast.error(`Neplatná hodnota v poli: ${(data as any)?.field || 'neznámé pole'}`);
      } else if (status === 'unauthenticated') {
        toast.error('Nejste přihlášeni');
      } else {
        // RPC doesn't exist yet (migration not applied) — graceful fallback
        toast.error('Ukládání profilu není zatím k dispozici. Kontaktujte podporu OneMil na podpora@onemil.cz s vašimi údaji.');
      }
    } catch (err: any) {
      // If RPC not found (migration not applied), show a helpful message
      if (err?.code === 'PGRST202' || err?.message?.includes('Could not find')) {
        toast.error('Funkce ukládání profilu bude dostupná brzy. Pro změnu kontaktujte podpora@onemil.cz.');
      } else {
        toast.error(err?.message || 'Nepodařilo se uložit profil');
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Nahrajte obrázek (JPG, PNG, WebP)'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Max. velikost souboru je 5 MB'); return; }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `affiliate/${initial.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from('partner-logos').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('partner-logos').getPublicUrl(path);
      setLogoUrl(`${urlData.publicUrl}?t=${Date.now()}`);
      toast.success('Foto aktualizováno');
    } catch (err: any) {
      toast.error('Nepodařilo se nahrát foto');
    } finally {
      setUploadingPhoto(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="luxury-card overflow-hidden">
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <Avatar className="w-14 h-14 border-2 border-[hsl(var(--border)/0.5)]">
                {logoUrl ? <AvatarImage src={logoUrl} alt="Profilové foto" /> : null}
                <AvatarFallback className="bg-[hsl(var(--muted)/0.5)] text-[hsl(var(--text-muted-gray))]">
                  <User className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-wait"
              >
                {uploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : <Camera className="w-5 h-5 text-white" />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Profil a výplatní údaje</h3>
              <p className="text-[11px] text-[hsl(var(--text-muted-gray))]">Klikněte na foto pro změnu</p>
            </div>
          </div>
        </div>

        {/* Účet — read-only souhrn (nelze měnit) */}
        <div>
          <p className="text-xs font-semibold text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-4">Účet</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadonlyItem label="Zvolené zaměření" value={formatModes(form.modes)} testId="affiliate-profile-modes" />
            <ReadonlyItem label="Doporučovací kód" value={form.ref_code} testId="affiliate-profile-ref-code" />
            <ReadonlyItem label="Stav účtu" value={formatStatus(form.status)} testId="affiliate-profile-status" />
            <ReadonlyItem label="Registrační e-mail" value={form.email} testId="affiliate-profile-email-summary" />
          </div>
        </div>

        {/* Sociální sítě a dosah — editovatelné (jen text, žádné embedy) */}
        <div>
          <p className="text-xs font-semibold text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-1">Sociální sítě a dosah</p>
          <p className="text-xs text-[hsl(var(--text-muted-gray))] mb-4">
            Zadejte odkazy na své profily jako text. Pomohou nám posoudit váš dosah.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Hlavní kanál / web / profil" icon={Globe}>
              <input className={inputCls} value={form.website_url || ''} onChange={e => set('website_url', e.target.value)} placeholder="https://..." data-testid="affiliate-profile-website" />
            </Field>
            <Field label="Instagram" icon={Instagram}>
              <input className={inputCls} value={form.instagram_url || ''} onChange={e => set('instagram_url', e.target.value)} placeholder="https://instagram.com/uzivatel" data-testid="affiliate-profile-instagram" />
            </Field>
            <Field label="TikTok" icon={Music2}>
              <input className={inputCls} value={form.tiktok_url || ''} onChange={e => set('tiktok_url', e.target.value)} placeholder="https://tiktok.com/@uzivatel" data-testid="affiliate-profile-tiktok" />
            </Field>
            <Field label="YouTube" icon={Youtube}>
              <input className={inputCls} value={form.youtube_url || ''} onChange={e => set('youtube_url', e.target.value)} placeholder="https://youtube.com/@kanal" data-testid="affiliate-profile-youtube" />
            </Field>
            <Field label="Facebook" icon={Facebook}>
              <input className={inputCls} value={form.facebook_url || ''} onChange={e => set('facebook_url', e.target.value)} placeholder="https://facebook.com/profil" data-testid="affiliate-profile-facebook" />
            </Field>
            <Field label="Velikost publika / dosah" icon={Users}>
              <input className={inputCls} value={form.audience_size || ''} onChange={e => set('audience_size', e.target.value)} placeholder="Např. 25 000 sledujících" data-testid="affiliate-profile-audience" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Kategorie obsahu" icon={Tag}>
                <input className={inputCls} value={form.content_categories || ''} onChange={e => set('content_categories', e.target.value)} placeholder="Např. lifestyle, móda, technologie" data-testid="affiliate-profile-categories" />
              </Field>
            </div>
          </div>
        </div>

        {/* Payout status */}
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${
          isPayoutReady
            ? 'border-[hsl(160_55%_45%/0.3)] bg-[hsl(160_55%_45%/0.06)]'
            : 'border-[hsl(43_90%_55%/0.3)] bg-[hsl(43_90%_55%/0.06)]'
        }`}>
          {isPayoutReady ? (
            <><CheckCircle2 className="w-4 h-4 text-[hsl(160_55%_45%)] shrink-0" /><span className="text-sm text-[hsl(160_55%_45%)]">Připraveno k výplatě — jakmile admin schválí provizi, bude odeslána na váš účet</span></>
          ) : (
            <><AlertTriangle className="w-4 h-4 text-[hsl(43_90%_55%)] shrink-0" /><span className="text-sm text-[hsl(43_90%_55%)]">Doplňte číslo účtu / IBAN pro příjem výplat (min. 8 znaků)</span></>
          )}
        </div>

        {/* Kontaktní údaje */}
        <div>
          <p className="text-xs font-semibold text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-4">Kontaktní údaje</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Jméno / Nick" icon={User}>
              <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Vaše jméno" />
            </Field>
            <Field label="Kontaktní e-mail" icon={Mail}>
              <input className={inputCls} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
            </Field>
            <Field label="Telefon" icon={Phone}>
              <input className={inputCls} value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+420 … nebo +421 …" />
            </Field>
          </div>
        </div>

        {/* Fakturační / daňové údaje */}
        <div>
          <p className="text-xs font-semibold text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-4">Fakturační a daňové údaje</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="IČO" icon={FileDigit}>
              <input className={inputCls} value={form.ico || ''} onChange={e => set('ico', e.target.value)} placeholder="CZ: 12345678 | SK: 12345678" />
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">8 číslic (CZ i SK formát)</p>
            </Field>
            <Field label="DIČ" icon={Receipt}>
              <input className={inputCls} value={form.vat_id || ''} onChange={e => set('vat_id', e.target.value)} placeholder="CZ12345678 nebo SK1234567890" />
            </Field>
          </div>

          {/* DPH */}
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.15)] px-4 py-3">
            <Switch
              checked={form.is_vat_payer}
              onCheckedChange={v => set('is_vat_payer', v)}
              id="vat-switch"
            />
            <label htmlFor="vat-switch" className="text-sm text-[hsl(var(--text-silver))] cursor-pointer select-none">
              Jsem plátce DPH
              <span className="block text-[11px] text-[hsl(var(--text-muted-gray))]">
                Plátci DPH bude k provizi přičteno 21 % DPH (provize se fakturuje s DPH).
              </span>
            </label>
          </div>
        </div>

        {/* Fakturační adresa */}
        <div>
          <p className="text-xs font-semibold text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-4">Fakturační adresa</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Ulice a číslo popisné" icon={Building}>
                <input className={inputCls} value={form.billing_street || ''} onChange={e => set('billing_street', e.target.value)} placeholder="Např. Václavské náměstí 1" />
              </Field>
            </div>
            <Field label="Město" icon={Building}>
              <input className={inputCls} value={form.billing_city || ''} onChange={e => set('billing_city', e.target.value)} placeholder="Praha / Bratislava" />
            </Field>
            <Field label="PSČ" icon={Building}>
              <input className={inputCls} value={form.billing_zip || ''} onChange={e => set('billing_zip', e.target.value)} placeholder="110 00 nebo 811 01" />
            </Field>
            <Field label="Země" icon={Globe}>
              <select
                className={inputCls}
                value={form.billing_country || 'CZ'}
                onChange={e => set('billing_country', e.target.value)}
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {/* Platební / výplatní údaje */}
        <div>
          <p className="text-xs font-semibold text-[hsl(var(--text-muted-gray))] uppercase tracking-wider mb-1">Platební údaje</p>
          <p className="text-xs text-[hsl(var(--text-muted-gray))] mb-4">
            Na tento účet vám budeme posílat schválené výplaty provizí.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Číslo účtu / IBAN" icon={Landmark}>
                <input
                  className={inputCls}
                  value={form.payout_account || ''}
                  onChange={e => set('payout_account', e.target.value)}
                  placeholder="123456789/0800 nebo CZ65 0800 0000 0012 3456 7899 nebo SK89 0900 0000 0001 2312 3456"
                />
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">
                  CZ: číslo/kód_banky (např. 123456/0100) · SK: IBAN (SK xx…) · mezinárodní: IBAN
                </p>
              </Field>
            </div>
            <Field label="Název banky (volitelné)" icon={Building}>
              <input className={inputCls} value={form.payout_bank || ''} onChange={e => set('payout_bank', e.target.value)} placeholder="Česká spořitelna / Slovenská sporiteľňa…" />
            </Field>
            <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.15)] px-4 py-3">
              <Banknote className="w-4 h-4 text-[hsl(var(--text-muted-gray))] shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[hsl(var(--text-muted-gray))]">Měna výplaty</p>
                <p className="text-sm font-semibold text-[hsl(var(--text-silver))]">CZK</p>
              </div>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end pt-2 border-t border-[hsl(var(--border)/0.3)]">
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

export default AffiliateProfileSection;
