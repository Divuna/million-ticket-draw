import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { TicketMap } from '@/components/TicketMap';

interface Contest {
  id: string;
  title: string;
  description: string;
  main_prize: string;
  main_prize_secondary_image?: string | null;
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

interface AdminContestViewProps {
  contest: Contest;
  bonusPrizes: BonusPrize[];
  currentTickets: number;
  userWallet: UserWallet;
  purchasing: boolean;
  onBuyTicket: () => void;
}

export const AdminContestView: React.FC<AdminContestViewProps> = ({
  contest,
  bonusPrizes,
  currentTickets,
  userWallet,
  purchasing,
  onBuyTicket
}) => {
  const progressPercentage = (currentTickets / contest.ticket_count) * 100;

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
              <CardDescription className="mt-2 text-lg">
                {contest.description}
              </CardDescription>
            </div>
            <Badge 
              variant={contest.status === 'active' ? 'default' : 'secondary'}
              className="text-sm"
            >
              {contest.status === 'active' ? 'Aktivní' : 
               contest.status === 'draft' ? 'Koncept' : 'Uzavřena'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Admin Badge */}
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center">
            <Badge variant="secondary" className="bg-yellow-200 text-yellow-800">
              🔧 Administrátorský pohled
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Main Prize - Full details for admin */}
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
              Tiket #{contest.ticket_count.toLocaleString('cs-CZ')}
            </p>
            {contest.main_prize_secondary_image && (
              <img 
                src={contest.main_prize_secondary_image} 
                alt="Doplňková fotka hlavní výhry"
                className="mt-4 mx-auto max-w-full h-auto rounded-lg"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ticket Progress - Admin only */}
      <Card>
        <CardHeader>
          <CardTitle>Pokrok prodeje tiketů</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Prodáno: {currentTickets.toLocaleString('cs-CZ')}</span>
              <span>Celkem: {contest.ticket_count.toLocaleString('cs-CZ')}</span>
            </div>
            <Progress value={progressPercentage} className="h-3" />
            <p className="text-center text-lg font-semibold">
              {progressPercentage.toFixed(1)}% dokončeno
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bonus Prizes - Full details with ticket positions for admin */}
      {bonusPrizes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bonusové ceny (Admin pohled)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {bonusPrizes.map((prize) => (
                <div key={prize.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold">{prize.description}</h4>
                    <div className="flex gap-2">
                      <Badge variant="outline">
                        #{prize.ticket_position.toLocaleString('cs-CZ')}
                      </Badge>
                      <Badge variant={prize.status === 'won' ? 'destructive' : 'secondary'}>
                        {prize.status === 'won' ? 'Vyhrána' : 'Dostupná'}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Tiket #{prize.ticket_position.toLocaleString('cs-CZ')} - Status: {prize.status}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ticket Map Section */}
      <TicketMap
        contestId={contest.id}
        contestTitle={contest.title}
        ticketCount={contest.ticket_count}
        ticketPrice={contest.ticket_price}
      />

      {/* Purchase Section */}
      {contest.status === 'active' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold mb-1">Uplatnit miocoiny (Admin test)</h3>
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

    </div>
  );
};