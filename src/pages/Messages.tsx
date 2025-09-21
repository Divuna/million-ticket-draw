import React from 'react';
import { Header } from '@/components/Header';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle } from 'lucide-react';

const Messages: React.FC = () => {
  const { isAdmin } = useUserRole();
  
  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <MessageCircle className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-neon-orange">Zprávy</h1>
          </div>

          <Card className="ticket-message ticket-perforations">
            <CardHeader>
              <CardTitle className="text-neon-orange">Komunikace s administrátorem</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <MessageCircle className="h-16 w-16 text-neon-orange mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-neon-orange">Žádné zprávy</h3>
                <p className="text-muted-foreground">
                  Zde se zobrazí komunikace s administrátorem ohledně vašich výher a soutěží.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Messages;