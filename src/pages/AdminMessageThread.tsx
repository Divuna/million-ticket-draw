import { useEffect, useRef, useState } from "react";
import { useParams, Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { capChatMessagesState, CHAT_MESSAGES_STATE_CAP } from "@/lib/chatMessagesStateCap";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Star, Building2, User, ArrowLeft, Mail, Phone } from "lucide-react";
import { NavigateToLogin } from "@/components/NavigateToLogin";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { AI_ASSISTANT_BOB_LABEL } from "@/constants/messagesUi";
import { SUPPORT_REQUEST_MARKER } from "@/constants/supportRequestMarker";

function parseMessageContent(content: string): { text: string; cta?: { label: string; action: string } } {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
      return { text: parsed.text, cta: parsed.cta && typeof parsed.cta.label === "string" && typeof parsed.cta.action === "string" ? parsed.cta : undefined };
    }
  } catch { /* not JSON */ }
  return { text: content };
}

interface Message {
  id: string;
  user_id: string;
  sender: "user" | "admin" | "ai";
  content: string;
  created_at: string;
  read: boolean;
}

const SUPPORT_CHAT_ENDED_MESSAGE =
  "Chat s podporou byl ukončen. Nyní můžete opět využívat Boba.";

interface ContactInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
  role: "user" | "influencer" | "partner";
}

export default function AdminMessageThread() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);

  const supportEnded =
    messages.length > 0 &&
    messages[messages.length - 1].sender === "admin" &&
    messages[messages.length - 1].content === SUPPORT_CHAT_ENDED_MESSAGE;

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
    if (!userId || !user || !isAdmin) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(CHAT_MESSAGES_STATE_CAP);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const chronological = data ? [...data].reverse() : [];
    // Filter out automatic winner messages in admin view
    const filtered = chronological.filter(
      (msg) => !msg.content.includes("Gratulujeme k výhře")
    );
    setMessages(capChatMessagesState(filtered));

    // Mark all user messages as read
    await supabase.from("messages").update({ read: true }).eq("user_id", userId).eq("sender", "user").eq("read", false);

    setLoading(false);
  };

  // Resolve contact identity
  const loadContactInfo = async () => {
    if (!userId || !user || !isAdmin) return;

    const [userRes, partnerRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, email, name, first_name, last_name, phone")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("partners")
        .select("auth_user_id, name, contact_email, contact_phone, notes, status")
        .eq("auth_user_id", userId)
        .maybeSingle(),
    ]);

    const userRow = userRes.data;
    const partner = partnerRes.data;

    // Determine role
    let role: "user" | "influencer" | "partner" = "user";
    if (partner) {
      role =
        (typeof partner.notes === "string" ? partner.notes : "").toLowerCase().includes("influencer")
          ? "influencer"
          : "partner";
    }

    // Resolve name: user first/last > user name > partner name
    const userName = userRow?.first_name && userRow?.last_name
      ? `${userRow.first_name} ${userRow.last_name}`
      : userRow?.name || null;
    const name = userName || partner?.name || null;
    const email = userRow?.email || partner?.contact_email || null;
    const phone = userRow?.phone || partner?.contact_phone || null;

    setContactInfo({ name, email, phone, role });
  };

  useEffect(() => {
    if (!userId || !user || !isAdmin) return;

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
  }, [userId, user, isAdmin]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !isAdmin) return;

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

  const handleEndSupportChat = async () => {
    if (!userId || !user || !isAdmin) return;
    if (supportEnded) return;

    const nowIso = new Date().toISOString();
    const optimistic: Message = {
      id: `optimistic-support-end-${Date.now()}`,
      user_id: userId,
      sender: "admin",
      content: SUPPORT_CHAT_ENDED_MESSAGE,
      read: false,
      created_at: nowIso,
    };

    setMessages((prev) => capChatMessagesState([...prev, optimistic]));

    const { error } = await supabase.from("messages").insert({
      user_id: userId,
      sender: "admin",
      content: SUPPORT_CHAT_ENDED_MESSAGE,
      read: false,
      topic: "support",
      extension: "onemil",
      payload: {},
      event: "support_end",
      private: false,
    });

    if (error) {
      toast({
        title: "Chyba",
        description: "Chat nelze ukončit",
        variant: "destructive",
      });
      loadMessages();
      return;
    }

    await supabase
      .from("messages")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("sender", "admin")
      .eq("content", SUPPORT_REQUEST_MARKER)
      .eq("read", false);

    loadMessages();
  };

  const getRoleBadge = () => {
    if (!contactInfo) return null;
    switch (contactInfo.role) {
      case "influencer":
        return (
          <Badge className="bg-[hsl(280,50%,45%)] text-white border-[hsl(280,60%,55%,0.3)] text-[10px] uppercase tracking-wider gap-1">
            <Star className="w-3 h-3" />
            Affiliate partner
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
      case "influencer": return "Affiliate partnerem";
      case "partner": return "partnerem";
      default: return "uživatelem";
    }
  };

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
      </div>
    );
  }

  if (!user) {
    return <NavigateToLogin />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[hsl(220,20%,4%)] w-full">
      <div className="flex flex-col flex-1 min-h-0 px-4 pt-4 pb-6 gap-4">
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
            {contactInfo?.phone && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Phone className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">{contactInfo.phone}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div ref={scrollRef} className="flex flex-col gap-3 overflow-y-auto flex-1 min-h-0 pr-1">
        {loading && messages.length === 0 ? (
          <p className="text-muted-foreground mt-10 text-center">Načítání zpráv…</p>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground mt-10 text-center">Zatím žádné zprávy.</p>
        ) : (
          messages.map((msg) => {
            const isSystemMessage = msg.content.includes("🎉") || msg.content.includes("zákonný zástupce");
            const isAdminMessage = msg.sender === "admin";
            const isAiMessage = msg.sender === "ai";
            const isUserMessage = msg.sender === "user";

            return (
                <div key={msg.id} className={`flex w-full ${isAdminMessage ? "justify-end" : "justify-start"}`}>
                <div
                  className={`relative max-w-[75%] px-4 py-2 rounded-2xl shadow-sm transition-all ${
                    isAiMessage
                      ? "text-white rounded-bl-none"
                      : isUserMessage
                        ? "text-white rounded-bl-none"
                        : isAdminMessage
                          ? isSystemMessage
                            ? "bg-amber-500/30 text-amber-100 rounded-br-none border border-amber-500/30"
                            : "bg-blue-600/30 text-blue-100 rounded-br-none"
                          : "bg-[hsl(220,20%,15%)] text-foreground rounded-bl-none"
                  }`}
                  style={isAiMessage ? {
                    background: 'linear-gradient(135deg, #5B3DF5 0%, #7A5CFF 100%)',
                    border: '1px solid rgba(122, 92, 255, 0.8)',
                    boxShadow: '0 6px 30px rgba(122, 92, 255, 0.6)',
                  } : isUserMessage ? {
                    background: 'linear-gradient(135deg, #1FAF6D 0%, #169B5C 100%)',
                    border: '1px solid rgba(34, 197, 94, 0.6)',
                    boxShadow: '0 6px 25px rgba(34, 197, 94, 0.35)',
                  } : undefined}
                >
                  {isSystemMessage && isAdminMessage && (
                    <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium mb-1">
                      <span>🤖</span>
                      <span>Systémová zpráva</span>
                    </div>
                  )}
                  {isAiMessage && (
                    <p className="text-xs font-medium text-white/70 mb-1">{AI_ASSISTANT_BOB_LABEL}</p>
                  )}
                  {isUserMessage && (
                    <p className="text-xs font-medium text-white/70 mb-1">
                      {contactInfo?.name || contactInfo?.email || "Uživatel"}
                    </p>
                  )}
                  {(() => { const parsed = parseMessageContent(msg.content); return (<><p className="break-words leading-relaxed">{parsed.text}</p>{parsed.cta && (<button onClick={(e) => { e.stopPropagation(); if (parsed.cta!.action.startsWith("http")) { window.open(parsed.cta!.action, "_blank", "noopener"); } else { navigate(parsed.cta!.action); } }} className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.03]" style={{ background: 'linear-gradient(135deg, hsl(45,80%,45%) 0%, hsl(35,90%,38%) 100%)', color: 'hsl(220,20%,8%)', boxShadow: '0 4px 12px hsl(45,80%,40%,0.3)', border: '1px solid hsl(45,70%,50%,0.4)' }}>{parsed.cta!.label}</button>)}</>); })()}
                  <p className={`text-xs mt-1 text-right ${isUserMessage || isAiMessage ? "text-white/50" : "text-muted-foreground"}`}>{new Date(msg.created_at).toLocaleString()}</p>
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
        <button
          type="button"
          onClick={handleEndSupportChat}
          disabled={supportEnded || loading}
          className="px-5 rounded-lg bg-[hsl(220,25%,14%)] hover:bg-[hsl(220,25%,18%)] text-foreground border border-[hsl(45,70%,50%,0.25)]"
        >
          Ukončit chat
        </button>
        <button onClick={handleSend} className="px-5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground">
          Odeslat
        </button>
      </div>
      </div>
    </div>
  );
}
