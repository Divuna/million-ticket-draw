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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Copy,
  Check,
  Users,
  Coins,
  UserPlus,
  UserX,
  Share2,
  ChevronDown,
  Link as LinkIcon,
  Gift,
} from 'lucide-react';

interface ReferralReward {
  id: string;
  reward_mc: number;
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

  const referralLink = referralCode
    ? `${window.location.origin}/register?ref=${referralCode}`
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
        .select('id, reward_mc, status, created_at')
        .eq('referrer_user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching rewards:', error);
        return;
      }

      setRewards(data || []);
      const totalEarned = (data || [])
        .filter((r) => r.status !== 'reversed')
        .reduce((sum, r) => sum + Number(r.reward_mc || 0), 0);
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
      toast({ title: 'Chyba', description: 'Zadejte doporučovací kód.', variant: 'destructive' });
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
        toast({ title: 'Upozornění', description: 'Již máte přiřazeného doporučitele.', variant: 'destructive' });
        setAlreadyHasReferrer(true);
      } else if (result === 'rejected:invalid_code') {
        toast({ title: 'Chyba', description: 'Neplatný doporučovací kód.', variant: 'destructive' });
      } else if (result === 'rejected:self_referral') {
        toast({ title: 'Chyba', description: 'Nemůžete použít vlastní kód.', variant: 'destructive' });
      } else if (result === 'rejected:email_not_verified') {
        toast({ title: 'Chyba', description: 'Nejprve ověřte svůj e-mail.', variant: 'destructive' });
      } else if (result === 'rejected:referrer_blocked') {
        toast({ title: 'Chyba', description: 'Tento kód nelze použít.', variant: 'destructive' });
      } else {
        toast({ title: 'Chyba', description: 'Nepodařilo se aktivovat kód. Zkuste to znovu.', variant: 'destructive' });
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
      case 'blocked':
        return { text: 'Zablokováno', cls: 'text-muted-foreground bg-muted/15 border-border/25' };
      default:
        return { text: status, cls: 'text-muted-foreground bg-muted/15 border-border/25' };
    }
  };

  if (loading) {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl border-primary/25 bg-gradient-to-br from-primary/5 via-card/95 to-primary/3 shadow-[0_0_30px_-8px_hsl(var(--border)/0.3)] transition-all duration-700 ease-out ${
          isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
        style={{ transitionDelay: '650ms' }}
      >
        <div className="relative p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl border-primary/25 bg-gradient-to-br from-primary/5 via-card/95 to-primary/3 shadow-[0_0_40px_-8px_rgba(255,138,0,0.15)] hover:border-opacity-60 hover:shadow-xl transition-all duration-700 ease-out ${
        isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
      style={{ transitionDelay: '650ms' }}
    >
      {/* Shimmer overlay */}
      <div
        className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background:
            'linear-gradient(105deg, transparent 40%, rgba(255,138,0,0.03) 45%, rgba(255,138,0,0.05) 50%, rgba(255,138,0,0.03) 55%, transparent 60%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s ease-in-out infinite',
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-primary/20"
            style={{
              left: `${15 + i * 20}%`,
              top: `${20 + (i % 3) * 25}%`,
              animation: `float ${4.5 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-16 h-16 bg-gradient-to-br from-primary/15 to-transparent rounded-br-full" />
      <div className="absolute bottom-0 right-0 w-16 h-16 bg-gradient-to-tl from-primary/10 to-transparent rounded-tl-full" />

      {/* Background glow */}
      <div className="absolute top-1/2 left-1/4 w-24 h-24 bg-primary/8 rounded-full blur-2xl" />

      <div className="relative p-8">
        {/* Section Header */}
        <div className="flex items-center gap-5 mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-xl blur-lg" />
            <div className="relative p-3.5 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/30 shadow-lg shadow-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
              Pozvi přátele
            </h2>
            <p className="text-sm text-muted-foreground/70 mt-0.5">
              Získejte <span className="text-primary font-semibold">5 %</span> z každého dobití pozvaného uživatele + <span className="text-primary font-semibold">15 MC bonus</span> za jeho první dobití
            </p>
          </div>
        </div>

        {/* Rules */}
        <div className="mb-6 p-4 rounded-xl bg-muted/30 border border-border/30 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Jak to funguje</p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>Za každé <strong className="text-foreground">placené dobití</strong> pozvaného uživatele získáte <strong className="text-primary">5 % v MioCoinech</strong>.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>Jednorázový bonus <strong className="text-primary">+15 MC</strong> po prvním placeném dobití pozvaného uživatele.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">•</span>
              <span>Odměna se nepřipisuje za registraci – pouze za placená dobití.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">•</span>
              <span>MioCoiny nelze vybrat ani směnit za peníze.</span>
            </li>
          </ul>
        </div>

        {/* Referral Code & Link */}
        <div className="space-y-4 mb-6">
          {/* Code */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-primary/8 via-transparent to-primary/5 border border-primary/15 hover:border-primary/30 transition-all duration-500 hover:shadow-lg hover:shadow-primary/5">
            <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Váš doporučovací kód</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 text-xl font-bold text-foreground tracking-widest select-all">
                {referralCode || '—'}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyCode}
                disabled={!referralCode}
                className="border-primary/30 hover:border-primary/50 hover:bg-primary/10 transition-all duration-300"
              >
                {codeCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Link */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-primary/8 via-transparent to-primary/5 border border-primary/15 hover:border-primary/30 transition-all duration-500 hover:shadow-lg hover:shadow-primary/5">
            <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Doporučovací odkaz</p>
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm text-muted-foreground truncate select-all">{referralLink || '—'}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                disabled={!referralLink}
                className="border-primary/30 hover:border-primary/50 hover:bg-primary/10 transition-all duration-300"
              >
                {linkCopied ? <Check className="h-4 w-4 text-green-500" /> : <LinkIcon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="p-4 rounded-xl bg-gradient-to-br from-[rgba(255,138,0,0.1)] to-[rgba(255,138,0,0.05)] border border-[rgba(255,138,0,0.2)] text-center">
            <div className="flex items-center justify-center mb-1">
              <Coins className="h-4 w-4 text-[#FFB547]" />
            </div>
            <p className="text-xl font-bold text-[#FFB547] tabular-nums">{summary.totalEarned}</p>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mt-1">Celkem MC</p>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20 text-center">
            <div className="flex items-center justify-center mb-1">
              <UserPlus className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-xl font-bold text-green-500 tabular-nums">{summary.activeCount}</p>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mt-1">Aktivní</p>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 border border-border/30 text-center">
            <div className="flex items-center justify-center mb-1">
              <UserX className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold text-muted-foreground tabular-nums">{summary.inactiveCount}</p>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mt-1">Neaktivní</p>
          </div>
        </div>

        {/* Action: Share */}
        <div className="mb-6">
          <Button
            onClick={handleShare}
            disabled={!referralCode}
            className="vip-button w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 font-semibold text-base transition-all duration-300 hover:scale-[1.01] hover:shadow-lg hover:shadow-primary/20"
            size="lg"
          >
            <Share2 className="h-5 w-5 mr-2" />
            Sdílet kód / odkaz
          </Button>
        </div>

        {/* Action: Enter referral code */}
        {!alreadyHasReferrer && (
          <div className="mb-6 p-5 rounded-2xl bg-gradient-to-br from-[rgba(255,138,0,0.08)] via-transparent to-[rgba(255,138,0,0.05)] border border-[rgba(255,138,0,0.15)]">
            <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">
              Mám doporučovací kód
            </p>
            <div className="flex gap-3">
              <Input
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="Zadejte kód..."
                className="premium-input flex-1 bg-[rgba(255,138,0,0.05)] border-[rgba(255,138,0,0.2)] focus:border-[rgba(255,138,0,0.4)] focus:bg-[rgba(255,138,0,0.1)] transition-all duration-300 uppercase tracking-wider"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitCode()}
              />
              <Button
                onClick={handleSubmitCode}
                disabled={submitting || !inputCode.trim()}
                className="vip-button bg-gradient-to-r from-[#FF8A00] to-[#FFB547] hover:from-[#FFB547] hover:to-[#FF8A00] text-black font-bold transition-all duration-300 hover:scale-[1.02]"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {alreadyHasReferrer && (
          <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-green-500 shrink-0" />
              <p className="text-sm text-green-500/80">Váš doporučitel je již přiřazen.</p>
            </div>
          </div>
        )}

        {/* Rewards History */}
        <div className="pt-6 border-t border-primary/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Historie odměn
            </h3>
            {(rewards ?? []).length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryExpanded(!historyExpanded)}
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-all duration-300"
              >
                {historyExpanded ? 'Skrýt' : 'Zobrazit vše'}
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-300 ${historyExpanded ? 'rotate-180' : ''}`}
                />
              </Button>
            )}
          </div>

          {(rewards ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Zatím žádné odměny z doporučení</p>
          ) : (
            <div
              className={`space-y-2 transition-all duration-500 ease-out ${
                historyExpanded ? 'max-h-64 overflow-y-auto' : 'max-h-none overflow-hidden'
              }`}
            >
              {(historyExpanded ? (rewards ?? []) : (rewards ?? []).slice(0, 3)).map((reward) => {
                const statusInfo = getStatusLabel(reward.status);
                return (
                  <div
                    key={reward.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-primary/5 via-transparent to-primary/5 border border-primary/10 hover:border-primary/20 transition-all duration-300"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-primary/15">
                        <Coins className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-bold text-foreground">
                        +{Number(reward.reward_mc).toLocaleString('cs-CZ')} MC
                      </span>
                    </div>
                    <div className="flex items-center gap-3 pl-8 sm:pl-0">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusInfo.cls}`}
                      >
                        {statusInfo.text}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format(new Date(reward.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReferralSection;
