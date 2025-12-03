import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { TicketMap } from '@/components/TicketMap';

interface Contest {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  ticket_price: number;
  status: string;
  ticket_count: number;
  created_at: string;
  banner_image?: string;
}

interface BonusPrize {
  id: string;
  description: string;
  ticket_position: number;
  status: string;
}

interface UserWallet {
  balance_coins: number;
}

interface UserWin {
  id: string;
  description: string;
  type: 'main' | 'bonus';
  status: string;
  delivered: boolean;
}

interface CustomerContestViewProps {
  contest: Contest;
  bonusPrizes: BonusPrize[];
  userWallet: UserWallet;
  userWins: UserWin[];
  purchasing: boolean;
  onBuyTicket: () => void;
}

export const CustomerContestView: React.FC<CustomerContestViewProps> = ({
  contest,
  bonusPrizes,
  userWallet,
  userWins,
  purchasing,
  onBuyTicket
}) => {
  const handleBuyClick = () => {
    if (userWallet.balance_coins < 1) {
      toast({
        title: "Nedostatek mincí",
        description: "Pro nákup tiketu potřebujete alespoň 1 minci.",
        variant: "destructive"
      });
      return;
    }
    onBuyTicket();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Contest Banner */}
      {contest.banner_image && (
        <div className="w-full">
          <img 
            src={contest.banner_image} 
            alt={`${contest.title} banner`}
            className="w-full h-auto rounded-2xl object-cover"
          />
        </div>
      )}
      
      {/* Contest Header */}
      <Card className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-3xl text-primary">{contest.title}</CardTitle>
              {contest.description && (
                <p className="mt-2 text-lg text-muted-foreground">
                  {contest.description}
                </p>
              )}
            </div>
            <Badge 
              variant={
                contest.status === 'active' ? 'default' : 
                contest.status === 'paused' ? 'secondary' :
                contest.status === 'closed' ? 'destructive' :
                'outline'
              }
              className={
                contest.status === 'paused' ? 'bg-orange-500 text-white' : 'text-sm'
              }
            >
              {contest.status === 'active' ? 'Aktivní' : 
               contest.status === 'paused' ? 'Pozastavená' :
               contest.status === 'closed' ? 'Uzavřená' :
               contest.status === 'draft' ? 'Koncept' : 'Neznámý'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Main Prize - No specific ticket number shown to customers */}
      <Card className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm shadow-lg">
        <CardHeader>
          <CardTitle className="text-primary">Hlavní cena</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-6 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20">
            <h3 className="text-2xl font-bold text-primary mb-2">
              {contest.main_prize}
            </h3>
            <p className="text-muted-foreground">
              Vyhrává poslední tiket!
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Closed Contest Banner */}
      {contest.status === 'closed' && (
        <Card className="rounded-2xl overflow-hidden border-red-500 bg-red-50 dark:bg-red-900/20">
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-bold text-red-700 dark:text-red-400 mb-2">Uzavřená – výhra padla</h3>
              <p className="text-red-600 dark:text-red-300">Tato soutěž byla ukončena a výherci byli určeni.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Purchase Section */}
      {contest.status === 'active' && (
        <Card className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm shadow-lg">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-1 text-primary">Uplatnit miocoiny</h3>
                <p className="text-muted-foreground">
                  Cena: 1 miocoin | Váš zůstatek: <span className="text-primary font-bold">{userWallet.balance_coins.toLocaleString('cs-CZ')}</span> miocoinů
                </p>
              </div>
              <Button 
                onClick={handleBuyClick}
                disabled={purchasing || userWallet.balance_coins < 1}
                size="lg"
                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white border-0"
              >
                {purchasing ? 'Uplatňuji...' : `Uplatnit ${userWallet.balance_coins >= 1 ? '1' : '0'} miocoinů`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paused Contest Section */}
      {contest.status === 'paused' && (
        <Card className="rounded-2xl overflow-hidden border-orange-500/20 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-1 text-neon-orange">Uplatnit miocoiny</h3>
                <p className="text-muted-foreground">
                  Cena: 1 miocoin | Váš zůstatek: <span className="text-neon-orange font-bold">{userWallet.balance_coins.toLocaleString('cs-CZ')}</span> miocoinů
                </p>
              </div>
              <Button 
                disabled
                size="lg"
                variant="outline"
                className="border-neon-orange text-neon-orange"
              >
                Soutěž je pozastavena
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* My Wins Section */}
      <Card className="rounded-2xl overflow-hidden border-primary/20 bg-gradient-to-br from-card/95 to-background/80 backdrop-blur-sm shadow-lg">
        <CardHeader>
          <CardTitle className="text-primary">Moje výhry</CardTitle>
        </CardHeader>
        <CardContent>
          {userWins.length > 0 ? (
            <div className="space-y-3">
              {userWins.map((win) => (
                <div key={win.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{win.description}</h4>
                    <Badge variant={win.type === 'main' ? 'default' : 'secondary'}>
                      {win.type === 'main' ? 'Hlavní cena' : 'Bonusová cena'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Stav: {win.status}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <p>Zatím žádné výhry.</p>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
};