import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

interface Contest {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  ticket_price: number;
  status: string;
  ticket_count: number;
  created_at: string;
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
      
      {/* Contest Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-3xl">{contest.title}</CardTitle>
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
      <Card>
        <CardHeader>
          <CardTitle>Hlavní cena</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-6 bg-primary/5 rounded-lg">
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
        <Card className="border-red-500 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-bold text-red-700 mb-2">Uzavřená – výhra padla</h3>
              <p className="text-red-600">Tato soutěž byla ukončena a výherci byli určeni.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Purchase Section */}
      {contest.status === 'active' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-1">Uplatnit miocoiny</h3>
                <p className="text-muted-foreground">
                  Cena: 1 miocoin | Váš zůstatek: {userWallet.balance_coins.toLocaleString('cs-CZ')} miocoinů
                </p>
              </div>
              <Button 
                onClick={handleBuyClick}
                disabled={purchasing || userWallet.balance_coins < 1}
                size="lg"
              >
                {purchasing ? 'Uplatňuji...' : `Uplatnit ${userWallet.balance_coins >= 1 ? '1' : '0'} miocoinů`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paused Contest Section */}
      {contest.status === 'paused' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-1">Uplatnit miocoiny</h3>
                <p className="text-muted-foreground">
                  Cena: 1 miocoin | Váš zůstatek: {userWallet.balance_coins.toLocaleString('cs-CZ')} miocoinů
                </p>
              </div>
              <Button 
                disabled
                size="lg"
                variant="outline"
              >
                Soutěž je pozastavena
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Bonus Prizes Section */}
      <Card>
        <CardHeader>
          <CardTitle>Dostupné bonusové ceny</CardTitle>
        </CardHeader>
        <CardContent>
          {bonusPrizes && bonusPrizes.filter(p => p.status === 'pending').length > 0 ? (
            <div className="space-y-2">
              {(() => {
                // Group bonus prizes by description and count them
                const grouped = bonusPrizes
                  .filter(p => p.status === 'pending')
                  .reduce((acc, prize) => {
                    acc[prize.description] = (acc[prize.description] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);

                return Object.entries(grouped).map(([description, count]) => (
                  <div key={description} className="py-2 border-b last:border-0">
                    <p className="font-medium">{description} – {count}×</p>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <p className="text-muted-foreground">Žádné dostupné bonusové ceny.</p>
          )}
        </CardContent>
      </Card>

      {/* My Wins Section */}
      <Card>
        <CardHeader>
          <CardTitle>Moje výhry</CardTitle>
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