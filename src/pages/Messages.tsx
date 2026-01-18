import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Send, Sparkles } from "lucide-react";

interface Message {
  id: string;
  user_id: string;
  sender: "user" | "admin";
  content: string;
  read: boolean;
  created_at: string;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { sendMessageToAdmin, refetch } = useMessages();
  const { refresh: refreshUnreadCount } = useUnreadMessagesCount();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Mark admin messages as read
  const markAdminMessagesAsRead = async () => {
    if (!user) return;
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("sender", "admin")
      .eq("read", false);
  };

  // LOAD MESSAGES
  useEffect(() => {
    const loadMessages = async () => {
      if (!user) return;
      setLoading(true);

      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      setMessages(data || []);
      setLoading(false);
    };

    const initMessages = async () => {
      await loadMessages();
      // Mark admin messages as read only on initial page load
      await markAdminMessagesAsRead();
      // Immediately refresh the unread badge
      refreshUnreadCount();
    };

    initMessages();

    const channel = supabase
      .channel("messages-user-thread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${user?.id}` },
        () => loadMessages(),
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  // SEND
  const handleSend = async () => {
    if (!newMessage.trim()) return;

    setLoading(true);
    const ok = await sendMessageToAdmin(newMessage);

    if (ok) {
      setNewMessage("");
      await refetch();
      toast({ title: "Odesláno" });
    } else {
      toast({ title: "Chyba", description: "Odeslání selhalo", variant: "destructive" });
    }

    setLoading(false);
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(220,20%,4%)] via-[hsl(220,25%,6%)] to-[hsl(220,20%,4%)] relative overflow-hidden">
      {/* Premium floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full opacity-20"
            style={{
              background: `radial-gradient(circle, hsl(45, 93%, ${50 + Math.random() * 20}%) 0%, transparent 70%)`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${8 + Math.random() * 12}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      {/* Premium shimmer overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          background: 'linear-gradient(45deg, transparent 30%, hsl(45, 93%, 60%) 50%, transparent 70%)',
          backgroundSize: '200% 200%',
          animation: 'shimmer 8s ease-in-out infinite',
        }}
      />

      <div className="relative z-10 flex flex-col h-[calc(100vh-80px)] max-w-4xl mx-auto">
        {/* Premium Header */}
        <div className="p-6 pb-4">
          <div 
            className="relative overflow-hidden rounded-2xl p-6"
            style={{
              background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
              border: '1px solid hsl(45, 70%, 40%, 0.2)',
              boxShadow: '0 8px 32px hsl(0, 0%, 0%, 0.4), inset 0 1px 0 hsl(45, 70%, 50%, 0.1)',
            }}
          >
            {/* Header shimmer */}
            <div 
              className="absolute inset-0 opacity-10"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, hsl(45, 93%, 60%) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 4s ease-in-out infinite',
              }}
            />
            
            <div className="relative flex items-center gap-4">
              <div 
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, hsl(45, 80%, 45%) 0%, hsl(35, 90%, 35%) 100%)',
                  boxShadow: '0 4px 20px hsl(45, 80%, 40%, 0.3)',
                }}
              >
                <MessageCircle className="w-7 h-7 text-black" />
              </div>
              
              <div className="flex-1">
                <h1 
                  className="text-2xl font-bold tracking-tight"
                  style={{
                    background: 'linear-gradient(135deg, hsl(45, 93%, 65%) 0%, hsl(35, 90%, 55%) 50%, hsl(45, 93%, 65%) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  Zprávy
                </h1>
                <p className="text-sm text-gray-400 mt-1">
                  Komunikace s podporou
                </p>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(45,80%,45%)]/10 border border-[hsl(45,70%,50%)]/20">
                <Sparkles className="w-4 h-4 text-[hsl(45,80%,55%)]" />
                <span className="text-xs font-medium text-[hsl(45,80%,60%)]">
                  {messages.length} zpráv
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Messages Container */}
        <div 
          ref={scrollRef} 
          className="flex-1 overflow-y-auto px-6 pb-4 space-y-4"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'hsl(45, 70%, 40%, 0.3) transparent',
          }}
        >
          {messages.length === 0 && !loading && (
            <div 
              className="flex flex-col items-center justify-center h-full text-center py-12"
              style={{ animation: 'fade-in 0.5s ease-out' }}
            >
              <div 
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                style={{
                  background: 'linear-gradient(135deg, hsl(220, 25%, 12%) 0%, hsl(220, 30%, 16%) 100%)',
                  border: '1px solid hsl(45, 70%, 40%, 0.15)',
                }}
              >
                <MessageCircle className="w-10 h-10 text-[hsl(45,70%,50%)]/40" />
              </div>
              <p className="text-gray-400 text-lg font-medium">Zatím žádné zprávy</p>
              <p className="text-gray-500 text-sm mt-2">Napište nám vaši první zprávu</p>
            </div>
          )}

          {messages.map((msg, index) => {
            const isSystemMessage = msg.content.includes("🎉") || msg.content.includes("zákonný zástupce");
            const isUserMessage = msg.sender === "user";
            
            return (
              <div
                key={msg.id}
                className={`flex ${isUserMessage ? "justify-end" : "justify-start"}`}
                style={{
                  animation: `fade-in 0.3s ease-out`,
                  animationDelay: `${index * 0.05}s`,
                  animationFillMode: 'both',
                }}
              >
                <div
                  className={`max-w-[75%] relative overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:scale-[1.01]`}
                  style={
                    isUserMessage
                      ? {
                          background: 'linear-gradient(135deg, hsl(45, 80%, 40%) 0%, hsl(35, 85%, 35%) 100%)',
                          boxShadow: '0 4px 20px hsl(45, 80%, 40%, 0.25)',
                          border: '1px solid hsl(45, 70%, 50%, 0.3)',
                        }
                      : isSystemMessage
                        ? {
                            background: 'linear-gradient(135deg, hsl(35, 50%, 15%) 0%, hsl(30, 45%, 12%) 100%)',
                            border: '1px solid hsl(35, 60%, 40%, 0.3)',
                            boxShadow: '0 4px 16px hsl(0, 0%, 0%, 0.3)',
                          }
                        : {
                            background: 'linear-gradient(135deg, hsl(220, 25%, 12%) 0%, hsl(220, 30%, 15%) 100%)',
                            border: '1px solid hsl(220, 20%, 25%, 0.5)',
                            boxShadow: '0 4px 16px hsl(0, 0%, 0%, 0.3)',
                          }
                  }
                >
                  {/* Message shimmer for user messages */}
                  {isUserMessage && (
                    <div 
                      className="absolute inset-0 opacity-20"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, hsl(45, 93%, 70%) 50%, transparent 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 3s ease-in-out infinite',
                      }}
                    />
                  )}

                  {isSystemMessage && !isUserMessage && (
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-[hsl(35,70%,55%)]" />
                      <span 
                        className="text-xs font-semibold"
                        style={{
                          background: 'linear-gradient(90deg, hsl(35, 70%, 55%) 0%, hsl(45, 80%, 60%) 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}
                      >
                        Systémová zpráva
                      </span>
                    </div>
                  )}
                  
                  <p 
                    className={`relative z-10 text-[15px] leading-relaxed ${
                      isUserMessage ? "text-black font-medium" : "text-gray-100"
                    }`}
                  >
                    {msg.content}
                  </p>
                  
                  <p 
                    className={`relative z-10 text-xs mt-2 ${
                      isUserMessage ? "text-black/60" : "text-gray-500"
                    }`}
                  >
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
          })}
        </div>

        {/* Premium Input Bar */}
        <div className="p-6 pt-4">
          <div 
            className="relative overflow-hidden rounded-2xl p-4"
            style={{
              background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
              border: '1px solid hsl(45, 70%, 40%, 0.2)',
              boxShadow: '0 -8px 32px hsl(0, 0%, 0%, 0.3), inset 0 1px 0 hsl(45, 70%, 50%, 0.1)',
            }}
          >
            {/* Input shimmer */}
            <div 
              className="absolute inset-0 opacity-5"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, hsl(45, 93%, 60%) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 6s ease-in-out infinite',
              }}
            />

            <div className="relative flex items-center gap-3">
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Napište zprávu..."
                className="flex-1 bg-[hsl(220,25%,10%)] text-gray-100 p-4 rounded-xl border border-[hsl(220,20%,20%)] focus:border-[hsl(45,70%,50%)]/50 focus:ring-2 focus:ring-[hsl(45,70%,50%)]/20 transition-all duration-300 placeholder:text-gray-500 text-[15px]"
                style={{
                  boxShadow: 'inset 0 2px 4px hsl(0, 0%, 0%, 0.2)',
                }}
              />
              
              <button
                onClick={handleSend}
                disabled={loading || !newMessage.trim()}
                className="relative overflow-hidden p-4 rounded-xl transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                style={{
                  background: newMessage.trim() 
                    ? 'linear-gradient(135deg, hsl(45, 80%, 45%) 0%, hsl(35, 90%, 35%) 100%)'
                    : 'linear-gradient(135deg, hsl(220, 25%, 15%) 0%, hsl(220, 30%, 20%) 100%)',
                  boxShadow: newMessage.trim() 
                    ? '0 4px 20px hsl(45, 80%, 40%, 0.4)'
                    : 'none',
                  border: newMessage.trim() 
                    ? '1px solid hsl(45, 70%, 50%, 0.3)'
                    : '1px solid hsl(220, 20%, 25%)',
                }}
              >
                {/* Button shimmer */}
                {newMessage.trim() && (
                  <div 
                    className="absolute inset-0 opacity-30"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, hsl(45, 93%, 70%) 50%, transparent 100%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 2s ease-in-out infinite',
                    }}
                  />
                )}
                <Send className={`w-5 h-5 relative z-10 ${newMessage.trim() ? 'text-black' : 'text-gray-500'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Global animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.2; }
          25% { transform: translateY(-20px) translateX(10px); opacity: 0.4; }
          50% { transform: translateY(-10px) translateX(-5px); opacity: 0.2; }
          75% { transform: translateY(-30px) translateX(15px); opacity: 0.3; }
        }
        
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
