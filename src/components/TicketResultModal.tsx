import React, { useEffect, useState } from 'react';
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
  } | null;
}

interface BonusPrizeDetails {
  image_url: string | null;
  title: string | null;
  description: string;
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
  const [bonusPrizeDetails, setBonusPrizeDetails] = useState<BonusPrizeDetails | null>(null);

  // Fetch bonus prize details when modal opens with a bonus win
  useEffect(() => {
    if (isOpen && result?.bonus_prize_id && result?.won_type === 'bonus') {
      fetchBonusPrizeDetails(result.bonus_prize_id);
    } else {
      setBonusPrizeDetails(null);
    }
  }, [isOpen, result?.bonus_prize_id, result?.won_type]);

  const fetchBonusPrizeDetails = async (prizeId: string) => {
    try {
      const { data, error } = await supabase
        .from('bonus_prizes')
        .select('image_url, title, description')
        .eq('id', prizeId)
        .single();

      if (!error && data) {
        setBonusPrizeDetails(data);
      }
    } catch (error) {
      console.error('Error fetching bonus prize details:', error);
    }
  };

  if (!result) return null;

  // Detection logic using won_type
  const isBonusWin = result?.won_type === 'bonus';
  const isMainPrize = result?.won_type === 'main';
  const isWinner = isBonusWin || isMainPrize;

  // Development logging
  if (import.meta.env.DEV && result) {
    console.log('🎪 TicketResultModal - result:', result);
    console.log('🎯 Win detection:', { isBonusWin, isMainPrize, isWinner });
  }

  const handleShowBonusPrizes = () => {
    navigate(`/contest/${contestId}/bonus`);
    onClose();
  };

  const getRandomFunnyMessage = () => {
    return funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
  };

  // Get prize name for display
  const getPrizeName = (): string => {
    if (isBonusWin) {
      return bonusPrizeDetails?.title || bonusPrizeDetails?.description || result.won_prize || 'Bonusová výhra';
    }
    return result.won_prize || 'Hlavní cena';
  };

  // Get prize image for bonus wins
  const getPrizeImage = (): string | null => {
    if (isBonusWin && bonusPrizeDetails?.image_url) {
      return bonusPrizeDetails.image_url;
    }
    return null;
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
            {isMainPrize ? '🏆 Hlavní výhra!' : isWinner ? '🎉 Výhra!' : 'Výsledek tiketu'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isWinner ? (
            isBonusWin ? (
              <div className="text-center space-y-3">
                {/* Prize image for bonus wins */}
                {getPrizeImage() && (
                  <div className="mx-auto w-32 h-32 rounded-xl overflow-hidden border-2 border-green-500/30 shadow-lg">
                    <img 
                      src={getPrizeImage()!} 
                      alt={getPrizeName()}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {!getPrizeImage() && <div className="text-6xl">🎉</div>}
                
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <p className="text-lg font-semibold text-green-500">
                    Gratulujeme, vyhrál jsi!
                  </p>
                  <p className="text-foreground font-medium mt-1">
                    {getPrizeName()}
                  </p>
                </div>
                
                <p className="text-muted-foreground">
                  Tiket #{result.ticket_number.toLocaleString('cs-CZ')}
                </p>
                {result.remaining_tickets !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    Zbývá tiketů: <span className="font-semibold">{result.remaining_tickets.toLocaleString('cs-CZ')}</span>
                  </p>
                )}
              </div>
            ) : isMainPrize ? (
              <div className="text-center space-y-3">
                <div className="text-6xl">🏆</div>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-lg font-semibold text-yellow-500">
                    Gratulujeme, vyhrál jsi hlavní cenu!
                  </p>
                  {result.won_prize && (
                    <p className="text-foreground font-medium mt-1">
                      {result.won_prize}
                    </p>
                  )}
                </div>
                <p className="text-muted-foreground">
                  Tiket #{result.ticket_number.toLocaleString('cs-CZ')}
                </p>
              </div>
            ) : null
          ) : (
            <div className="text-center space-y-4">
              <div className="text-4xl">🎯</div>
              <p className="text-lg font-medium">
                {getRandomFunnyMessage()}
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