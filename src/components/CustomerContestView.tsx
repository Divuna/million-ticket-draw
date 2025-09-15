import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

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

interface CustomerContestViewProps {
  contest: Contest;
  bonusPrizes: BonusPrize[];
  userWallet: UserWallet;
  purchasing: boolean;
  onBuyTicket: () => void;
}

export const CustomerContestView: React.FC<CustomerContestViewProps> = ({
  contest,
  bonusPrizes,
  userWallet,
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
              variant={contest.status === 'active' ? 'default' : 'secondary'}
              className="text-sm"
            >
              {contest.status === 'active' ? 'Aktivní' : 
               contest.status === 'draft' ? 'Koncept' : 'Uzavřena'}
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

    </div>
  );
};