import { useEffect, useState, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { toast } from "@/hooks/use-toast";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  AI_ASSISTANT_BOB_LABEL,
  AI_ASSISTANT_TYPING_SUBLINE,
} from "@/constants/messagesUi";
import { MessageCircle, Send, Sparkles } from "lucide-react";

interface Sparkle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
}

interface FlyingMessage {
  id: number;
  content: string;
}

interface Message {
  id: string;
  user_id: string;
  sender: "user" | "admin" | "ai";
  content: string;
  read: boolean;
  created_at: string;
}

/** Most recent rows for the thread (older history not loaded). */
const MESSAGES_PAGE_LIMIT = 50;

function sortMessagesAsc(a: Message, b: Message): number {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function trimMessagesToPageLimit(rows: Message[]): Message[] {
  if (rows.length <= MESSAGES_PAGE_LIMIT) return rows;
  return [...rows].sort(sortMessagesAsc).slice(-MESSAGES_PAGE_LIMIT);
}

/** Incremental thread sync — no full refetch (Bob/admin replies arrive as INSERT). */
function mergeMessagesFromRealtime(
  prev: Message[],
  payload: RealtimePostgresChangesPayload<Message>,
): Message[] {
  if (payload.eventType === "INSERT" && payload.new) {
    const row = payload.new as Message;
    let next = [...prev];
    if (row.sender === "user") {
      for (let i = next.length - 1; i >= 0; i--) {
        const m = next[i];
        if (
          m.id.startsWith("optimistic-") &&
          m.sender === "user" &&
          m.content === row.content
        ) {
          next.splice(i, 1);
          break;
        }
      }
    }
    if (next.some((m) => m.id === row.id)) return next;
    next = [...next, row].sort(sortMessagesAsc);
    return trimMessagesToPageLimit(next);
  }
  if (payload.eventType === "UPDATE" && payload.new) {
    const row = payload.new as Message;
    return prev.map((m) => (m.id === row.id ? row : m));
  }
  if (payload.eventType === "DELETE" && payload.old) {
    const id = String((payload.old as { id: string }).id);
    return prev.filter((m) => m.id !== id);
  }
  return prev;
}

/** In-app paths that may appear in message text and should render as router links. */
const MESSAGE_DEEP_LINK_PATHS =
  /\/(?:wallet|customer-inbox|wins|vouchers|games|my-contests|profile)/g;

type MessageDeepLinkRoute =
  | "/wallet"
  | "/customer-inbox"
  | "/wins"
  | "/vouchers"
  | "/games"
  | "/my-contests"
  | "/profile";

function renderMessageWithDeepLinks(content: string) {
  const nodes = [];
  const linkRegex = new RegExp(MESSAGE_DEEP_LINK_PATHS.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = linkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={`text-${key++}`}>{content.slice(lastIndex, match.index)}</span>);
    }

    const route = match[0] as MessageDeepLinkRoute;
    nodes.push(
      <Link
        key={`link-${key++}`}
        to={route}
        style={{ color: "inherit", textDecoration: "inherit" }}
      >
        {route}
      </Link>,
    );

    lastIndex = match.index + route.length;
  }

  if (lastIndex < content.length) {
    nodes.push(<span key={`text-${key++}`}>{content.slice(lastIndex)}</span>);
  }

  return nodes.length > 0 ? nodes : content;
}

type BobChatCta = { label: string; action: string };

/** Relative in-app path only (blocks protocol-relative //… URLs). */
function isBobCtaActionAllowed(action: string): boolean {
  return action.startsWith("/") && !action.startsWith("//");
}

/** Parses optional Bob JSON payload stored in `messages.content`; plain strings pass through. */
function parseBobMessageContent(content: string): { text: string; cta?: BobChatCta } {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) {
    return { text: content };
  }
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>;
    if (!o || typeof o !== "object" || typeof o.text !== "string") {
      return { text: content };
    }
    const text = o.text;
    if (!o.cta || typeof o.cta !== "object") {
      return { text };
    }
    const c = o.cta as Record<string, unknown>;
    if (typeof c.label !== "string" || typeof c.action !== "string") {
      return { text };
    }
    const action = c.action.trim();
    if (!isBobCtaActionAllowed(action)) {
      return { text };
    }
    return { text, cta: { label: c.label.trim(), action } };
  } catch {
    return { text: content };
  }
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { sendMessageToAdmin } = useMessages();
  const { refresh: refreshUnreadCount } = useUnreadMessagesCount();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const [flyingMessage, setFlyingMessage] = useState<FlyingMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [lastUserMessageAt, setLastUserMessageAt] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("Uživatel");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchName = async () => {
      const { data: profile } = await supabase
        .from("users")
        .select("name, first_name, last_name, email")
        .eq("id", user.id)
        .maybeSingle();
      const fullName = profile?.first_name && profile?.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile?.name || profile?.email || user.email || "Uživatel";
      setUserName(fullName);
    };
    fetchName();
  }, [user]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const markAdminMessagesAsRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("user_id", user.id)
      .in("sender", ["admin", "ai"])
      .eq("read", false);
  }, [user]);

  const loadMessages = useCallback(async () => {
    console.log("loadMessages called", new Date().toISOString());
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MESSAGES_PAGE_LIMIT);
    setMessages(data ? [...data].reverse() : []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const initMessages = async () => {
      await loadMessages();
      await markAdminMessagesAsRead();
      refreshUnreadCount();
    };

    void initMessages();

    const postgresChannel = supabase
      .channel(`messages-thread-pg:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log("realtime event", payload.eventType, payload.new);
          setMessages((prev) => mergeMessagesFromRealtime(prev, payload));
        },
      )
      .subscribe();

    return () => {
      postgresChannel.unsubscribe();
    };
  }, [user, loadMessages, markAdminMessagesAsRead, refreshUnreadCount]);

  useEffect(() => {
    if (!lastUserMessageAt) return;

    const hasReply = messages.some((msg) => {
      const isReplySender = msg.sender === "ai" || msg.sender === "admin";
      return isReplySender && new Date(msg.created_at).getTime() >= new Date(lastUserMessageAt).getTime();
    });

    if (hasReply) {
      setIsAwaitingReply(false);
    }
  }, [messages, lastUserMessageAt]);

  // Create sparkle effect
  const createSparkles = useCallback(() => {
    const newSparkles: Sparkle[] = [];
    for (let i = 0; i < 12; i++) {
      newSparkles.push({
        id: Date.now() + i,
        x: Math.random() * 100 - 50,
        y: Math.random() * 60 - 80,
        size: 4 + Math.random() * 8,
        delay: Math.random() * 0.3,
      });
    }
    setSparkles(newSparkles);
    setTimeout(() => setSparkles([]), 1000);
  }, []);

  // SEND with animation
  const handleSend = async () => {
    console.log("handleSend called");
    if (!newMessage.trim() || isSending) return;

    const messageContent = newMessage.trim();

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticMessage: Message = {
      id: optimisticId,
      user_id: user?.id || "",
      sender: "user",
      content: messageContent,
      read: false,
      created_at: optimisticCreatedAt,
    };

    // Optimistic row before any await (animation + network).
    setMessages((prev) => trimMessagesToPageLimit([...prev, optimisticMessage]));
    setLastUserMessageAt(optimisticCreatedAt);
    setIsAwaitingReply(true);

    setIsSending(true);
    setFlyingMessage({ id: Date.now(), content: messageContent });
    createSparkles();
    setNewMessage("");

    await new Promise((resolve) => setTimeout(resolve, 600));

    const inserted = await sendMessageToAdmin(messageContent);

    if (inserted) {
      setMessages((prev) => {
        const withoutOpt = prev.filter((m) => m.id !== optimisticId);
        if (withoutOpt.some((m) => m.id === inserted.id)) {
          return trimMessagesToPageLimit(withoutOpt);
        }
        return trimMessagesToPageLimit(
          [...withoutOpt, inserted as Message].sort(sortMessagesAsc),
        );
      });
      setLastUserMessageAt(inserted.created_at);
      toast({ title: "Odesláno" });
    } else {
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
      setIsAwaitingReply(false);
      toast({ title: "Chyba", description: "Odeslání selhalo", variant: "destructive" });
    }
    setFlyingMessage(null);
    setIsSending(false);
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
            const senderNormalized = (msg.sender || "").toLowerCase().trim();
            const isUserMessage = senderNormalized === "user";
            const isAiMessage = senderNormalized === "ai";
            const bobPayload = isAiMessage ? parseBobMessageContent(msg.content) : null;
            const bodyText = bobPayload?.text ?? msg.content;
            const isSystemMessage =
              bodyText.includes("🎉") || bodyText.includes("zákonný zástupce");
            const senderLabel =
              msg.sender === "ai"
                ? AI_ASSISTANT_BOB_LABEL
                : msg.sender === "admin"
                  ? "Podpora"
                  : null;

            const bubbleStyle: CSSProperties =
              isUserMessage
                ? {
                    background: "linear-gradient(135deg, hsl(45, 80%, 40%) 0%, hsl(35, 85%, 35%) 100%)",
                    boxShadow: "0 4px 20px hsl(45, 80%, 40%, 0.25)",
                    border: "1px solid hsl(45, 70%, 50%, 0.3)",
                  }
                : isAiMessage
                  ? {
                      background:
                        "linear-gradient(135deg, hsl(260, 60%, 18%) 0%, hsl(280, 65%, 14%) 100%)",
                      border: "1px solid hsl(270, 70%, 60%, 0.7)",
                      boxShadow: "0 6px 24px hsl(270, 80%, 20%, 0.6)",
                      filter: "brightness(1.1)",
                    }
                  : isSystemMessage
                    ? {
                        background: "linear-gradient(135deg, hsl(35, 50%, 15%) 0%, hsl(30, 45%, 12%) 100%)",
                        border: "1px solid hsl(35, 60%, 40%, 0.3)",
                        boxShadow: "0 4px 16px hsl(0, 0%, 0%, 0.3)",
                      }
                    : {
                        background: "linear-gradient(135deg, hsl(220, 25%, 12%) 0%, hsl(220, 30%, 15%) 100%)",
                        border: "1px solid hsl(220, 20%, 25%, 0.5)",
                        boxShadow: "0 4px 16px hsl(0, 0%, 0%, 0.3)",
                      };

            return (
              <div
                key={msg.id}
                className={`flex ${isUserMessage ? "justify-end" : "justify-start"}`}
                style={{
                  animation: `fade-in 0.3s ease-out`,
                  animationDelay: `${index * 0.05}s`,
                  animationFillMode: "both",
                }}
              >
                <div
                  className="max-w-[75%] relative overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:scale-[1.01]"
                  style={bubbleStyle}
                >
                  {/* Message shimmer for user messages */}
                  {isUserMessage && (
                    <div 
                      className="absolute inset-0 opacity-20"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, rgba(34, 197, 94, 0.5) 50%, transparent 100%)',
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

                  {!isSystemMessage && senderLabel && (
                    <p className="relative z-10 text-xs font-semibold text-gray-400 mb-1">
                      {senderLabel}
                    </p>
                  )}

                  {isUserMessage && (
                    <p className="relative z-10 text-xs font-semibold text-white/70 mb-1">
                      {userName}
                    </p>
                  )}
                  
                  <p 
                    className={`relative z-10 text-[15px] leading-relaxed ${
                      isUserMessage ? "text-white font-medium" : "text-gray-100"
                    }`}
                  >
                    {renderMessageWithDeepLinks(bodyText)}
                  </p>

                  {bobPayload?.cta && (
                    <Link
                      to={bobPayload.cta.action}
                      className="relative z-10 mt-3 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        background:
                          "linear-gradient(135deg, hsl(45, 75%, 48%) 0%, hsl(35, 85%, 40%) 100%)",
                        color: "hsl(220, 25%, 8%)",
                        boxShadow: "0 4px 14px hsl(45, 80%, 35%, 0.35)",
                        border: "1px solid hsl(45, 70%, 55%, 0.5)",
                      }}
                    >
                      {bobPayload.cta.label}
                    </Link>
                  )}
                  
                  <p 
                    className={`relative z-10 text-xs mt-2 ${
                      isUserMessage ? "text-white/50" : "text-gray-500"
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

          {isAwaitingReply && (
            <div className="flex justify-start">
              <div
                className="max-w-[75%] relative overflow-hidden rounded-2xl p-4 transition-all duration-300"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(260, 60%, 18%) 0%, hsl(280, 65%, 14%) 100%)",
                  border: "1px solid hsl(270, 70%, 60%, 0.7)",
                  boxShadow: "0 6px 24px hsl(270, 80%, 20%, 0.6)",
                  filter: "brightness(1.1)",
                }}
              >
                <p className="relative z-10 text-xs font-semibold text-gray-400 mb-1">{AI_ASSISTANT_BOB_LABEL}</p>
                <p className="relative z-10 text-[15px] leading-relaxed text-gray-100">
                  {AI_ASSISTANT_TYPING_SUBLINE}
                </p>
              </div>
            </div>
          )}
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
              {/* Flying message animation */}
              {flyingMessage && (
                <div 
                  className="absolute right-16 bottom-full mb-2 z-50 pointer-events-none"
                  style={{ animation: 'fly-up 0.6s ease-out forwards' }}
                >
                  <div 
                    className="max-w-[200px] px-4 py-2 rounded-xl text-sm font-medium text-black truncate"
                    style={{
                      background: 'linear-gradient(135deg, hsl(45, 80%, 50%) 0%, hsl(35, 90%, 40%) 100%)',
                      boxShadow: '0 4px 20px hsl(45, 80%, 40%, 0.5)',
                    }}
                  >
                    {flyingMessage.content.length > 30 
                      ? flyingMessage.content.substring(0, 30) + '...' 
                      : flyingMessage.content}
                  </div>
                  
                  {/* Sparkles around flying message */}
                  {sparkles.map((sparkle) => (
                    <div
                      key={sparkle.id}
                      className="absolute"
                      style={{
                        left: '50%',
                        top: '50%',
                        width: sparkle.size,
                        height: sparkle.size,
                        animation: `sparkle-burst 0.8s ease-out ${sparkle.delay}s forwards`,
                        transform: `translate(${sparkle.x}px, ${sparkle.y}px)`,
                      }}
                    >
                      <Sparkles 
                        className="w-full h-full"
                        style={{ color: 'hsl(45, 93%, 60%)' }}
                      />
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={inputRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Napište zprávu..."
                disabled={isSending}
                className="flex-1 bg-[hsl(220,25%,10%)] text-gray-100 p-4 rounded-xl border border-[hsl(220,20%,20%)] focus:border-[hsl(45,70%,50%)]/50 focus:ring-2 focus:ring-[hsl(45,70%,50%)]/20 transition-all duration-300 placeholder:text-gray-500 text-[15px] disabled:opacity-50"
                style={{
                  boxShadow: 'inset 0 2px 4px hsl(0, 0%, 0%, 0.2)',
                }}
              />
              
              <button
                onClick={handleSend}
                disabled={loading || !newMessage.trim() || isSending}
                className={`relative overflow-hidden p-4 rounded-xl transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 ${isSending ? 'animate-pulse' : ''}`}
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
                {newMessage.trim() && !isSending && (
                  <div 
                    className="absolute inset-0 opacity-30"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, hsl(45, 93%, 70%) 50%, transparent 100%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 2s ease-in-out infinite',
                    }}
                  />
                )}
                <Send className={`w-5 h-5 relative z-10 transition-transform ${newMessage.trim() ? 'text-black' : 'text-gray-500'} ${isSending ? 'rotate-[-45deg] scale-110' : ''}`} />
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
        
        @keyframes fly-up {
          0% { 
            opacity: 1; 
            transform: translateY(0) scale(1); 
          }
          50% { 
            opacity: 1; 
            transform: translateY(-40px) scale(1.05); 
          }
          100% { 
            opacity: 0; 
            transform: translateY(-100px) scale(0.8); 
          }
        }
        
        @keyframes sparkle-burst {
          0% { 
            opacity: 0; 
            transform: translate(0, 0) scale(0) rotate(0deg); 
          }
          30% { 
            opacity: 1; 
            transform: translate(var(--tx, 0), var(--ty, 0)) scale(1.2) rotate(180deg); 
          }
          100% { 
            opacity: 0; 
            transform: translate(calc(var(--tx, 0) * 2), calc(var(--ty, 0) * 2)) scale(0) rotate(360deg); 
          }
        }
      `}</style>
    </div>
  );
}
