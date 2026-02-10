import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Star, Building2, User, ArrowLeft, Mail } from "lucide-react";

interface Message {
  id: string;
  user_id: string;
  sender: "user" | "admin";
  content: string;
  created_at: string;
  read: boolean;
}

interface ContactInfo {
  name: string | null;
  email: string | null;
  role: "user" | "influencer" | "partner";
}

export default function AdminMessageThread() {
  const { userId } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    if (!userId) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    // Filter out automatic winner messages in admin view
    const filtered = (data || []).filter(
      (msg) => !msg.content.includes("Gratulujeme k výhře")
    );
    setMessages(filtered);

    // Mark all user messages as read
    await supabase.from("messages").update({ read: true }).eq("user_id", userId).eq("sender", "user").eq("read", false);

    setLoading(false);
  };

  // Resolve contact identity
  const loadContactInfo = async () => {
    if (!userId) return;

    const [userRes, partnerRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, email, name, first_name, last_name")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("partners")
        .select("auth_user_id, name, contact_email, notes, status")
        .eq("auth_user_id", userId)
        .maybeSingle(),
    ]);

    const user = userRes.data;
    const partner = partnerRes.data;

    // Determine role
    let role: "user" | "influencer" | "partner" = "user";
    if (partner) {
      role = partner.notes?.toLowerCase().includes("influencer") ? "influencer" : "partner";
    }

    // Resolve name: user first/last > user name > partner name
    const userName = user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : user?.name || null;
    const name = userName || partner?.name || null;
    const email = user?.email || partner?.contact_email || null;

    setContactInfo({ name, email, role });
  };

  useEffect(() => {
    loadMessages();
    loadContactInfo();

    const channel = supabase
      .channel("admin-thread")
      .on("postgres_changes", { event: "*", table: "messages", schema: "public", filter: `user_id=eq.${userId}` }, () =>
        loadMessages(),
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    const { error } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "admin",
      content: newMessage.trim(),
      read: false,
      topic: "support",
      extension: "onemil",
      payload: {},
      event: "admin_reply",
      private: false,
    });

    if (error) {
      toast({
        title: "Chyba",
        description: "Zprávu nelze odeslat",
        variant: "destructive",
      });
      return;
    }

    setNewMessage("");
    loadMessages();
  };

  const getRoleBadge = () => {
    if (!contactInfo) return null;
    switch (contactInfo.role) {
      case "influencer":
        return (
          <Badge className="bg-[hsl(280,50%,45%)] text-white border-[hsl(280,60%,55%,0.3)] text-[10px] uppercase tracking-wider gap-1">
            <Star className="w-3 h-3" />
            Influencer
          </Badge>
        );
      case "partner":
        return (
          <Badge className="bg-[hsl(200,60%,40%)] text-white border-[hsl(200,70%,50%,0.3)] text-[10px] uppercase tracking-wider gap-1">
            <Building2 className="w-3 h-3" />
            Partner
          </Badge>
        );
      default:
        return (
          <Badge className="bg-[hsl(220,30%,30%)] text-white border-[hsl(220,30%,40%,0.3)] text-[10px] uppercase tracking-wider gap-1">
            <User className="w-3 h-3" />
            Uživatel
          </Badge>
        );
    }
  };

  const getRoleLabel = () => {
    if (!contactInfo) return "";
    switch (contactInfo.role) {
      case "influencer": return "influencerem";
      case "partner": return "partnerem";
      default: return "uživatelem";
    }
  };

  return (
    <div className="flex flex-col h-[100vh] bg-[hsl(220,20%,4%)] p-4 pb-24">
      {/* Conversation header */}
      <div className="mb-4 rounded-2xl p-4" style={{
        background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
        border: contactInfo?.role === "influencer"
          ? '1px solid hsl(280, 60%, 50%, 0.3)'
          : contactInfo?.role === "partner"
            ? '1px solid hsl(200, 60%, 45%, 0.3)'
            : '1px solid hsl(220, 20%, 25%, 0.3)',
        boxShadow: '0 4px 16px hsl(0, 0%, 0%, 0.3)',
      }}>
        <div className="flex items-center gap-3">
          <Link to="/admin/messages" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Konverzace s {getRoleLabel()}</span>
              {getRoleBadge()}
            </div>
            <p className="text-foreground font-semibold text-base mt-1 truncate">
              {contactInfo?.name || `${userId?.slice(0, 8)}…`}
            </p>
            {contactInfo?.email && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">{contactInfo.email}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div ref={scrollRef} className="flex flex-col gap-3 overflow-y-auto h-full pr-1">
        {loading && messages.length === 0 ? (
          <p className="text-muted-foreground mt-10 text-center">Načítání zpráv…</p>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground mt-10 text-center">Zatím žádné zprávy.</p>
        ) : (
          messages.map((msg) => {
            const isSystemMessage = msg.content.includes("🎉") || msg.content.includes("zákonný zástupce");
            const isAdminMessage = msg.sender === "admin";
            
            return (
              <div key={msg.id} className={`flex w-full ${isAdminMessage ? "justify-end" : "justify-start"}`}>
                <div
                  className={`relative max-w-[75%] px-4 py-2 rounded-2xl shadow-sm transition-all ${
                    isAdminMessage
                      ? isSystemMessage
                        ? "bg-amber-500/30 text-amber-100 rounded-br-none border border-amber-500/30"
                        : "bg-blue-600/30 text-blue-100 rounded-br-none"
                      : "bg-[hsl(220,20%,15%)] text-foreground rounded-bl-none"
                  }`}
                >
                  {isSystemMessage && isAdminMessage && (
                    <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium mb-1">
                      <span>🤖</span>
                      <span>Systémová zpráva</span>
                    </div>
                  )}
                  <p className="break-words leading-relaxed">{msg.content}</p>
                  <p className="text-xs text-muted-foreground mt-1 text-right">{new Date(msg.created_at).toLocaleString()}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* INPUT AT BOTTOM */}
      <div className="mt-4 flex gap-2">
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Napište odpověď…"
          className="flex-1 bg-[hsl(220,25%,10%)] text-foreground p-3 rounded-lg border border-[hsl(220,20%,20%)] focus:border-primary outline-none"
        />
        <button onClick={handleSend} className="px-5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground">
          Odeslat
        </button>
      </div>
    </div>
  );
}
