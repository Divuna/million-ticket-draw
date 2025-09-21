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
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-black text-transparent bg-gradient-to-r from-neon-orange via-orange-400 to-neon-orange bg-clip-text animate-pulse mb-4">
              ⚡ ZPRÁVY ⚡
            </h1>
            <p className="text-neon-orange/80 font-medium text-lg">Komunikace s administrací</p>
          </div>

          <div className="neon-ticket ticket-message ticket-perforations">
            {/* Ticket perforations */}
            <div className="absolute left-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
              {Array.from({length: 8}).map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-orange/50" />
              ))}
            </div>
            <div className="absolute right-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
              {Array.from({length: 8}).map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-orange/50" />
              ))}
            </div>
            
            <div className="relative z-10 p-8">
              <div className="text-center mb-6">
                <h3 className="text-3xl font-black text-transparent bg-gradient-to-r from-neon-orange via-orange-400 to-neon-orange bg-clip-text animate-pulse mb-4">
                  📧 KOMUNIKACE S ADMINISTRÁTOREM 📧
                </h3>
              </div>
              
              <div className="text-center py-12">
                <div className="mb-6">
                  <MessageCircle className="h-24 w-24 text-neon-orange mx-auto animate-pulse" />
                </div>
                <h4 className="text-2xl font-black text-neon-orange mb-4">📬 ŽÁDNÉ ZPRÁVY</h4>
                <p className="text-neon-orange/80 font-medium text-lg">
                  Zde se zobrazí komunikace s administrátorem ohledně vašich výher a soutěží.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Messages;