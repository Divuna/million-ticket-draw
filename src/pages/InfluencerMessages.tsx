/**
 * Influencer Messages — reuses the same messages table as players.
 * Influencers can send messages to admin and receive replies.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MessageCircle, Send, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { AI_ASSISTANT_BOB_LABEL } from "@/constants/messagesUi";

interface Message {
  id: string;
  user_id: string;
  sender: "user" | "admin";
  content: string;
  read: boolean;
  created_at: string;
}

export default function InfluencerMessages() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    setMessages(data || []);
    setLoading(false);
  }, [user]);

  // Mark admin messages as read
  const markAsRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("sender", "admin")
      .eq("read", false);
  }, [user]);

  useEffect(() => {
    const init = async () => {
      await loadMessages();
      await markAsRead();
    };
    init();

    const channel = supabase
      .channel("influencer-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${user?.id}` },
        () => loadMessages()
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [user]);

  const handleSend = async () => {
    if (!newMessage.trim() || isSending || !user) return;
    setIsSending(true);

    const { data: insertedMessage, error } = await supabase
      .from("messages")
      .insert({
        user_id: user.id,
        sender: "user",
        content: newMessage.trim(),
        read: false,
      })
      .select("id,user_id,content")
      .single();

    if (error) {
      toast({ title: "Chyba", description: "Nepodařilo se odeslat zprávu", variant: "destructive" });
    } else {
      // AI reply: DB trigger invokes Edge Function ai-chat; no event_queue / Sofinity.
      setNewMessage("");
      await loadMessages();
    }
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(220,20%,4%)] via-[hsl(220,25%,6%)] to-[hsl(220,20%,4%)]">
      <div className="flex flex-col h-[100vh] max-w-3xl mx-auto">
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <Link to="/influencer/dashboard">
              <Button variant="ghost" size="icon" className="text-[hsl(var(--text-muted-gray))] hover:text-[hsl(var(--text-silver))]">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div
              className="relative overflow-hidden rounded-2xl p-5 flex-1"
              style={{
                background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
                border: '1px solid hsl(45, 70%, 40%, 0.2)',
                boxShadow: '0 8px 32px hsl(0, 0%, 0%, 0.4), inset 0 1px 0 hsl(45, 70%, 50%, 0.1)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, hsl(45, 80%, 45%) 0%, hsl(35, 90%, 35%) 100%)',
                    boxShadow: '0 4px 20px hsl(45, 80%, 40%, 0.3)',
                  }}
                >
                  <MessageCircle className="w-5 h-5 text-black" />
                </div>
                <div>
                  <h1
                    className="text-xl font-bold"
                    style={{
                      background: 'linear-gradient(135deg, hsl(45, 93%, 65%) 0%, hsl(35, 90%, 55%) 50%, hsl(45, 93%, 65%) 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    Zprávy pro podporu
                  </h1>
                  <p className="text-xs text-gray-400">Komunikace s týmem OneMil</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-4 space-y-3">
          {loading && messages.length === 0 ? (
            <p className="text-gray-500 mt-10 text-center">Načítání zpráv…</p>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{
                  background: 'linear-gradient(135deg, hsl(220, 25%, 12%) 0%, hsl(220, 30%, 16%) 100%)',
                  border: '1px solid hsl(45, 70%, 40%, 0.15)',
                }}
              >
                <MessageCircle className="w-8 h-8 text-[hsl(45,70%,50%)]/40" />
              </div>
              <p className="text-gray-400 text-base font-medium">Zatím žádné zprávy</p>
              <p className="text-gray-500 text-sm mt-1">Napište nám vaši první zprávu</p>
            </div>
          ) : (
            messages.map((msg) => {
                  const isUser = msg.sender === "user";
                  const isAi = msg.sender === "ai";
                  return (
                    <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div
                        className="max-w-[75%] rounded-2xl p-4 transition-all duration-300"
                        style={
                          isUser
                            ? {
                                background: 'linear-gradient(135deg, hsl(45, 80%, 40%) 0%, hsl(35, 85%, 35%) 100%)',
                                boxShadow: '0 4px 20px hsl(45, 80%, 40%, 0.25)',
                                border: '1px solid hsl(45, 70%, 50%, 0.3)',
                              }
                            : isAi
                              ? {
                                  background: 'linear-gradient(135deg, #5B3DF5 0%, #7A5CFF 100%)',
                                  border: '1px solid rgba(122, 92, 255, 0.8)',
                                  boxShadow: '0 6px 30px rgba(122, 92, 255, 0.6)',
                                }
                              : {
                                  background: 'linear-gradient(135deg, hsl(220, 25%, 12%) 0%, hsl(220, 30%, 15%) 100%)',
                                  border: '1px solid hsl(220, 20%, 25%, 0.5)',
                                  boxShadow: '0 4px 16px hsl(0, 0%, 0%, 0.3)',
                                }
                        }
                      >
                    {isAi && (
                      <p className="text-xs font-medium text-white/70 mb-1">{AI_ASSISTANT_BOB_LABEL}</p>
                    )}
                    <p className={`text-[15px] leading-relaxed ${isUser ? "text-black font-medium" : "text-white"}`}>
                      {msg.content}
                    </p>
                    <p className={`text-xs mt-2 ${isUser ? "text-black/60" : "text-white/50"}`}>
                      {new Date(msg.created_at).toLocaleString("cs-CZ", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input */}
        <div className="p-6 pt-4">
          <div
            className="relative overflow-hidden rounded-2xl p-4"
            style={{
              background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
              border: '1px solid hsl(45, 70%, 40%, 0.2)',
              boxShadow: '0 -8px 32px hsl(0, 0%, 0%, 0.3), inset 0 1px 0 hsl(45, 70%, 50%, 0.1)',
            }}
          >
            <div className="relative flex items-center gap-3">
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Napište zprávu..."
                disabled={isSending}
                className="flex-1 bg-[hsl(220,25%,10%)] text-gray-100 p-4 rounded-xl border border-[hsl(220,20%,20%)] focus:border-[hsl(45,70%,50%)]/50 focus:ring-2 focus:ring-[hsl(45,70%,50%)]/20 transition-all duration-300 placeholder:text-gray-500 text-[15px] disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!newMessage.trim() || isSending}
                className="p-4 rounded-xl transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                style={{
                  background: newMessage.trim()
                    ? 'linear-gradient(135deg, hsl(45, 80%, 45%) 0%, hsl(35, 90%, 35%) 100%)'
                    : 'linear-gradient(135deg, hsl(220, 25%, 15%) 0%, hsl(220, 30%, 20%) 100%)',
                  boxShadow: newMessage.trim() ? '0 4px 20px hsl(45, 80%, 40%, 0.4)' : 'none',
                  border: newMessage.trim()
                    ? '1px solid hsl(45, 70%, 50%, 0.3)'
                    : '1px solid hsl(220, 20%, 25%)',
                }}
              >
                <Send className={`w-5 h-5 ${newMessage.trim() ? "text-black" : "text-gray-500"}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
