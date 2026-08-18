import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { OneMilGiftIcon } from '@/components/icons/OneMilIcons';
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
        title: automatic ? 'MioCoiny uplatněny' : 'Kód uplatněn',
        description: automatic
          ? `MioCoiny z e-mailového odkazu byly úspěšně uplatněny. Připsáno ${formatMioCoin(Number(result.coins ?? 0))}.`
          : `Kód byl úspěšně uplatněn. Připsáno ${formatMioCoin(Number(result.coins ?? 0))}.`,
      });
      setCode('');
      onRedeemed?.();
      return;
    }

    const msg = MIOCOIN_REDEEM_ERROR_MESSAGES[result?.error ?? ''] ?? 'Nepodařilo se uplatnit kód. Zkuste to znovu.';
    toast({ title: automatic ? 'MioCoiny nebyly uplatněny' : 'Chyba', description: msg, variant: 'destructive' });
  }, [onRedeemed]);

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast({ title: 'Chyba', description: 'Zadejte MioCoin kód.', variant: 'destructive' });
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
        description: err instanceof Error ? err.message : 'Nepodařilo se uplatnit kód. Zkuste to znovu.',
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
          title: 'MioCoiny nebyly uplatněny',
          description: err instanceof Error ? err.message : 'Nepodařilo se uplatnit kód z e-mailového odkazu. Zkuste to znovu ručně.',
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
    <div className="homepage-light-panel relative overflow-hidden rounded-2xl border border-[rgba(255,138,0,0.18)] bg-white">
      <div className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, #FF8A00 0%, #c86000 100%)',
              boxShadow: '0 4px 20px rgba(255,138,0,0.25)',
            }}
          >
            <OneMilGiftIcon size={24} className="w-6 h-6 text-black" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Uplatnit MioCoin kód</h2>
            <p className="text-sm text-muted-foreground">Zadejte MioCoin kód z partnerské akce, kartičky nebo e-mailu a připíšeme vám odměnu do peněženky.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ZADEJTE MIOCOIN KÓD…"
            disabled={submitting}
            className="flex-1 bg-[rgba(255,138,0,0.05)] border-[rgba(255,138,0,0.2)] focus:border-[rgba(255,138,0,0.4)] focus:bg-[rgba(255,138,0,0.1)] transition-all duration-200 uppercase tracking-wider"
            onKeyDown={(event) => event.key === 'Enter' && !submitting && handleRedeem()}
          />
          <Button
            onClick={handleRedeem}
            disabled={submitting || !code.trim()}
            className="bg-gradient-to-r from-[#FF8A00] to-[#FFB547] hover:from-[#FFB547] hover:to-[#FF8A00] text-black font-bold transition-all duration-200 shrink-0"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Uplatnit kód
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RedeemMioCoinCard;
