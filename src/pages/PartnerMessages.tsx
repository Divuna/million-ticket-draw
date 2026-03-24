/**
 * Partner Messages — B2B SaaS-style messaging UI.
 * Partners can send messages to admin and receive replies.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MessageCircle, Send, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Back navigation */}
        <div className="flex items-center gap-3">
          <Link to="/partner/dashboard">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[hsl(var(--text-silver))]">Zprávy pro podporu</h1>
            <p className="text-sm text-[hsl(var(--text-muted-gray))]">Komunikace s týmem OneMil</p>
          </div>
        </div>

        {/* Messages Card */}
        <Card className="border-[hsl(var(--neon-gold)/0.15)] hover:border-[hsl(var(--neon-gold)/0.25)] transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-[hsl(var(--text-silver))]">
              <MessageCircle className="w-4.5 h-4.5 text-[hsl(var(--neon-gold))]" />
              Konverzace
            </CardTitle>
            <CardDescription>Vaše zprávy s administrací</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* Messages area */}
            <div
              ref={scrollRef}
              className="h-[calc(100vh-380px)] min-h-[300px] overflow-y-auto px-6 py-5 space-y-3 border-t border-border/40"
            >
              {loading && messages.length === 0 ? (
                <p className="mt-10 text-center text-sm text-muted-foreground">
                  Načítání zpráv…
                </p>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 bg-muted/50">
                    <MessageCircle className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Zatím žádné zprávy
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    Napište nám vaši první zprávu
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.sender === "user";
                  return (
                    <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-xl px-4 py-3 ${
                          isUser
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground border border-border/40"
                        }`}
                      >
                        <p className="text-[14px] leading-relaxed">{msg.content}</p>
                        <p
                          className={`text-[11px] mt-1.5 text-right ${
                            isUser ? "text-primary-foreground/60" : "text-muted-foreground"
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
                })
              )}
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t border-border/40">
              <div className="flex items-center gap-3">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Napište zprávu..."
                  disabled={isSending}
                  className="flex-1 text-sm rounded-lg px-4 py-3 outline-none transition-colors disabled:opacity-50 bg-muted text-foreground border border-border/40 focus:border-primary/50"
                />
                <Button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || isSending}
                  size="icon"
                  className="h-[46px] w-[46px] rounded-lg"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
