import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, Search, Building2, Infinity as InfinityIcon, Hash } from 'lucide-react';

/**
 * Garantované nákupní benefity — centrální admin správa (první verze).
 *
 * Model: benefity zakládá a spravuje VÝHRADNĚ OneMil (superadmin nebo admin
 * s oprávněním `guaranteed_benefits.manage`). Partner v této verzi v aplikaci
 * nic nevytváří ani neschvaluje — obchodní dohoda se řeší mimo aplikaci.
 *
 * První verze NEMÁ schvalovací workflow: benefit je po uložení rovnou provozní
 * a admin s oprávněním si sám nastaví i cenu pro OneMil — nečeká na superadmina.
 *
 * Všechny zápisy jdou přes SECURITY DEFINER RPC. Tato stránka nikdy nezapisuje
 * přímo do `partners`, `vouchers`, `voucher_versions`, `voucher_codes`,
 * `voucher_distribution_orders` ani `voucher_distribution_contests`.
 */

type RpcResult = Record<string, unknown> | null;

interface BenefitPartner {
  id: string;
  name: string;
  company_name: string | null;
  ico: string | null;
  website_url: string | null;
  contact_email: string | null;
  benefit_only_record: boolean;
  status: string;
  has_login: boolean;
}

interface BenefitRow {
  order_id: string;
  order_status: string;
  is_unlimited: boolean;
  distribution_scope: string;
  requested_quantity: number;
  issued_quantity: number;
  unit_price_ex_vat_snapshot: number | null;
  vat_rate_percent_snapshot: number | null;
  currency_snapshot: string | null;
  created_at: string;
  partner_id: string;
  partner_name: string;
  partner_benefit_only: boolean;
  benefit_name: string;
  short_description: string | null;
  valid_from: string | null;
  valid_until: string | null;
  code_source: string;
  voucher_status: string;
  available_codes: number;
  linked_contests: number;
}

interface ContestOption {
  id: string;
  name: string;
  status: string;
  ticket_price: number;
}

const SCOPE_LABEL: Record<string, string> = {
  all_contests: 'Všechny soutěže',
  selected_contests: 'Vybrané soutěže',
  single_contest: 'Jedna soutěž (legacy)',
};

/** Provozní stav benefitu. Žádný schvalovací krok — `approved` = rovnou aktivní. */
const STATUS_LABEL: Record<string, string> = {
  approved: 'Aktivní',
  suspended: 'Pozastavený',
  ended: 'Ukončený',
  requested: 'Rozpracovaný (legacy)',
  rejected: 'Zamítnutý (legacy)',
  cancelled: 'Zrušený (legacy)',
};

const RPC_ERROR_LABEL: Record<string, string> = {
  forbidden: 'K této oblasti nemáte oprávnění.',
  name_required: 'Název je povinný.',
  how_to_use_required: 'Vyplňte, jak benefit uplatnit.',
  terms_required: 'Vyplňte podmínky benefitu.',
  invalid_benefit_kind: 'Neplatný typ benefitu.',
  invalid_distribution_scope: 'Neplatný rozsah distribuce.',
  partner_not_found: 'Firma nebyla nalezena.',
  shared_code_or_url_required: 'Neomezený benefit potřebuje trvalý kód nebo odkaz.',
  shared_code_not_allowed_for_limited: 'Omezený benefit nemá trvalý sdílený kód.',
  codes_required: 'Vložte alespoň jeden kód.',
  contest_selection_required: 'Vyberte alespoň jednu soutěž.',
  not_a_benefit_only_partner: 'Tato firma je běžný partner — spravuje se v /admin/partners.',
  order_not_found: 'Benefit nebyl nalezen.',
  invalid_unit_price: 'Cena pro OneMil nesmí být záporná.',
  invalid_vat_rate: 'Sazba DPH musí být mezi 0 a 100 %.',
  invalid_currency: 'Měna musí být třípísmenný kód (např. CZK).',
  price_rule_not_resolved: 'Nepodařilo se nastavit cenu pro OneMil.',
  invalid_status: 'Neplatný stav benefitu.',
  benefit_not_operational: 'Tento benefit není v provozním stavu.',
  benefit_already_ended: 'Ukončený benefit už nelze znovu zapnout. Založte nový.',
  benefit_content_immutable:
    'Obsah už vydaného benefitu nelze zpětně měnit. Ukončete ho a založte nový.',
};

function rpcErrorMessage(code: unknown): string {
  const key = typeof code === 'string' ? code : '';
  return RPC_ERROR_LABEL[key] ?? 'Akci se nepodařilo dokončit.';
}

const AdminGuaranteedBenefits: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [benefits, setBenefits] = useState<BenefitRow[]>([]);

  // ── Firma ────────────────────────────────────────────────────────────────
  const [partnerQuery, setPartnerQuery] = useState('');
  const [partnerResults, setPartnerResults] = useState<BenefitPartner[]>([]);
  const [searchingPartners, setSearchingPartners] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<BenefitPartner | null>(null);

  const [newCompanyOpen, setNewCompanyOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cCompanyName, setCCompanyName] = useState('');
  const [cWebsite, setCWebsite] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cIco, setCIco] = useState('');
  const [cDic, setCDic] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [nameCandidates, setNameCandidates] = useState<BenefitPartner[]>([]);

  // ── Benefit ──────────────────────────────────────────────────────────────
  const [bName, setBName] = useState('');
  const [bShort, setBShort] = useState('');
  const [bHowToUse, setBHowToUse] = useState('');
  const [bTerms, setBTerms] = useState('');
  const [bKind, setBKind] = useState('other');
  const [bValue, setBValue] = useState('');
  const [bMinPurchase, setBMinPurchase] = useState('');
  const [bValidFrom, setBValidFrom] = useState('');
  const [bValidUntil, setBValidUntil] = useState('');
  const [bUnlimited, setBUnlimited] = useState(true);
  const [bSharedCode, setBSharedCode] = useState('');
  const [bCodesRaw, setBCodesRaw] = useState('');
  const [bScope, setBScope] = useState('all_contests');
  const [bContestIds, setBContestIds] = useState<string[]>([]);
  const [contests, setContests] = useState<ContestOption[]>([]);
  const [savingBenefit, setSavingBenefit] = useState(false);

  // Cena pro OneMil — nastavuje ji admin s oprávněním, ne superadmin.
  const [bPrice, setBPrice] = useState('0');
  const [bVat, setBVat] = useState('21');
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);

  const loadBenefits = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_guaranteed_benefits' as never);
      if (error) throw error;
      const res = data as RpcResult;
      if (!res || res.success !== true) {
        toast.error(rpcErrorMessage(res?.error));
        setBenefits([]);
        return;
      }
      setBenefits((res.benefits as BenefitRow[]) ?? []);
    } catch {
      toast.error('Nepodařilo se načíst garantované benefity.');
      setBenefits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContests = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('admin_list_contests_for_benefit_distribution' as never);
      if (error) throw error;
      const res = data as RpcResult;
      if (res && res.success === true) {
        setContests((res.contests as ContestOption[]) ?? []);
      }
    } catch {
      /* picker zůstane prázdný, formulář to ohlásí při uložení */
    }
  }, []);

  useEffect(() => {
    void loadBenefits();
    void loadContests();
  }, [loadBenefits, loadContests]);

  const searchPartners = useCallback(async () => {
    setSearchingPartners(true);
    try {
      const { data, error } = await supabase.rpc('admin_search_benefit_partners' as never, {
        p_query: partnerQuery.trim() || null,
      } as never);
      if (error) throw error;
      const res = data as RpcResult;
      if (!res || res.success !== true) {
        toast.error(rpcErrorMessage(res?.error));
        return;
      }
      setPartnerResults((res.partners as BenefitPartner[]) ?? []);
    } catch {
      toast.error('Vyhledání firmy se nepodařilo.');
    } finally {
      setSearchingPartners(false);
    }
  }, [partnerQuery]);

  const createCompany = useCallback(
    async (confirmNameMismatch: boolean) => {
      if (!cName.trim()) {
        toast.error('Název firmy je povinný.');
        return;
      }
      setCreatingCompany(true);
      try {
        const { data, error } = await supabase.rpc('admin_create_benefit_partner' as never, {
          p_name: cName.trim(),
          p_company_name: cCompanyName.trim() || null,
          p_website_url: cWebsite.trim() || null,
          p_contact_email: cEmail.trim() || null,
          p_contact_phone: cPhone.trim() || null,
          p_ico: cIco.trim() || null,
          p_dic: cDic.trim() || null,
          p_confirm_name_mismatch: confirmNameMismatch,
        } as never);
        if (error) throw error;
        const res = data as RpcResult;

        if (res?.error === 'name_match_needs_confirmation') {
          setNameCandidates((res.name_candidates as BenefitPartner[]) ?? []);
          toast.warning('Našli jsme podobné firmy. Zkontrolujte je prosím před založením nové.');
          return;
        }
        if (!res || res.success !== true) {
          toast.error(rpcErrorMessage(res?.error));
          return;
        }

        setNameCandidates([]);
        setSelectedPartner((res.partner as BenefitPartner) ?? null);
        setNewCompanyOpen(false);

        if (res.was_created === true) {
          toast.success('Evidenční firma byla založena (bez partnerského přístupu).');
        } else {
          toast.info('Firma už v systému existuje — použili jsme existující záznam.');
        }
      } catch {
        toast.error('Založení firmy se nepodařilo.');
      } finally {
        setCreatingCompany(false);
      }
    },
    [cName, cCompanyName, cWebsite, cEmail, cPhone, cIco, cDic],
  );

  const resetBenefitForm = useCallback(() => {
    setBName('');
    setBShort('');
    setBHowToUse('');
    setBTerms('');
    setBKind('other');
    setBValue('');
    setBMinPurchase('');
    setBValidFrom('');
    setBValidUntil('');
    setBUnlimited(true);
    setBSharedCode('');
    setBCodesRaw('');
    setBScope('all_contests');
    setBContestIds([]);
    setBPrice('0');
    setBVat('21');
  }, []);

  /** Provozní stav benefitu — náhrada za schvalovací krok. */
  const changeBenefitStatus = useCallback(
    async (orderId: string, status: 'approved' | 'suspended' | 'ended') => {
      setSavingStatusId(orderId);
      try {
        const { data, error } = await supabase.rpc('admin_set_guaranteed_benefit_status' as never, {
          p_order_id: orderId,
          p_status: status,
        } as never);
        if (error) throw error;
        const res = data as RpcResult;
        if (!res || res.success !== true) {
          toast.error(rpcErrorMessage(res?.error));
          return;
        }
        toast.success(
          status === 'approved'
            ? 'Benefit je opět aktivní.'
            : status === 'suspended'
              ? 'Benefit byl pozastaven.'
              : 'Benefit byl ukončen.',
        );
        await loadBenefits();
      } catch {
        toast.error('Změna stavu benefitu se nepodařila.');
      } finally {
        setSavingStatusId(null);
      }
    },
    [loadBenefits],
  );

  const createBenefit = useCallback(async () => {
    if (!selectedPartner) {
      toast.error('Nejdřív vyberte nebo založte firmu.');
      return;
    }
    const codes = bCodesRaw
      .split(/[\n,;]+/)
      .map((c) => c.trim())
      .filter(Boolean);

    setSavingBenefit(true);
    try {
      const { data, error } = await supabase.rpc('admin_create_guaranteed_benefit' as never, {
        p_partner_id: selectedPartner.id,
        p_name: bName.trim(),
        p_short_description: bShort.trim() || null,
        p_how_to_use: bHowToUse.trim() || null,
        p_terms: bTerms.trim() || null,
        p_benefit_kind: bKind,
        p_benefit_value: bValue.trim() ? Number(bValue) : null,
        p_minimum_purchase_amount: bMinPurchase.trim() ? Number(bMinPurchase) : null,
        p_valid_from: bValidFrom || null,
        p_valid_until: bValidUntil || null,
        p_is_unlimited: bUnlimited,
        p_shared_code_or_url: bUnlimited ? bSharedCode.trim() || null : null,
        p_codes: bUnlimited ? null : codes,
        p_distribution_scope: bScope,
        p_contest_ids: bScope === 'selected_contests' ? bContestIds : null,
        p_unit_price_ex_vat: bPrice.trim() ? Number(bPrice) : 0,
        p_vat_rate_percent: bVat.trim() ? Number(bVat) : 21,
      } as never);
      if (error) throw error;
      const res = data as RpcResult;
      if (!res || res.success !== true) {
        toast.error(rpcErrorMessage(res?.error));
        return;
      }
      toast.success('Garantovaný benefit byl vytvořen a je rovnou aktivní.');
      resetBenefitForm();
      await loadBenefits();
    } catch {
      toast.error('Vytvoření benefitu se nepodařilo.');
    } finally {
      setSavingBenefit(false);
    }
  }, [
    selectedPartner, bName, bShort, bHowToUse, bTerms, bKind, bValue, bMinPurchase,
    bValidFrom, bValidUntil, bUnlimited, bSharedCode, bCodesRaw, bScope, bContestIds,
    bPrice, bVat, resetBenefitForm, loadBenefits,
  ]);

  const toggleContest = (id: string) => {
    setBContestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="h-6 w-6" />
          Garantované benefity
        </h1>
        <p className="text-sm text-muted-foreground">
          Centrální správa garantovaných nákupních benefitů. Zakládá a spravuje je výhradně OneMil —
          partner zde nic nevytváří ani neschvaluje. Benefit je po uložení rovnou aktivní, žádné
          další schválení se nečeká.
        </p>
      </div>

      {/* ── 1. Firma ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            1. Firma poskytující benefit
          </CardTitle>
          <CardDescription>
            Vyberte existující firmu, nebo založte minimální evidenční záznam. Evidenční firma nikdy
            nezíská partnerské přihlášení, API klíče, integrace, payouty ani affiliate práva.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Hledat podle názvu, IČO, webu nebo e-mailu"
              value={partnerQuery}
              onChange={(e) => setPartnerQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void searchPartners();
              }}
            />
            <Button type="button" variant="secondary" onClick={() => void searchPartners()} disabled={searchingPartners}>
              {searchingPartners ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Hledat</span>
            </Button>
          </div>

          {partnerResults.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {partnerResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPartner(p)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span>
                    {p.name}
                    {p.ico ? ` · IČO ${p.ico}` : ''}
                  </span>
                  <Badge variant={p.benefit_only_record ? 'secondary' : 'outline'}>
                    {p.benefit_only_record ? 'Evidenční' : 'Partner'}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {selectedPartner && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium">Vybraná firma: {selectedPartner.name}</div>
              <div className="text-muted-foreground">
                {selectedPartner.benefit_only_record
                  ? 'Evidenční firma pro benefity — bez partnerského přístupu.'
                  : 'Běžný partner — firemní údaje se spravují v /admin/partners.'}
              </div>
            </div>
          )}

          <div>
            <Button type="button" variant="outline" onClick={() => setNewCompanyOpen((v) => !v)}>
              {newCompanyOpen ? 'Skrýt založení firmy' : 'Založit novou evidenční firmu'}
            </Button>
          </div>

          {newCompanyOpen && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="gb-c-name">Název firmy *</Label>
                  <Input id="gb-c-name" value={cName} onChange={(e) => setCName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="gb-c-company">Obchodní jméno</Label>
                  <Input id="gb-c-company" value={cCompanyName} onChange={(e) => setCCompanyName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="gb-c-ico">IČO</Label>
                  <Input id="gb-c-ico" value={cIco} onChange={(e) => setCIco(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="gb-c-dic">DIČ</Label>
                  <Input id="gb-c-dic" value={cDic} onChange={(e) => setCDic(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="gb-c-web">Web</Label>
                  <Input id="gb-c-web" value={cWebsite} onChange={(e) => setCWebsite(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="gb-c-email">Kontaktní e-mail</Label>
                  <Input id="gb-c-email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="gb-c-phone">Telefon</Label>
                  <Input id="gb-c-phone" value={cPhone} onChange={(e) => setCPhone(e.target.value)} />
                </div>
              </div>

              {nameCandidates.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <div className="mb-2 font-medium">Podobné firmy už v systému existují:</div>
                  <ul className="mb-2 list-disc pl-5">
                    {nameCandidates.map((c) => (
                      <li key={c.id}>
                        {c.name}
                        {c.ico ? ` · IČO ${c.ico}` : ''}
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void createCompany(true)}
                    disabled={creatingCompany}
                  >
                    Přesto založit novou firmu
                  </Button>
                </div>
              )}

              <Button type="button" onClick={() => void createCompany(false)} disabled={creatingCompany}>
                {creatingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Založit firmu
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Benefit ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">2. Garantovaný benefit</CardTitle>
          <CardDescription>
            Po uložení je benefit rovnou aktivní a připravený k distribuci podle zvoleného rozsahu.
            Cenu pro OneMil nastavujete rovnou zde.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="gb-name">Název benefitu *</Label>
              <Input id="gb-name" value={bName} onChange={(e) => setBName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="gb-kind">Typ benefitu</Label>
              <Select value={bKind} onValueChange={setBKind}>
                <SelectTrigger id="gb-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_amount">Sleva v Kč</SelectItem>
                  <SelectItem value="percentage">Sleva v %</SelectItem>
                  <SelectItem value="product">Produkt / dárek</SelectItem>
                  <SelectItem value="other">Jiné</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="gb-value">Hodnota slevy</Label>
              <Input id="gb-value" inputMode="decimal" value={bValue} onChange={(e) => setBValue(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="gb-min">Minimální nákup</Label>
              <Input id="gb-min" inputMode="decimal" value={bMinPurchase} onChange={(e) => setBMinPurchase(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="gb-from">Platnost od</Label>
              <Input id="gb-from" type="date" value={bValidFrom} onChange={(e) => setBValidFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="gb-until">Platnost do</Label>
              <Input id="gb-until" type="date" value={bValidUntil} onChange={(e) => setBValidUntil(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="gb-short">Krátký popis</Label>
            <Input id="gb-short" value={bShort} onChange={(e) => setBShort(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gb-how">Jak benefit uplatnit *</Label>
            <Textarea id="gb-how" rows={3} value={bHowToUse} onChange={(e) => setBHowToUse(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gb-terms">Podmínky *</Label>
            <Textarea id="gb-terms" rows={3} value={bTerms} onChange={(e) => setBTerms(e.target.value)} />
          </div>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch id="gb-unlimited" checked={bUnlimited} onCheckedChange={setBUnlimited} />
            <Label htmlFor="gb-unlimited" className="cursor-pointer">
              {bUnlimited ? (
                <span className="flex items-center gap-2">
                  <InfinityIcon className="h-4 w-4" /> Neomezený benefit (trvalý kód nebo odkaz)
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Hash className="h-4 w-4" /> Omezený benefit (konkrétní kódy)
                </span>
              )}
            </Label>
          </div>

          {bUnlimited ? (
            <div>
              <Label htmlFor="gb-shared">Trvalý kód nebo odkaz *</Label>
              <Input
                id="gb-shared"
                value={bSharedCode}
                onChange={(e) => setBSharedCode(e.target.value)}
                placeholder="např. ONEMIL10 nebo https://…"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Neomezený benefit negeneruje žádné jednorázové kódy.
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="gb-codes">Kódy *</Label>
              <Textarea
                id="gb-codes"
                rows={4}
                value={bCodesRaw}
                onChange={(e) => setBCodesRaw(e.target.value)}
                placeholder="Jeden kód na řádek"
              />
            </div>
          )}

          <div className="space-y-3 rounded-md border p-3">
            <div className="text-sm font-medium">Cena pro OneMil</div>
            <p className="text-xs text-muted-foreground">
              Kolik OneMil účtuje partnerovi za jedno vydání benefitu. Benefit poskytovaný zdarma
              nechte na 0. Nastavení se uloží jako partnerské cenové pravidlo.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="gb-price">Cena bez DPH</Label>
                <Input
                  id="gb-price"
                  inputMode="decimal"
                  value={bPrice}
                  onChange={(e) => setBPrice(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="gb-vat">Sazba DPH (%)</Label>
                <Input
                  id="gb-vat"
                  inputMode="decimal"
                  value={bVat}
                  onChange={(e) => setBVat(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gb-scope">Distribuce</Label>
            <Select value={bScope} onValueChange={setBScope}>
              <SelectTrigger id="gb-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_contests">Všechny soutěže (současné i budoucí)</SelectItem>
                <SelectItem value="selected_contests">Vybrané soutěže</SelectItem>
              </SelectContent>
            </Select>

            {bScope === 'selected_contests' && (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {contests.length === 0 && (
                  <p className="p-2 text-sm text-muted-foreground">Žádné dostupné soutěže.</p>
                )}
                {contests.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                    <Checkbox
                      checked={bContestIds.includes(c.id)}
                      onCheckedChange={() => toggleContest(c.id)}
                    />
                    <span>{c.name}</span>
                    <Badge variant="outline">{c.status}</Badge>
                  </label>
                ))}
              </div>
            )}
          </div>

          <Button type="button" onClick={() => void createBenefit()} disabled={savingBenefit || !selectedPartner}>
            {savingBenefit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Vytvořit benefit
          </Button>
        </CardContent>
      </Card>

      {/* ── 3. Přehled ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Přehled garantovaných benefitů</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Načítám…
            </div>
          ) : benefits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Zatím žádné garantované benefity.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma</TableHead>
                  <TableHead>Benefit</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Distribuce</TableHead>
                  <TableHead>Zásoba</TableHead>
                  <TableHead>Cena pro OneMil</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead className="text-right">Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benefits.map((b) => (
                  <TableRow key={b.order_id}>
                    <TableCell>
                      {b.partner_name}
                      {b.partner_benefit_only && (
                        <Badge variant="secondary" className="ml-2">Evidenční</Badge>
                      )}
                    </TableCell>
                    <TableCell>{b.benefit_name}</TableCell>
                    <TableCell>{b.is_unlimited ? 'Neomezený' : 'Omezený'}</TableCell>
                    <TableCell>
                      {SCOPE_LABEL[b.distribution_scope] ?? b.distribution_scope}
                      {b.distribution_scope === 'selected_contests' && ` (${b.linked_contests})`}
                    </TableCell>
                    <TableCell>{b.is_unlimited ? '∞' : `${b.available_codes} volných`}</TableCell>
                    <TableCell>
                      {b.unit_price_ex_vat_snapshot === null
                        ? '—'
                        : `${b.unit_price_ex_vat_snapshot} ${b.currency_snapshot ?? ''} bez DPH`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.order_status === 'approved' ? 'default' : 'outline'}>
                        {STATUS_LABEL[b.order_status] ?? b.order_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {b.order_status === 'approved' && (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={savingStatusId === b.order_id}
                            onClick={() => void changeBenefitStatus(b.order_id, 'suspended')}
                          >
                            Pozastavit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={savingStatusId === b.order_id}
                            onClick={() => void changeBenefitStatus(b.order_id, 'ended')}
                          >
                            Ukončit
                          </Button>
                        </div>
                      )}
                      {b.order_status === 'suspended' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={savingStatusId === b.order_id}
                          onClick={() => void changeBenefitStatus(b.order_id, 'approved')}
                        >
                          Obnovit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminGuaranteedBenefits;
