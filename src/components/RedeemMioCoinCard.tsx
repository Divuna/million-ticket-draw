import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { OneMilGiftIcon } from '@/components/icons/OneMilIcons';

interface RedeemMioCoinCardProps {
  /** Called after a successful redemption so the parent can refresh wallet balance. */
  onRedeemed?: () => void;
}

type RedeemResult = {
  success: boolean;
  coins?: number;
  new_balance?: number;
  error?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  not_logged_in: 'Pro uplatnění kódu se musíte přihlásit.',
  invalid_code: 'Neplatný kód. Zkontrolujte zadání a zkuste to znovu.',
  already_used: 'Tento kód již byl uplatněn.',
  expired: 'Platnost tohoto kódu vypršela.',
  cancelled: 'Tento kód byl zrušen.',
  email_mismatch: 'Tento kód je vázán na jiný e-mail.',
};

export const RedeemMioCoinCard = ({ onRedeemed }: RedeemMioCoinCardProps) => {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast({ title: 'Chyba', description: 'Zadejte MioCoin kód.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await (supabase.rpc as any)('redeem_miocoin_code', {
        p_code: trimmed,
      });

      if (error) throw error;

      const result = data as RedeemResult;

      if (result?.success) {
        toast({
          title: 'Kód uplatněn',
          description: `Kód byl úspěšně uplatněn. Připsáno ${Number(result.coins ?? 0).toLocaleString('cs-CZ')} MioCoinů.`,
        });
        setCode('');
        onRedeemed?.();
      } else {
        const msg = ERROR_MESSAGES[result?.error ?? ''] ?? 'Nepodařilo se uplatnit kód. Zkuste to znovu.';
        toast({ title: 'Chyba', description: msg, variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('Error redeeming MioCoin code:', err);
      toast({
        title: 'Chyba',
        description: err?.message || 'Nepodařilo se uplatnit kód. Zkuste to znovu.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
        border: '1px solid rgba(255,138,0,0.2)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,138,0,0.06)',
      }}
    >
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
            <h2 className="text-xl font-bold text-[#E7EBF0]">Uplatnit MioCoin kód</h2>
            <p className="text-sm text-gray-400">Zadejte MioCoin kód z partnerské akce, kartičky nebo e-mailu a připíšeme vám odměnu do peněženky.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ZADEJTE MIOCOIN KÓD…"
            disabled={submitting}
            className="flex-1 bg-[rgba(255,138,0,0.05)] border-[rgba(255,138,0,0.2)] focus:border-[rgba(255,138,0,0.4)] focus:bg-[rgba(255,138,0,0.1)] transition-all duration-200 uppercase tracking-wider"
            onKeyDown={(e) => e.key === 'Enter' && !submitting && handleRedeem()}
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
