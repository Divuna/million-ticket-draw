/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  PLAYER REFERRAL SYSTEM — Non-monetary, in-game MioCoin rewards            ║
 * ║                                                                            ║
 * ║  This component is part of the PLAYER referral system. It uses:            ║
 * ║    • referral_codes — unique codes per player                              ║
 * ║    • referrals — tracking who referred whom                                ║
 * ║    • referral_rewards — MioCoin rewards (5% commission + 15 MC bonus)      ║
 * ║    • referral_attempts — anti-abuse logging                                ║
 * ║    • referral_blocked_users — fraud prevention                             ║
 * ║                                                                            ║
 * ║  ⚠️  THIS SYSTEM IS INTENTIONALLY SEPARATE from the Influencer system.     ║
 * ║  These two systems MUST NEVER be merged or unified.                        ║
 * ║                                                                            ║
 * ║  Player referrals: non-monetary, in-game MioCoin rewards only.             ║
 * ║  Influencer system: monetary CZK payouts, invoiced, admin-controlled.      ║
 * ║  See: src/hooks/useInfluencerData.ts for the influencer counterpart.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { sumNetReferralRewards } from '@/lib/referralRewards';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { buildPublicUrl } from '@/lib/publicAppUrl';
import {
  Loader2,
  Copy,
  Check,
  Users,
  Share2,
  ChevronDown,
  Link as LinkIcon,
  Gift,
} from 'lucide-react';

interface ReferralReward {
  id: string;
  reward_mc: number;
  reversal_target_mc?: number | null;
  status: string;
  created_at: string;
}

interface ReferralSummary {
  totalEarned: number;
  activeCount: number;
  inactiveCount: number;
}

const ReferralSection: React.FC<{ isLoaded: boolean }> = ({ isLoaded }) => {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [summary, setSummary] = useState<ReferralSummary>({
    totalEarned: 0,
    activeCount: 0,
    inactiveCount: 0,
  });
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alreadyHasReferrer, setAlreadyHasReferrer] = useState(false);

  // Short public alias for the long-form /register?ref=CODE link — same
  // ?ref= attribution flow, only the URL shown/copied/shared/encoded to the
  // customer is shorter. See src/pages/CustomerReferralShortLink.tsx.
  const referralLink = referralCode
    ? buildPublicUrl(`/r/${encodeURIComponent(referralCode)}`)
    : '';

  useEffect(() => {
    if (user?.id) {
      fetchAll();
    }
  }, [user?.id]);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchReferralCode(), fetchReferrals(), fetchRewards(), checkHasReferrer()]);
    setLoading(false);
  };

  const fetchReferralCode = async () => {
    try {
      const { data, error } = await (supabase.rpc as any)('ensure_referral_code', {
        p_user_id: user!.id,
      });
      if (error) {
        console.error('Error fetching referral code:', error);
      } else {
        setReferralCode(data as string);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const fetchReferrals = async () => {
    try {
      const { data, error } = await supabase
        .from('referrals')
        .select('status')
        .eq('referrer_user_id', user!.id);

      if (error) {
        console.error('Error fetching referrals:', error);
        return;
      }

      const active = (data || []).filter((r) => r.status === 'active').length;
      const inactive = (data || []).filter((r) => r.status !== 'active').length;

      setSummary((prev) => ({ ...prev, activeCount: active, inactiveCount: inactive }));
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const fetchRewards = async () => {
    try {
      const { data, error } = await supabase
        .from('referral_rewards')
        .select('id, reward_mc, reversal_target_mc, status, created_at')
        .eq('referrer_user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching rewards:', error);
        return;
      }

      setRewards(data || []);
      // Čistá odměna: částečně stornovaná jen v části, která zůstala.
      const totalEarned = sumNetReferralRewards(data || []);
      setSummary((prev) => ({ ...prev, totalEarned }));
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const checkHasReferrer = async () => {
    try {
      const { data, error } = await supabase
        .from('referrals')
        .select('referred_user_id')
        .eq('referred_user_id', user!.id)
        .limit(1);

      if (!error && data && data.length > 0) {
        setAlreadyHasReferrer(true);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const handleCopyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCodeCopied(true);
      toast({ title: 'Zkopírováno', description: 'Doporučovací kód byl zkopírován do schránky.' });
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      toast({ title: 'Chyba', description: 'Nepodařilo se zkopírovat kód.', variant: 'destructive' });
    }
  };

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setLinkCopied(true);
      toast({ title: 'Zkopírováno', description: 'Doporučovací odkaz byl zkopírován do schránky.' });
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast({ title: 'Chyba', description: 'Nepodařilo se zkopírovat odkaz.', variant: 'destructive' });
    }
  };

  const handleShare = async () => {
    if (!referralLink) return;
    const shareData = {
      title: 'Připoj se k OneMil!',
      text: `Zaregistruj se na OneMil pomocí mého kódu ${referralCode} a hraj o luxusní ceny!`,
      url: referralLink,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled - ignore
      }
    } else {
      handleCopyLink();
    }
  };

  const handleSubmitCode = async () => {
    const code = inputCode.trim();
    if (!code) {
      toast({ title: 'Chyba', description: 'Zadej doporučovací kód.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await (supabase.rpc as any)('set_my_referrer_by_code', {
        p_code: code,
        p_source: 'manual',
      });

      if (error) throw error;

      const result = data as string;

      if (result === 'accepted') {
        toast({ title: 'Úspěch', description: 'Doporučovací kód byl úspěšně aktivován!' });
        setInputCode('');
        setAlreadyHasReferrer(true);
      } else if (result === 'rejected:already_has_referrer') {
        toast({ title: 'Upozornění', description: 'Už máš přiřazeného doporučitele.', variant: 'destructive' });
        setAlreadyHasReferrer(true);
      } else if (result === 'rejected:already_attributed_to_other_source') {
        // Hráč už má jiný odměňovaný zdroj přivedení (affiliate) — platí first-touch.
        toast({ title: 'Upozornění', description: 'Tvůj účet už je přiřazen k jinému doporučení. Další kód už nelze přidat.' });
        setAlreadyHasReferrer(true);
      } else if (result === 'rejected:invalid_code') {
        toast({ title: 'Chyba', description: 'Neplatný doporučovací kód.', variant: 'destructive' });
      } else if (result === 'rejected:self_referral') {
        toast({ title: 'Chyba', description: 'Nemůžeš použít vlastní kód.', variant: 'destructive' });
      } else if (result === 'rejected:email_not_verified') {
        toast({ title: 'Chyba', description: 'Nejdřív si ověř svůj e-mail.', variant: 'destructive' });
      } else if (result === 'rejected:referrer_blocked') {
        toast({ title: 'Chyba', description: 'Tento kód nelze použít.', variant: 'destructive' });
      } else {
        toast({ title: 'Chyba', description: 'Nepodařilo se aktivovat kód. Zkus to znovu.', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('Error submitting referral code:', err);
      toast({ title: 'Chyba', description: err.message || 'Nepodařilo se aktivovat kód.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'earned':
        return { text: 'Připsáno', cls: 'text-green-500 bg-green-500/15 border-green-500/25' };
      case 'reversed':
        return { text: 'Stornováno', cls: 'text-destructive bg-destructive/15 border-destructive/25' };
      case 'partially_reversed':
        return { text: 'Částečně stornováno', cls: 'text-amber-500 bg-amber-500/15 border-amber-500/25' };
      case 'blocked':
        return { text: 'Zablokováno', cls: 'text-muted-foreground bg-muted/15 border-border/25' };
      default:
        return { text: status, cls: 'text-muted-foreground bg-muted/15 border-border/25' };
    }
  };

  if (loading) {
    return (
      <section className="om-pf-dc flex items-center justify-center min-h-[140px]" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-[#E9B949]" aria-hidden="true" />
        <span className="sr-only">Načítám pozvánku</span>
      </section>
    );
  }

  return (
    <section
      className={`om-pf-dc transition-all duration-700 ease-out ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
    >
      <div className="om-pf-head">
        <span className="om-pf-ic"><Users aria-hidden="true" /></span>
        <div>
          <h2 className="om-pf-tt">Pozvi přátele</h2>
          <p className="om-pf-st">
            Získej 5 % z každého dobití pozvaného hráče a 15 MIO navíc za jeho první dobití
          </p>
        </div>
      </div>

      {/* Kód */}
      <p className="om-pf-kicker">Tvůj doporučovací kód</p>
      <div className="om-pf-refcode">
        <code className="select-all">{referralCode || '—'}</code>
        <button
          type="button"
          className="om-pf-icon-btn"
          onClick={handleCopyCode}
          disabled={!referralCode}
          aria-label="Kopírovat kód"
        >
          {codeCopied ? <Check className="h-4 w-4 text-[#7FE0A6]" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      <button
        type="button"
        onClick={handleShare}
        disabled={!referralCode}
        className="om-pf-btn om-pf-gold w-full mt-3"
      >
        <Share2 className="h-[18px] w-[18px]" aria-hidden="true" />
        Sdílet pozvánku
      </button>

      {/* Odkaz + QR */}
      <div className="om-pf-subbox mt-4">
        <p className="om-pf-kicker">Doporučovací odkaz</p>
        <div className="flex items-center gap-2">
          <p className="flex-1 m-0 text-[13px] text-[#D9DAE0] truncate select-all">{referralLink || '—'}</p>
          <button
            type="button"
            className="om-pf-icon-btn"
            onClick={handleCopyLink}
            disabled={!referralLink}
            aria-label="Kopírovat odkaz"
          >
            {linkCopied ? <Check className="h-4 w-4 text-[#7FE0A6]" aria-hidden="true" /> : <LinkIcon className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        {referralLink && (
          <div className="flex items-center gap-4 pt-3 mt-3 border-t border-[rgba(233,185,73,0.2)]">
            <div className="rounded-xl bg-white p-2.5 shrink-0">
              <QRCodeSVG value={referralLink} size={96} data-testid="referral-qr-code" />
            </div>
            <p className="om-pf-note">
              Naskenováním QR kódu se přátelé dostanou přímo na registraci s tvým doporučovacím kódem.
            </p>
          </div>
        )}
      </div>

      {/* Souhrn */}
      <div className="om-pf-stats mt-4">
        <div className="om-pf-stat">
          <strong className="tabular-nums">{summary.totalEarned}</strong>
          <span>Získáno MIO</span>
        </div>
        <div className="om-pf-stat">
          <strong className="tabular-nums">{summary.activeCount}</strong>
          <span>Aktivní</span>
        </div>
        <div className="om-pf-stat">
          <strong className="tabular-nums" style={{ color: '#A9AAB3' }}>{summary.inactiveCount}</strong>
          <span>Neaktivní</span>
        </div>
      </div>

      {/* Pravidla */}
      <div className="om-pf-subbox mt-4">
        <p className="om-pf-kicker">Jak to funguje</p>
        <ul className="om-pf-rules">
          <li><span>Za každé <strong className="text-white">placené dobití</strong> pozvaného hráče získáš <strong className="text-[#F6D77A]">5 % v MIO</strong>.</span></li>
          <li><span>Jednorázově <strong className="text-[#F6D77A]">+15 MIO</strong> po jeho prvním placeném dobití.</span></li>
          <li><span>Za samotnou registraci se odměna nepřipisuje – jen za placená dobití.</span></li>
          <li><span>MIO nelze vybrat ani směnit za peníze.</span></li>
        </ul>
      </div>

      {/* Zadat cizí kód */}
      {!alreadyHasReferrer && (
        <div className="mt-4">
          <p className="om-pf-kicker">Mám doporučovací kód</p>
          <div className="flex gap-2">
            <label className="flex-1 block">
              <span className="sr-only">Doporučovací kód</span>
              <input
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="Zadej kód…"
                autoComplete="off"
                className="om-pf-input om-pf-code"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitCode()}
              />
            </label>
            <button
              type="button"
              onClick={handleSubmitCode}
              disabled={submitting || !inputCode.trim()}
              className="om-pf-btn om-pf-outline-dark shrink-0"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Gift className="h-4 w-4" aria-hidden="true" />}
              Použít
            </button>
          </div>
        </div>
      )}

      {alreadyHasReferrer && (
        <p className="mt-4 mb-0 flex items-center gap-2 text-[13px] text-[#7FE0A6]">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          Tvůj doporučitel je už přiřazen.
        </p>
      )}

      {/* Historie odměn */}
      <div className="mt-5 pt-4 border-t border-[rgba(233,185,73,0.2)]">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="om-pf-kicker" style={{ margin: 0 }}>Historie odměn</h3>
          {(rewards ?? []).length > 3 && (
            <button
              type="button"
              className="om-pf-refresh"
              onClick={() => setHistoryExpanded(!historyExpanded)}
              aria-expanded={historyExpanded}
            >
              {historyExpanded ? 'Skrýt' : 'Zobrazit vše'}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${historyExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          )}
        </div>

        {(rewards ?? []).length === 0 ? (
          <p className="om-pf-note italic">Zatím žádné odměny z doporučení</p>
        ) : (
          <div className={historyExpanded ? 'max-h-64 overflow-y-auto pr-1' : ''}>
            {(historyExpanded ? (rewards ?? []) : (rewards ?? []).slice(0, 3)).map((reward) => {
              const statusInfo = getStatusLabel(reward.status);
              return (
                <div key={reward.id} className="om-pf-history-row">
                  <span className="text-[13px] font-extrabold text-[#F6D77A] tabular-nums">
                    +{Number(reward.reward_mc).toLocaleString('cs-CZ')} MIO
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusInfo.cls}`}>
                      {statusInfo.text}
                    </span>
                    <span className="text-[11px] text-[#A9AAB3] tabular-nums">
                      {format(new Date(reward.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default ReferralSection;
