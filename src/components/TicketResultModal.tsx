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
    won_prize?: string;
  } | null;
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
  const navigate = useNavigate();
  const { width, height } = useWindowSize();
  const isWinner = result?.won_prize;
  const isMainPrize = result?.ticket_number === 1000000;

  const handleShowBonusPrizes = () => {
    navigate(`/contest/${contestId}/bonus`);
    onClose();
  };

  const getRandomFunnyMessage = () => {
    return funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
  };

  if (!result) return null;

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
            isMainPrize ? (
              <div className="text-center space-y-4">
                <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 bg-clip-text text-transparent animate-pulse">
                  HLAVNÍ VÝHRA!
                </h1>
                <div className="text-8xl">🏆</div>
                <h3 className="text-xl font-semibold text-foreground">
                  Vyhrál jsi hlavní cenu: {result.won_prize}
                </h3>
                <p className="text-muted-foreground">
                  Tiket #{result.ticket_number.toLocaleString('cs-CZ')}
                </p>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="text-6xl">🎁</div>
                <h3 className="text-lg font-semibold text-green-600">
                  Gratulujeme!
                </h3>
                <p className="text-base font-medium">
                  Vyhrál jsi {result.won_prize}!
                </p>
                <p className="text-muted-foreground">
                  Tiket #{result.ticket_number.toLocaleString('cs-CZ')}
                </p>
              </div>
            )
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
                {result.distance_to_next_bonus && (
                  <p className="text-sm text-muted-foreground">
                    Do bonusové výhry zbývá: <span className="font-semibold text-primary">{result.distance_to_next_bonus.toLocaleString('cs-CZ')} tiketů</span>
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