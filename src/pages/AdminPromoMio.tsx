import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Download, Gift, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

type PromoCampaign = {
  id: string;
  title: string;
  code: string;
  mio_amount: number;
  max_redemptions: number | null;
  redeemed_count: number;
  valid_from: string;
  valid_until: string | null;
  existing_users_allowed: boolean;
  active: boolean;
  created_at: string;
};

type RpcResult = {
  success: boolean;
  error?: string;
  campaigns?: PromoCampaign[];
};

const errorTexts: Record<string, string> = {
  forbidden: 'K této funkci má přístup pouze superadmin.',
  invalid_fields: 'Zkontrolujte kód, počet MIO, limit a platnost.',
  code_in_use: 'Tento kód se již v systému používá.',
  not_found: 'Kampaň nebyla nalezena.',
};

const emptyForm = {
  title: 'Tukanec – bonus ke kartičce',
  code: 'TUKANEC25',
  mio: '25',
  max: '100',
  starts: '',
  ends: '',
  onlyNew: false,
};

function codeLink(code: string): string {
  const url = new URL('/profile', window.location.origin);
  url.searchParams.set('miocoin_code', code);
  return url.toString();
}

const promoRpc = (supabase as any).rpc.bind(supabase) as (
  name: string, args?: Record<string, unknown>
) => Promise<{ data: RpcResult | null; error: { message: string } | null }>;

export default function AdminPromoMio() {
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await promoRpc('admin_list_promo_mio_campaigns');
    if (error || !data?.success) {
      setLoadFailed(true);
      toast.error('Nepodařilo se načíst bonusové kampaně. Ověřte nasazení databázové funkce.');
    } else {
      setLoadFailed(false);
      setCampaigns(data.campaigns ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const mio = Number(form.mio);
    const max = form.max.trim() === '' ? null : Number(form.max);
    if (!/^[A-Z0-9-]{5,32}$/.test(form.code) || !form.title.trim() ||
      !Number.isInteger(mio) || mio < 1 || mio > 10000 ||
      (max !== null && (!Number.isInteger(max) || max < 1 || max > 1000000))) {
      toast.error(errorTexts.invalid_fields);
      return;
    }
    if (form.ends && !form.starts && new Date(form.ends).getTime() <= Date.now()) {
      toast.error('Datum konce musí být v budoucnosti.');
      return;
    }
    if (form.ends && form.starts && new Date(form.ends) <= new Date(form.starts)) {
      toast.error('Konec platnosti musí být po začátku.');
      return;
    }
    if (max === null && !window.confirm('Bez limitu mohou MIO získat všichni oprávnění hráči. Pokračovat?')) return;
    const budget = max === null ? 'bez limitu' : `${(mio * max).toLocaleString('cs-CZ')} MIO`;
    if (!window.confirm(`Vytvořit sdílený kód ${form.code} s možným rozdáním ${budget}?`)) return;

    setBusy(true);
    try {
      const { data, error } = await promoRpc('admin_create_promo_mio_campaign', {
        p_code: form.code,
        p_title: form.title.trim(),
        p_mio_amount: mio,
        p_max_redemptions: max,
        p_valid_from: form.starts ? new Date(form.starts).toISOString() : null,
        p_valid_until: form.ends ? new Date(form.ends).toISOString() : null,
        p_existing_users_allowed: !form.onlyNew,
      });
      if (error || !data?.success) throw new Error(errorTexts[data?.error ?? ''] || error?.message || 'Kód se nepodařilo vytvořit.');
      toast.success('Bonusový kód byl vytvořen.');
      setForm({ ...emptyForm, code: '', title: '' });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kód se nepodařilo vytvořit.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (campaign: PromoCampaign) => {
    setSavingId(campaign.id);
    try {
      const { data, error } = await promoRpc('admin_set_promo_mio_campaign_active', {
        p_id: campaign.id,
        p_active: !campaign.active,
      });
      if (error || !data?.success) throw new Error(errorTexts[data?.error ?? ''] || error?.message || 'Změna se nezdařila.');
      await reload();
      toast.success(campaign.active ? 'Kód byl pozastaven.' : 'Kód byl znovu aktivován.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Změna se nezdařila.');
    } finally {
      setSavingId(null);
    }
  };

  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success('Zkopírováno.'); }
    catch { toast.error('Kopírování se nezdařilo.'); }
  };

  const downloadQr = (campaign: PromoCampaign) => {
    const svg = document.getElementById(`promo-qr-${campaign.id}`)?.querySelector('svg');
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `onemil-mio-${campaign.code}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hromadné MIO kódy</h1>
          <p className="text-sm text-muted-foreground mt-1">Jeden kód na více kartiček. Každý přihlášený hráč jej smí použít jen jednou.</p>
        </div>
        <Button variant="outline" onClick={() => void reload()} disabled={loading}><RefreshCw className="h-4 w-4 mr-2" />Obnovit</Button>
      </header>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Nová bonusová akce</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2"><Label htmlFor="promo-title">Název akce</Label>
              <Input id="promo-title" value={form.title} maxLength={120}
                onChange={e => setForm(s => ({ ...s, title: e.target.value }))} required /></div>
            <div><Label htmlFor="promo-code">Společný kód</Label>
              <Input id="promo-code" value={form.code} maxLength={32} required
                onChange={e => setForm(s => ({ ...s, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') }))} /></div>
            <div><Label htmlFor="promo-mio">MIO na osobu</Label>
              <Input id="promo-mio" type="number" min="1" max="10000" step="1" value={form.mio}
                onChange={e => setForm(s => ({ ...s, mio: e.target.value }))} required /></div>
            <div><Label htmlFor="promo-max">Max. počet lidí (prázdné = bez limitu)</Label>
              <Input id="promo-max" type="number" min="1" max="1000000" step="1" value={form.max}
                onChange={e => setForm(s => ({ ...s, max: e.target.value }))} /></div>
            <div><Label htmlFor="promo-start">Začátek (prázdné = ihned)</Label>
              <Input id="promo-start" type="datetime-local" value={form.starts}
                onChange={e => setForm(s => ({ ...s, starts: e.target.value }))} /></div>
            <div><Label htmlFor="promo-end">Konec (prázdné = bez omezení)</Label>
              <Input id="promo-end" type="datetime-local" value={form.ends}
                onChange={e => setForm(s => ({ ...s, ends: e.target.value }))} /></div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                <input type="checkbox" checked={form.onlyNew}
                  onChange={e => setForm(s => ({ ...s, onlyNew: e.target.checked }))} />
                Pouze nově registrovaní
              </label>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-xs text-muted-foreground mb-3">Každému hráči lze připsat bonus z jedné akce pouze jednou. Datum registrace omezuje volba „Pouze nově registrovaní“.</p>
              <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gift className="h-4 w-4 mr-2" />}Vytvořit kód</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? <p>Načítání…</p> : loadFailed ? <p role="alert">Seznam se nepodařilo načíst. Žádná akce se proto nezobrazuje.</p>
        : campaigns.length === 0 ? <p className="text-muted-foreground">Zatím nemáte žádnou bonusovou akci.</p>
        : <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {campaigns.map(c => {
            const link = codeLink(c.code);
            const claimed = c.redeemed_count;
            const quota = c.max_redemptions === null ? 'bez limitu' : `${claimed} / ${c.max_redemptions}`;
            const remaining = c.max_redemptions === null ? 'bez limitu' : String(c.max_redemptions - claimed);
            return (
              <Card key={c.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                    <span>{c.title}</span>
                    <span className={`text-xs rounded-full px-3 py-1 ${c.active ? 'bg-green-500/10 text-green-700' : 'bg-red-500/10 text-red-700'}`}>
                      {c.active ? 'Aktivní' : 'Pozastaveno'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div id={`promo-qr-${c.id}`} className="rounded-lg bg-white border p-2 self-start" aria-label={`QR kód pro ${c.code}`}>
                      <QRCodeSVG value={link} size={160} level="H" />
                    </div>
                    <div className="space-y-2 min-w-0 flex-1">
                      <p className="font-bold tracking-wider text-xl">{c.code}</p>
                      <p className="text-sm">{c.mio_amount} MIO na hráče</p>
                      <p className="text-sm text-muted-foreground">Uplatněno: {quota} · Zbývá: {remaining}</p>
                      <p className="text-xs text-muted-foreground">{c.existing_users_allowed ? 'Noví i stávající hráči' : 'Pouze nově registrovaní'} · {c.valid_until ? `Do ${new Date(c.valid_until).toLocaleString('cs-CZ')}` : 'Bez časového konce'}</p>
                      <p className="text-xs break-all text-muted-foreground">{link}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void copy(c.code)}><Copy className="h-4 w-4 mr-1" />Kód</Button>
                    <Button size="sm" variant="outline" onClick={() => void copy(link)}><Copy className="h-4 w-4 mr-1" />Odkaz</Button>
                    <Button size="sm" variant="outline" onClick={() => downloadQr(c)}><Download className="h-4 w-4 mr-1" />QR pro tisk (SVG)</Button>
                    <Button size="sm" variant={c.active ? 'destructive' : 'default'} disabled={savingId === c.id}
                      onClick={() => void toggle(c)}>{c.active ? 'Pozastavit' : 'Aktivovat'}</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>}
    </div>
  );
}
