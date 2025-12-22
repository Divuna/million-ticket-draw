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

interface BonusPrizeData {
  id: string;
  title: string | null;
  description: string;
  amount: number | null;
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
  const [bonusPrize, setBonusPrize] = useState<BonusPrizeData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
          .select('id, title, description, amount')
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

  if (!result) return null;

  // Detection logic: bonus win if bonus_prizes record exists
  const isBonusWin = bonusPrize !== null;
  // Main prize detection from won_type or legacy fields
  const isMainPrize = result.won_type === 'main' || result.won_main === true;
  const isWinner = isBonusWin || isMainPrize;

  const handleGoToWins = () => {
    navigate('/wins');
    onClose();
  };

  const handleShowBonusPrizes = () => {
    navigate(`/contest/${contestId}/bonus`);
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
                <Button 
                  onClick={handleGoToWins}
                  className="w-full mt-2"
                >
                  Přejít do výher
                </Button>
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
              <Button 
                variant="outline" 
                onClick={handleShowBonusPrizes}
                className="w-full"
              >
                Zobrazit bonusové ceny
              </Button>
            </div>
          )}
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