import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from '@/hooks/use-toast';

export interface UserConversation {
  user_id: string;
  user_email: string;
  user_name: string | null;
  last_message_date: string;
  unread_count: number;
  last_message_content: string;
}

export interface ConversationMessage {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  sender: 'user' | 'admin';
  category: string | null;
  read: boolean;
  created_at: string;
}

export const useAdminMessages = () => {
  const { isAdmin } = useUserRole();
  const [conversations, setConversations] = useState<UserConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    if (!isAdmin) {
      console.log('⚠️ User is not admin, skipping conversation fetch');
      setConversations([]);
      setLoading(false);
      return;
    }

    console.log('📨 Admin: Fetching all conversations...');

    try {
      // Fetch all messages with user info
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('id, user_id, content, sender, read, created_at')
        .order('created_at', { ascending: false });

      if (messagesError) {
        console.error('❌ Error fetching messages:', messagesError);
        throw messagesError;
      }

      // Fetch user info
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, email, name');

      if (usersError) {
        console.error('❌ Error fetching users:', usersError);
        throw usersError;
      }

      console.log('✅ Loaded', messages?.length || 0, 'messages from', users?.length || 0, 'users');

      // Group messages by user_id
      const grouped = new Map<string, UserConversation>();

      messages?.forEach((msg) => {
        const user = users?.find((u) => u.id === msg.user_id);
        if (!user) return;

        if (!grouped.has(msg.user_id)) {
          grouped.set(msg.user_id, {
            user_id: msg.user_id,
            user_email: user.email,
            user_name: user.name,
            last_message_date: msg.created_at,
            unread_count: msg.sender === 'user' && !msg.read ? 1 : 0,
            last_message_content: msg.content,
          });
        } else {
          const conv = grouped.get(msg.user_id)!;
          if (msg.sender === 'user' && !msg.read) {
            conv.unread_count += 1;
          }
        }
      });

      const conversations = Array.from(grouped.values());
      console.log('✅ Grouped into', conversations.length, 'conversations');
      setConversations(conversations);
    } catch (error: any) {
      console.error('❌ Error in fetchConversations:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se načíst zprávy',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();

    if (!isAdmin) return;

    console.log('🔔 Admin: Setting up real-time subscription for all messages...');

    // Real-time subscription
    const channel = supabase
      .channel('admin-messages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          console.log('📬 Admin: Real-time message update:', payload);
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      console.log('🧹 Admin: Cleaning up messages subscription');
      channel.unsubscribe();
    };
  }, [isAdmin]);

  return {
    conversations,
    loading,
    refetch: fetchConversations,
  };
};

export const useAdminMessageThread = (userId: string | undefined) => {
  const { isAdmin } = useUserRole();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<{ email: string; name: string | null } | null>(null);

  const fetchThread = async () => {
    if (!isAdmin) {
      console.log('⚠️ User is not admin, skipping thread fetch');
      setMessages([]);
      setLoading(false);
      return;
    }

    if (!userId) {
      console.log('⚠️ No userId provided');
      setMessages([]);
      setLoading(false);
      return;
    }

    console.log('📨 Admin: Fetching thread for user:', userId);

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Error fetching thread:', error);
        throw error;
      }
      
      console.log('✅ Loaded', data?.length || 0, 'messages for thread');
      setMessages((data || []) as ConversationMessage[]);

      // Fetch user info
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('❌ Error fetching user info:', userError);
        throw userError;
      }
      
      console.log('✅ User info loaded:', user);
      setUserInfo(user);

      // Mark user messages as read
      const { error: updateError } = await supabase
        .from('messages')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('sender', 'user')
        .eq('read', false);
        
      if (updateError) {
        console.error('❌ Error marking messages as read:', updateError);
      } else {
        console.log('✅ Messages marked as read');
      }
    } catch (error: any) {
      console.error('❌ Error in fetchThread:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se načíst konverzaci',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const sendAdminReply = async (content: string, title?: string) => {
    if (!isAdmin || !userId) {
      console.error('❌ Cannot send reply: missing admin status or userId');
      toast({
        title: 'Chyba',
        description: 'Nejste oprávněni odesílat zprávy',
        variant: 'destructive',
      });
      return false;
    }

    console.log('📤 Admin: Sending reply to user:', userId);

    try {
      const { error } = await supabase.from('messages').insert({
        user_id: userId,
        content,
        title: title || null,
        sender: 'admin',
      });

      if (error) {
        console.error('❌ Error sending reply:', error);
        throw error;
      }

      console.log('✅ Reply sent successfully');
      
      toast({
        title: 'Úspěch',
        description: 'Odpověď byla odeslána',
      });

      await fetchThread();
      return true;
    } catch (error: any) {
      console.error('❌ Error in sendAdminReply:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se odeslat odpověď',
        variant: 'destructive',
      });
      return false;
    }
  };

  useEffect(() => {
    fetchThread();

    if (!isAdmin || !userId) return;

    console.log('🔔 Admin: Setting up real-time subscription for thread:', userId);

    // Real-time subscription
    const channel = supabase
      .channel(`admin-thread-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('📬 Admin: Real-time thread update:', payload);
          fetchThread();
        }
      )
      .subscribe();

    return () => {
      console.log('🧹 Admin: Cleaning up thread subscription');
      channel.unsubscribe();
    };
  }, [userId, isAdmin]);

  return {
    messages,
    loading,
    userInfo,
    sendAdminReply,
    refetch: fetchThread,
  };
};
