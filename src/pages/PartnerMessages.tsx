/**
 * Partner Messages — B2B SaaS-style messaging UI.
 * Partners can send messages to admin and receive replies.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MessageCircle, Send, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface Message {
  id: string;
  user_id: string;
  sender: "user" | "admin";
  content: string;
  read: boolean;
  created_at: string;
}

export default function PartnerMessages() {
  const [user, setUser] = useState<{ id: string } | null>(null);
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

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user ? { id: data.user.id } : null);
    };
    getUser();
  }, []);

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
    if (!user) return;
    const init = async () => {
      await loadMessages();
      await markAsRead();
    };
    init();

    const channel = supabase
      .channel("partner-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` },
        () => loadMessages()
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [user]);

  const handleSend = async () => {
    if (!newMessage.trim() || isSending || !user) return;
    setIsSending(true);

    const { error } = await supabase.from("messages").insert({
      user_id: user.id,
      sender: "user",
      content: newMessage.trim(),
      read: false,
    });

    if (error) {
      toast({ title: "Chyba", description: "Nepodařilo se odeslat zprávu", variant: "destructive" });
    } else {
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
    <div className="min-h-screen" style={{ background: "#0F172A" }}>
      <div className="flex flex-col h-[calc(100vh-60px)] max-w-3xl mx-auto">
        {/* Header */}
        <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(148,163,184,0.15)" }}>
          <div className="flex items-center gap-3">
            <Link to="/partner/dashboard">
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-white/5"
                style={{ color: "#94A3B8" }}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3 flex-1">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(59,130,246,0.12)" }}
              >
                <MessageCircle className="w-4.5 h-4.5" style={{ color: "#3B82F6" }} />
              </div>
              <div>
                <h1 className="text-base font-semibold" style={{ color: "#F1F5F9" }}>
                  Zprávy pro podporu
                </h1>
                <p className="text-xs" style={{ color: "#64748B" }}>
                  Komunikace s týmem OneMil
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {loading && messages.length === 0 ? (
            <p className="mt-10 text-center text-sm" style={{ color: "#64748B" }}>
              Načítání zpráv…
            </p>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "rgba(148,163,184,0.08)" }}
              >
                <MessageCircle className="w-7 h-7" style={{ color: "#475569" }} />
              </div>
              <p className="text-sm font-medium" style={{ color: "#CBD5E1" }}>
                Zatím žádné zprávy
              </p>
              <p className="text-xs mt-1" style={{ color: "#64748B" }}>
                Napište nám vaši první zprávu
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[75%] rounded-xl px-4 py-3"
                    style={
                      isUser
                        ? { background: "#1E3A5F", color: "#E2E8F0" }
                        : { background: "#1E293B", color: "#CBD5E1", border: "1px solid rgba(148,163,184,0.1)" }
                    }
                  >
                    <p className="text-[14px] leading-relaxed">{msg.content}</p>
                    <p
                      className="text-[11px] mt-1.5 text-right"
                      style={{ color: isUser ? "rgba(148,163,184,0.6)" : "rgba(100,116,139,0.7)" }}
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
            })
          )}
        </div>

        {/* Input */}
        <div className="px-6 py-4" style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}>
          <div className="flex items-center gap-3">
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Napište zprávu..."
              disabled={isSending}
              className="flex-1 text-sm rounded-lg px-4 py-3 outline-none transition-colors disabled:opacity-50"
              style={{
                background: "#1E293B",
                color: "#E2E8F0",
                border: "1px solid rgba(148,163,184,0.15)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(148,163,184,0.15)")}
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim() || isSending}
              className="rounded-lg px-4 py-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: "#3B82F6", color: "#FFFFFF" }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
