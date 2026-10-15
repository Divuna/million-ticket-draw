import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import {
  clearPaymentSuccessContext,
  resolvePaymentSuccessViewContext,
} from '@/lib/paymentSuccessContext';
import { analytics } from '@/lib/analytics';
import { isNativeApp } from '@/lib/nativeApp';
import { MioBadge } from '@/components/brand/MioBadge';
import avatarExcited from '@/assets/redesign/avatar/face-nadseny.png';

/** Skutečně připsaná platba (jen pokud ji už webhook potvrdil). */
interface CreditedPayment {
  total: number;
  base: number | null;
  bonus: number | null;
}

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  // Nativní aplikace: platební stránky nejsou dostupné — okamžitý redirect.
  const nativeApp = isNativeApp();
  useEffect(() => {
    if (nativeApp) navigate('/games', { replace: true });
  }, [nativeApp, navigate]);
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [{ kind, returnTo }] = useState(() => resolvePaymentSuccessViewContext(searchParams));
  const [credited, setCredited] = useState<CreditedPayment | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  const successLine =
    kind === 'voucher'
      ? 'Voucher byl přidán do tvého účtu'
      : 'MIO kredity byly připsány na tvůj účet';

  const handleBackToContests = () => {
    navigate(returnTo ?? '/games');
  };

  const toastShown = useRef(false);
  useEffect(() => {
    if (nativeApp) return;
    clearPaymentSuccessContext();
    if (toastShown.current) return;
    toastShown.current = true;
    const line =
      kind === 'voucher'
        ? 'Voucher byl přidán do tvého účtu'
        : 'MIO kredity byly připsány na tvůj účet';
    toast({
      title: line,
    });
    if (kind === 'voucher') {
      analytics.voucherPurchase(sessionId);
    } else if (kind === 'miocoin' && sessionId) {
      (async () => {
        try {
          const { supabase } = await import('@/integrations/supabase/client');
          const { data } = await supabase
            .from('payments')
            .select('amount, status, stripe_session_id, base_mio, bonus_mio, user_id')
            .eq('stripe_session_id', sessionId)
            .maybeSingle();
          if (data && data.status === 'completed') {
            const coins = Number(data.amount) || 0;
            const COIN_TO_CZK: Record<number, number> = { 50: 50, 310: 300, 525: 500, 1280: 1200 };
            const value = COIN_TO_CZK[coins] ?? coins;
            analytics.miocoinPurchase({ value, amount: coins, sessionId });

            // Zobrazení kroku 3 (deska Dobít): připsáno + nový zůstatek – jen ze skutečných dat.
            setCredited({
              total: coins,
              base: data.base_mio != null ? Number(data.base_mio) : null,
              bonus: data.bonus_mio != null ? Number(data.bonus_mio) : null,
            });
            const { data: wallet } = await supabase
              .from('wallets')
              .select('balance_coins')
              .eq('user_id', data.user_id)
              .maybeSingle();
            if (wallet) setNewBalance(Number(wallet.balance_coins) || 0);
          }
        } catch (err) {
          console.error('[analytics] miocoin_purchase fetch failed', err);
        }
      })();
    }
  }, [kind, sessionId, nativeApp]);

  if (nativeApp) return null;

  const fmt = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
  const hasBonus = credited?.bonus != null && credited.bonus > 0 && credited.base != null;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="om-ps relative mx-auto max-w-md overflow-hidden">
          <span aria-hidden="true" className="om-ps-beam" />
          {['#E9B949', '#E0253F', '#FFE29A', '#ECEDEF', '#E9B949'].map((c, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="om-ps-fall"
              style={{ left: `${12 + i * 19}%`, background: c, animationDelay: `${[0.3, 1.2, 2.1, 0.8, 1.7][i]}s` }}
            />
          ))}

          <div className="relative z-[1] flex flex-col items-center gap-3 px-5 pb-6 pt-8 text-center">
            {kind === 'voucher' ? (
              <div className="om-ps-land flex h-[120px] items-center justify-center text-6xl" aria-hidden="true">
                🎁
              </div>
            ) : (
              <div className="om-ps-land relative">
                <span aria-hidden="true" className="om-ps-ring" />
                <MioBadge width={190} />
                {hasBonus && (
                  <span className="om-ps-stamp">
                    +{fmt(credited!.bonus!)}
                    <small>BONUS</small>
                  </span>
                )}
              </div>
            )}

            <span className="om-ps-pill">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
              PLATBA PROBĚHLA
            </span>

            {credited ? (
              <>
                <strong className="om-ps-amount">+{fmt(credited.total)} MIO</strong>
                <span className="text-[15px] text-[#C9CAD1]">
                  {hasBonus
                    ? `jsou tvoje · ${fmt(credited.base!)} MIO + ${fmt(credited.bonus!)} bonus`
                    : 'jsou tvoje'}
                </span>
              </>
            ) : (
              <strong className="om-ps-amount om-ps-amount-sm">{successLine}</strong>
            )}

            {newBalance !== null && (
              <div className="om-ps-balance">
                <div className="flex items-center gap-2.5">
                  <span className="om-ps-face">
                    <img src={avatarExcited} alt="" aria-hidden="true" />
                  </span>
                  <span className="text-left text-[13px] leading-tight text-[#A9AAB3]">
                    Nový
                    <br />
                    zůstatek
                  </span>
                </div>
                <strong className="om-ps-balance-num">
                  {fmt(newBalance)} <span className="text-base">MIO</span>
                </strong>
              </div>
            )}

            <div className="mt-2 flex w-full flex-col gap-2.5">
              <button type="button" onClick={handleBackToContests} className="om-ps-gold">
                {returnTo ? 'Zpět do soutěže' : 'Jít do soutěží'}
              </button>
              <button type="button" onClick={() => navigate('/vouchers')} className="om-ps-ghost">
                Otevřít vouchery
              </button>
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="text-[13px] font-bold text-[#F2C55C] hover:text-[#FFE29A]"
              >
                Zobrazit peněženku
              </button>
            </div>

            {sessionId && (
              <div className="mt-1 text-[11px] text-[#8E8F98]">
                <p>ID transakce:</p>
                <p className="font-mono break-all">{sessionId}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
