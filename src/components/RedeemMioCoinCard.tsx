import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { toast } from '@/hooks/use-toast';
import { Loader2, Ticket } from 'lucide-react';
import { formatMioCoin } from '@/lib/miocoin';
import { getMioCoinCodeFromSearch, withoutMioCoinCode } from '@/lib/miocoinRedeemUrl';
import {
  MIOCOIN_REDEEM_ERROR_MESSAGES,
  redeemMioCoinCode,
  type RedeemResult,
} from '@/lib/miocoinRedeem';

interface RedeemMioCoinCardProps {
  /** Called after a successful redemption so the parent can refresh wallet balance and history. */
  onRedeemed?: () => void;
}

export const RedeemMioCoinCard = ({ onRedeemed }: RedeemMioCoinCardProps) => {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const automaticallyAttemptedCode = useRef<string | null>(null);

  const showResult = useCallback((result: RedeemResult, automatic: boolean) => {
    if (result?.success) {
      toast({
        title: automatic ? 'MIO uplatněna' : 'Kód uplatněn',
        description: automatic
          ? `MIO z odkazu byla úspěšně uplatněna. Připsáno ${formatMioCoin(Number(result.coins ?? 0))}.`
          : `Kód byl úspěšně uplatněn. Připsáno ${formatMioCoin(Number(result.coins ?? 0))}.`,
      });
      setCode('');
      onRedeemed?.();
      return;
    }

    const msg = MIOCOIN_REDEEM_ERROR_MESSAGES[result?.error ?? ''] ?? 'Nepodařilo se uplatnit kód. Zkus to znovu.';
    toast({ title: automatic ? 'MIO nebyla uplatněna' : 'Chyba', description: msg, variant: 'destructive' });
  }, [onRedeemed]);

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast({ title: 'Chyba', description: 'Zadej MIO kód.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await redeemMioCoinCode(trimmed);
      showResult(result, false);
    } catch (err: unknown) {
      console.error('Error redeeming MioCoin code:', err);
      toast({
        title: 'Chyba',
        description: err instanceof Error ? err.message : 'Nepodařilo se uplatnit kód. Zkus to znovu.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const codeFromUrl = getMioCoinCodeFromSearch(location.search);
    if (!codeFromUrl || automaticallyAttemptedCode.current === codeFromUrl) return;

    // The code is attempted at most once per mounted profile page. The canonical
    // RPC row lock and status transition remain the authority against double credit.
    automaticallyAttemptedCode.current = codeFromUrl;

    const redeemFromEmailLink = async () => {
      setSubmitting(true);
      try {
        const result = await redeemMioCoinCode(codeFromUrl);
        showResult(result, true);
      } catch (err: unknown) {
        console.error('Error automatically redeeming MioCoin code:', err);
        toast({
          title: 'MIO nebyla uplatněna',
          description: err instanceof Error ? err.message : 'Nepodařilo se uplatnit kód z e-mailového odkazu. Zkus to znovu ručně.',
          variant: 'destructive',
        });
      } finally {
        setSubmitting(false);
        // A completed automatic attempt must not run again after a page refresh.
        navigate(
          { pathname: location.pathname, search: withoutMioCoinCode(location.search) },
          { replace: true },
        );
      }
    };

    void redeemFromEmailLink();
  }, [location.pathname, location.search, navigate, showResult]);

  return (
    <section className="om-pf-lc">
      <div className="om-pf-head">
        <span className="om-pf-ic"><Ticket aria-hidden="true" /></span>
        <div>
          <h2 className="om-pf-tt">Uplatnit MIO kód</h2>
          <p className="om-pf-st">Kód z nákupu u partnera, z kartičky nebo z e-mailu</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <label className="flex-1 block">
          <span className="sr-only">MIO kód</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ZADEJ MIO KÓD"
            disabled={submitting}
            autoComplete="off"
            className="om-pf-input om-pf-code"
            onKeyDown={(event) => event.key === 'Enter' && !submitting && handleRedeem()}
          />
        </label>
        <button
          type="button"
          onClick={handleRedeem}
          disabled={submitting || !code.trim()}
          className="om-pf-btn om-pf-black shrink-0"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Uplatnit kód
        </button>
      </div>
    </section>
  );
};

export default RedeemMioCoinCard;
