import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageForm } from '@/components/MessageForm';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Calendar, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Message {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  sender: 'user' | 'admin';
  category: string | null;
  read: boolean;
  created_at: string;
}

const MessageDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMessage = async () => {
      if (!id || !user) return;

      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();

        if (error) throw error;
        
        setMessage(data as Message);

        // Mark as read
        if (data && !data.read) {
          await supabase
            .from('messages')
            .update({ read: true })
            .eq('id', id)
            .eq('user_id', user.id);
        }
      } catch (error: any) {
        console.error('Error fetching message:', error);
        toast({
          title: 'Chyba',
          description: 'Zpráva nebyla nalezena',
          variant: 'destructive',
        });
        navigate('/messages');
      } finally {
        setLoading(false);
      }
    };

    fetchMessage();
  }, [id, user, navigate]);

  const handleReply = async (content: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase.from('messages').insert({
        user_id: user.id,
        content,
        title: message?.title ? `Re: ${message.title}` : null,
        sender: 'user',
        category: message?.category,
      });

      if (error) throw error;

      toast({
        title: 'Úspěch',
        description: 'Odpověď byla odeslána',
      });

      return true;
    } catch (error: any) {
      console.error('Error sending reply:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se odeslat odpověď',
        variant: 'destructive',
      });
      return false;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Načítání...</p>
          </div>
        </div>
        {isAdmin ? <AdminMenu /> : <BottomNavigation />}
      </div>
    );
  }

  if (!message) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/messages')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zpět na zprávy
          </Button>

          <Card className="ticket-message ticket-perforations">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-neon-orange text-2xl">
                    {message.title || 'Zpráva bez předmětu'}
                  </CardTitle>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      <span>
                        {message.sender === 'admin' ? 'Administrátor' : 'Já'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(message.created_at).toLocaleString('cs-CZ')}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge variant={message.sender === 'admin' ? 'default' : 'secondary'}>
                  {message.sender === 'admin' ? 'Administrátor' : 'Uživatel'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap text-foreground">
                  {message.content}
                </p>
              </div>
            </CardContent>
          </Card>

          <MessageForm 
            onSend={handleReply}
            placeholder="Napište odpověď..."
            showTitle={false}
          />
        </div>
      </div>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default MessageDetail;
