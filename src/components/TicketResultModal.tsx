import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Facebook } from 'lucide-react';

const SHARE_TEXT = "Zahrál jsem si na OneMil 🎟️ a právě teď jsem zkusil štěstí! 🍀 Přidej se taky 👉 onemil.cz";
const SHARE_URL = "https://onemil.cz";

interface BonusPrizeData {
  id: string;
  title: string | null;
  description: string;
  amount: number | null;
  status: string;
}

interface TicketResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  contestId: string;
  result: {
    ticket_number: number;
    distance_to_next_bonus: number | null;
    next_bonus_position: number | null;
    won_prize?: string | null;
    remaining_tickets?: number;
    won_type?: 'bonus' | 'main' | null;
    bonus_prize_id?: string | null;
    // Legacy boolean fields for backward compatibility
    won_bonus?: boolean;
    won_main?: boolean;
  } | null | undefined;
}

const funnyMessages = [
  "Tentokrát to nevyšlo, ale nevzdávej to! 🎯",
  "Štěstí přeje připraveným, zkus to znovu! 🍀", 
  "Skoro to bylo, příště to určitě vyjde! 💪",
  "Každý tiket tě přibližuje k výhře! 🎪",
  "Neúspěch je jen začátek úspěchu! 🌟"
];

export const TicketResultModal: React.FC<TicketResultModalProps> = ({
  isOpen,
  onClose,
  contestId,
  result
}) => {
  const { width, height } = useWindowSize();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bonusPrize, setBonusPrize] = useState<BonusPrizeData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Query bonus_prizes when modal opens
  useEffect(() => {
    if (!isOpen || !result || !contestId) {
      setBonusPrize(null);
      return;
    }

    const fetchBonusPrize = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('bonus_prizes')
          .select('id, title, description, amount, status')
          .eq('contest_id', contestId)
          .eq('ticket_position', result.ticket_number)
          .maybeSingle();

        if (error) {
          console.error('Error fetching bonus prize:', error);
          setBonusPrize(null);
        } else {
          setBonusPrize(data);
        }
      } catch (err) {
        console.error('Error in bonus prize query:', err);
        setBonusPrize(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBonusPrize();
  }, [isOpen, result, contestId]);

  // Memoize random message to prevent re-renders changing it
  const funnyMessage = useMemo(() => {
    return funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
  }, [result?.ticket_number]);

  const handleClaimBonus = async () => {
    if (!bonusPrize || !user) return;
    
    setIsClaiming(true);
    try {
      const { error } = await supabase.rpc('claim_miocoin_bonus', {
        p_bonus_id: bonusPrize.id,
        p_user_id: user.id
      });

      if (error) {
        toast({
          title: 'Chyba',
          description: error.message || 'Nepodařilo se uplatnit výhru.',
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Výhra uplatněna!',
        description: `MioCoiny byly připsány na tvůj účet.`
      });

      // Refresh wallet balance
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });

      onClose();
    } catch (err) {
      console.error('Error claiming bonus:', err);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se uplatnit výhru.',
        variant: 'destructive'
      });
    } finally {
      setIsClaiming(false);
    }
  };

  if (!result) return null;

  // Detection logic: bonus win if bonus_prizes record exists
  const isBonusWin = bonusPrize !== null;
  // Main prize detection from won_type or legacy fields
  const isMainPrize = result.won_type === 'main' || result.won_main === true;
  const isWinner = isBonusWin || isMainPrize;

  // Check if bonus is already claimed
  const isBonusClaimed = bonusPrize?.status === 'won';

  const handleGoToWins = () => {
    navigate('/wins');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        {isWinner && (
          <Confetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={isMainPrize ? 500 : 150}
            gravity={isMainPrize ? 0.2 : 0.4}
            colors={isMainPrize ? ['#FFD700', '#FFA500', '#FF4500', '#DC143C', '#8A2BE2'] : undefined}
          />
        )}
        
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            {isMainPrize ? '' : isWinner ? 'Výhra! 🎉' : 'Výsledek tiketu'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isWinner ? (
            isBonusWin && bonusPrize ? (
              <div className="text-center space-y-3">
                <div className="text-6xl">🎉</div>
                <p className="text-lg font-semibold text-green-600">
                  Gratulujeme, vyhrál jsi bonus: {bonusPrize.title || bonusPrize.description}
                </p>
                {bonusPrize.amount && bonusPrize.amount > 0 && (
                  <p className="text-md text-muted-foreground">
                    MioCoin: <span className="font-semibold text-primary">{bonusPrize.amount.toLocaleString('cs-CZ')}</span>
                  </p>
                )}
                <p className="text-muted-foreground">
                  Tiket #{result.ticket_number.toLocaleString('cs-CZ')}
                </p>
                {result.remaining_tickets !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    Zbývá tiketů: <span className="font-semibold">{result.remaining_tickets.toLocaleString('cs-CZ')}</span>
                  </p>
                )}
                {result.distance_to_next_bonus && result.distance_to_next_bonus > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Do další bonusové výhry: <span className="font-semibold text-primary">{result.distance_to_next_bonus.toLocaleString('cs-CZ')} tiketů</span>
                  </p>
                )}
                {isBonusClaimed ? (
                  <Button 
                    onClick={handleGoToWins}
                    className="w-full mt-2"
                  >
                    Přejít do výher
                  </Button>
                ) : (
                  <Button 
                    onClick={handleClaimBonus}
                    disabled={isClaiming || !user}
                    className="w-full mt-2"
                  >
                    {isClaiming ? 'Uplatňuji...' : 'Uplatnit výhru'}
                  </Button>
                )}
              </div>
            ) : isMainPrize ? (
              <div className="text-center space-y-3">
                <div className="text-6xl">🏆</div>
                <p className="text-lg font-semibold text-yellow-600">
                  Gratulujeme, vyhrál jsi hlavní cenu!
                </p>
                <p className="text-muted-foreground">
                  Tiket #{result.ticket_number.toLocaleString('cs-CZ')}
                </p>
              </div>
            ) : null
          ) : isLoading ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">⏳</div>
              <p className="text-lg font-medium">Kontroluji výhru...</p>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="text-4xl">🎯</div>
              <p className="text-lg font-medium">
                {funnyMessage}
              </p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Tvůj tiket: <span className="font-semibold">#{result.ticket_number.toLocaleString('cs-CZ')}</span>
                </p>
                {result.distance_to_next_bonus && !isWinner && (
                  <p className="text-sm text-muted-foreground">
                    Do bonusové výhry zbývá: <span className="font-semibold text-primary">{result.distance_to_next_bonus.toLocaleString('cs-CZ')} tiketů</span>
                  </p>
                )}
                {result.remaining_tickets !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    Zbývá tiketů: <span className="font-semibold">{result.remaining_tickets.toLocaleString('cs-CZ')}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Social Sharing Section */}
        <div className="border-t border-border/30 pt-4 mt-2">
          <p className="text-sm text-muted-foreground text-center mb-3">Sdílet výsledek</p>
          <div className="flex justify-center gap-3">
            {/* Facebook */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SHARE_URL)}&quote=${encodeURIComponent(SHARE_TEXT)}`, '_blank', 'width=600,height=400')}
              title="Sdílet na Facebook"
            >
              <Facebook className="h-5 w-5 text-[#1877F2]" />
            </Button>
            
            {/* Instagram */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => window.open('https://www.instagram.com/', '_blank')}
              title="Sdílet na Instagram"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="url(#instagram-gradient)">
                <defs>
                  <linearGradient id="instagram-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FFDC80" />
                    <stop offset="25%" stopColor="#FCAF45" />
                    <stop offset="50%" stopColor="#F77737" />
                    <stop offset="75%" stopColor="#F56040" />
                    <stop offset="100%" stopColor="#C13584" />
                  </linearGradient>
                </defs>
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </Button>
            
            {/* TikTok */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => window.open('https://www.tiktok.com/', '_blank')}
              title="Sdílet na TikTok"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
            </Button>
            
            {/* X (Twitter) */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(SHARE_URL)}`, '_blank', 'width=600,height=400')}
              title="Sdílet na X"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </Button>
          </div>
        </div>

        <div className="flex justify-center">
          <Button onClick={onClose} className="w-full">
            Zavřít
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};