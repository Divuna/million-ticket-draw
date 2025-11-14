import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface Message {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  sender: 'user' | 'admin';
  category: string | null;
  read: boolean;
  created_at: string;
}

export const useMessages = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = async () => {
    if (!user) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMessages((data || []) as Message[]);
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se načíst zprávy',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (content: string, title?: string) => {
    if (!user) {
      toast({
        title: 'Chyba',
        description: 'Musíte být přihlášeni',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const { error } = await supabase.from('messages').insert({
        user_id: user.id,
        content,
        title: title || null,
        sender: 'user',
      });

      if (error) throw error;

      toast({
        title: 'Úspěch',
        description: 'Zpráva byla odeslána',
      });

      await fetchMessages();
      return true;
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se odeslat zprávu',
        variant: 'destructive',
      });
      return false;
    }
  };

  const markAsRead = async (messageId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('messages')
        .update({ read: true })
        .eq('id', messageId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId ? { ...msg, read: true } : msg
        )
      );
    } catch (error: any) {
      console.error('Error marking message as read:', error);
    }
  };

  useEffect(() => {
    fetchMessages();

    // Real-time subscription
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user?.id]);

  return {
    messages,
    loading,
    sendMessage,
    markAsRead,
    refetch: fetchMessages,
  };
};
