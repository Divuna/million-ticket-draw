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
      <Card className="ticket-contest ticket-perforations">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-3xl text-neon-purple">{contest.title}</CardTitle>
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
      <Card className="ticket-game ticket-perforations">
        <CardHeader>
          <CardTitle className="text-neon-green">Hlavní cena</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-6 bg-gradient-to-r from-neon-green/5 to-neon-cyan/5 rounded-lg border border-neon-green/20">
            <h3 className="text-2xl font-bold text-neon-green mb-2">
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
        <Card className="ticket-message ticket-perforations border-red-500 bg-red-50 dark:bg-red-900/20">
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
        <Card className="ticket-profile ticket-perforations bg-green-50 dark:bg-green-900/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-1 text-neon-cyan">Uplatnit miocoiny</h3>
                <p className="text-muted-foreground">
                  Cena: 1 miocoin | Váš zůstatek: <span className="text-neon-cyan font-bold">{userWallet.balance_coins.toLocaleString('cs-CZ')}</span> miocoinů
                </p>
              </div>
              <Button 
                onClick={handleBuyClick}
                disabled={purchasing || userWallet.balance_coins < 1}
                size="lg"
                className="bg-gradient-to-r from-neon-cyan to-neon-green hover:from-neon-cyan/80 hover:to-neon-green/80 text-white border-0"
              >
                {purchasing ? 'Uplatňuji...' : `Uplatnit ${userWallet.balance_coins >= 1 ? '1' : '0'} miocoinů`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paused Contest Section */}
      {contest.status === 'paused' && (
        <Card className="ticket-message ticket-perforations bg-yellow-50 dark:bg-yellow-900/20">
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
      {/* Bonus Prizes Section */}
      <Card className="ticket-voucher ticket-perforations">
        <CardHeader>
          <CardTitle className="text-neon-pink">Dostupné bonusové ceny</CardTitle>
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

      {/* Ticket Map Section */}
      <TicketMap
        contestId={contest.id}
        contestTitle={contest.title}
        ticketCount={contest.ticket_count}
        ticketPrice={contest.ticket_price}
      />

      {/* My Wins Section */}
      <Card className="ticket-profile ticket-perforations">
        <CardHeader>
          <CardTitle className="text-neon-cyan">Moje výhry</CardTitle>
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