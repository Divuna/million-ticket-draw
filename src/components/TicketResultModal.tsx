import React from 'react';
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

  if (!result) return null;

  // Derive won_type from legacy boolean fields if not present (backward compatibility)
  const derivedWonType = result.won_type 
    ?? (result.won_bonus ? 'bonus' : result.won_main ? 'main' : null);
  
  // Detection logic using derived won_type
  const isBonusWin = derivedWonType === 'bonus';
  const isMainPrize = derivedWonType === 'main';
  const isWinner = isBonusWin || isMainPrize;


  const handleShowBonusPrizes = () => {
    navigate(`/contest/${contestId}/bonus`);
    onClose();
  };

  const getRandomFunnyMessage = () => {
    return funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
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
            isBonusWin ? (
              <div className="text-center space-y-3">
                <div className="text-6xl">🎉</div>
                <p className="text-lg font-semibold text-green-600">
                  Gratulujeme, vyhrál jsi bonus: {result.won_prize}
                </p>
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