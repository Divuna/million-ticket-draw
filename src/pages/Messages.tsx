// FORCE SAVE
// production fix
console.log("PRODUCTION VERSION V2")
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LoggedOutScreen } from "@/components/LoggedOutScreen";
import { useMessages } from "@/hooks/useMessages";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useBobEnabled } from "@/hooks/useBobEnabled";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeSupportHandoff } from "@/integrations/supabase/supportHandoffInvoke";
import { capAfterTailGrowth, CHAT_PAGE_SIZE } from "@/lib/chatMessagesStateCap";
import {
  AI_ASSISTANT_BOB_LABEL,
  AI_ASSISTANT_TYPING_SUBLINE,
} from "@/constants/messagesUi";
import { SUPPORT_REQUEST_MARKER } from "@/constants/supportRequestMarker";
import { Send, Sparkles } from "lucide-react";
import avatarPhone from "@/assets/redesign/avatar/avatar-telefon-voucher.png";
import { OneMilDiamondIcon } from "@/components/icons/OneMilIcons";

function parseMessageContent(content: string): { text: string; cta?: { label: string; action: string } } {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
      return {
        text: parsed.text,
        cta: parsed.cta && typeof parsed.cta.label === "string" && typeof parsed.cta.action === "string"
          ? parsed.cta
          : undefined,
      };
    }
  } catch {
    // not JSON, return raw
  }
  return { text: content };
}

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
  sender: "user" | "admin" | "ai" | "support" | "system";
  content: string;
  read: boolean;
  created_at: string;
  isOptimistic?: boolean;
}

const OPTIMISTIC_MESSAGE_ID_PREFIX = "optimistic-";
const SUPPORT_CHAT_ENDED_MESSAGE =
  "Chat s podporou byl ukončen. Teď můžeš zase využívat Boba.";

function sortMessagesByCreatedAtAsc<T extends { created_at: string; id: string }>(messages: T[]): T[] {
  return [...messages].sort((a, b) => {
    const at = new Date(a.created_at).getTime();
    const bt = new Date(b.created_at).getTime();
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Exactly one mode at a time:
 * - "ai": Bob may respond (including after support CTA until a human admin writes).
 * - "admin": only user + human admin; Bob off until admin ends chat.
 */
function computeChatMode(messages: Message[]): "ai" | "admin" {
  const sorted = sortMessagesByCreatedAtAsc([...messages]);
  let lastSupportEndIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    if (
      (m.sender === "admin" || m.sender === "support") &&
      m.content === SUPPORT_CHAT_ENDED_MESSAGE
    ) {
      lastSupportEndIdx = i;
    }
  }
  const messagesAfterLastEnd =
    lastSupportEndIdx < 0 ? sorted : sorted.slice(lastSupportEndIdx + 1);

  const hasAdminMessage = messagesAfterLastEnd.some(
    (m) =>
      (m.sender === "admin" || m.sender === "support") &&
      m.content &&
      m.content.trim() !== "" &&
      m.content !== SUPPORT_REQUEST_MARKER &&
      m.content !== SUPPORT_CHAT_ENDED_MESSAGE
  );

  if (hasAdminMessage) return "admin";
  return "ai";
}

/** True bottom only: tolerate subpixel / fractional layout so we do not miss "pinned" state. */
const CHAT_AT_BOTTOM_EPSILON_PX = 3;

/** Show "Nové zprávy" only when the viewport is clearly above the thread end. */
const CHAT_NEW_MESSAGES_INDICATOR_MIN_OFFSET_PX = 150;

function chatScrollDistanceFromBottom(el: HTMLDivElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop);
}

function chatIsPinnedToBottomStrict(el: HTMLDivElement): boolean {
  return chatScrollDistanceFromBottom(el) <= CHAT_AT_BOTTOM_EPSILON_PX;
}

type MessageThreadItemProps = {
  msg: Message;
  index: number;
  userName: string;
  supportSent: boolean;
  setSupportSent: React.Dispatch<React.SetStateAction<boolean>>;
  appendSupportRequestMessage: () => void;
  supportHandoffInFlightRef: React.MutableRefObject<boolean>;
  supportHandoffMessage: string;
};

/** Rychlé otázky v prázdných Zprávách – jen vloží text do pole, nic samy neodešlou (✦ NAVÍC). */
const QUICK_QUESTIONS = ["Jak funguje MIO?", "Jak se hraje soutěž?", "Kde najdu voucher?"];

/** Vlastní značka asistenta Boba – zlatá jiskřička v tmavém kroužku (deska Zprávy). */
function BobMark({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 50% 30%, #3A1118, #15151A 70%)",
        boxShadow: "0 0 0 1px #E9B949",
      }}
    >
      <Sparkles style={{ width: size * 0.62, height: size * 0.62 }} color="#F6D77A" strokeWidth={2.4} />
    </span>
  );
}

function MessageThreadItem({
  msg,
  index,
  userName,
  supportSent,
  setSupportSent,
  appendSupportRequestMessage,
  supportHandoffInFlightRef,
  supportHandoffMessage,
}: MessageThreadItemProps) {
  const navigate = useNavigate();
  const parsed = parseMessageContent(msg.content);
  const displayText = parsed.text;
  const cta = parsed.cta;
  const isSystemMessage = displayText.includes("🎉") || displayText.includes("zákonný zástupce");
  const senderNormalized = (msg.sender || "").toLowerCase().trim();
  const isUserMessage = senderNormalized === "user";
  const isAiMessage = senderNormalized === "ai";
  const isSystemSender = msg.sender === "system";
  const senderLabel =
    msg.sender === "ai"
      ? AI_ASSISTANT_BOB_LABEL
      : msg.sender === "admin" || msg.sender === "support"
        ? "Podpora"
        : null;

  // Nový vzhled (deska Zprávy): moje zpráva = tmavá se zlatým lemem, Bob = bílá karta,
  // podpora = karmínově tónovaná, systémová zpráva = světlá zlatá.
  const bubbleStyle: CSSProperties = isUserMessage
    ? {
        background: "linear-gradient(180deg, #26262C, #121215)",
        boxShadow: "inset 0 0 0 1px rgba(233,185,73,0.4), 0 6px 14px rgba(23,23,27,0.2)",
        borderRadius: "18px 18px 4px 18px",
      }
    : isAiMessage
      ? {
          background: "linear-gradient(180deg, #FFFFFF, #FDF8EF)",
          boxShadow: "inset 0 1px 0 #fff, 0 0 0 1px rgba(194,144,47,0.24), 0 6px 14px rgba(60,40,10,0.1)",
          borderRadius: "18px 18px 18px 4px",
        }
      : isSystemSender || isSystemMessage
        ? {
            background: "linear-gradient(180deg, #FFFBEF, #FBF1D8)",
            boxShadow: "inset 0 0 0 1px rgba(194,144,47,0.4), 0 6px 14px rgba(60,40,10,0.08)",
            borderRadius: "18px",
          }
        : {
            background: "linear-gradient(180deg, #FFF6F7, #FBE9EC)",
            boxShadow: "inset 0 0 0 1px rgba(181,18,43,0.35), 0 6px 14px rgba(60,40,10,0.08)",
            borderRadius: "18px 18px 18px 4px",
          };

  const timeLabel = useMemo(
    () =>
      new Date(msg.created_at).toLocaleString("cs-CZ", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [msg.created_at],
  );

  return (
    <div
      className={`flex ${isUserMessage ? "justify-end" : "justify-start"}`}
      style={{
        animation: `fade-in 0.3s ease-out`,
        animationDelay: `${index * 0.05}s`,
        animationFillMode: "both",
      }}
    >
      <div
        className={`max-w-[80%] relative overflow-hidden px-[13px] py-[10px] ${
          isAiMessage
            ? "transition-[transform,opacity] duration-150 [contain:layout]"
            : "transition-all duration-300"
        }`}
        style={bubbleStyle}
      >
        {(isSystemSender || (isSystemMessage && !isUserMessage)) && (
          <div className="flex items-center gap-2 mb-2">
            <OneMilDiamondIcon size={16} className="w-4 h-4 text-[#C2902F]" />
            <span
              className="text-xs font-semibold"
              style={{
                background: "linear-gradient(90deg, #C2902F 0%, #E9B949 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Systémová zpráva
            </span>
          </div>
        )}

        {!isSystemSender && !isSystemMessage && senderLabel && (
          <p
            className={`relative z-10 flex items-center gap-1.5 text-[11px] font-extrabold mb-[3px] ${
              isAiMessage ? "text-[#8A5A10]" : "text-[#B5122B]"
            }`}
          >
            {isAiMessage && <BobMark size={16} />}
            {senderLabel}
          </p>
        )}

        {isUserMessage && (
          <p className="relative z-10 text-[11px] font-extrabold text-[#E9B949]/80 mb-[3px]">{userName}</p>
        )}

        <p
          className={`relative z-10 text-[14px] leading-[1.45] whitespace-pre-wrap break-words ${
            isUserMessage ? "text-[#F6EFD9] font-medium" : "text-[#17171B]"
          }`}
        >
          {displayText}
        </p>

        {(() => {
          const effectiveCta = cta;

          if (!effectiveCta) return null;

          return (
          <button
            type="button"
            onClick={async (e) => {
              console.log("CTA CLICK");
              console.log("CTA CLICK payload", effectiveCta);
              e.preventDefault();
              e.stopPropagation();
              if (effectiveCta.action.startsWith("http")) {
                window.open(effectiveCta.action, "_blank", "noopener");
              } else {
                if (effectiveCta.action === "/messages") {
                  if (supportSent) return;
                  if (supportHandoffInFlightRef.current) return;
                  supportHandoffInFlightRef.current = true;
                  try {
                    console.log("SUPPORT SHOULD ONLY TRIGGER HERE");
                    await invokeSupportHandoff({ message: supportHandoffMessage });
                    setSupportSent(true);
                  } finally {
                    supportHandoffInFlightRef.current = false;
                  }
                  return;
                }
                navigate(effectiveCta.action);
              }
            }}
            className="relative z-10 mt-[9px] flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-[11px] px-4 text-[13px] font-extrabold transition-all duration-200 hover:brightness-105 active:scale-[0.98]"
            style={
              effectiveCta.action === "/messages" && supportSent
                ? {
                    background: "rgba(46,158,91,0.14)",
                    color: "#1F7A45",
                    boxShadow: "inset 0 0 0 1px rgba(46,158,91,0.45)",
                    pointerEvents: "auto",
                    position: "relative",
                    zIndex: 50,
                  }
                : {
                    background: "linear-gradient(180deg, #FFE29A, #E9B949 55%, #C2902F)",
                    color: "#1A1205",
                    boxShadow: "0 4px 10px rgba(194,144,47,0.35)",
                    pointerEvents: "auto",
                    position: "relative",
                    zIndex: 50,
                  }
            }
          >
            {effectiveCta.action === "/messages" && supportSent ? "Předáno podpoře" : effectiveCta.label}
          </button>
          );
        })()}

        <p
          className={`relative z-10 text-[10px] mt-1 ${
            isUserMessage ? "text-right text-[#A9AAB3]" : "text-[#8E8F98]"
          }`}
        >
          {timeLabel}
        </p>
      </div>
    </div>
  );
}

type MessagesThreadListProps = {
  messages: Message[];
  userName: string;
  supportSent: boolean;
  setSupportSent: React.Dispatch<React.SetStateAction<boolean>>;
  appendSupportRequestMessage: () => void;
  supportHandoffInFlightRef: React.MutableRefObject<boolean>;
  supportHandoffMessage: string;
};

function MessagesThreadList({
  messages,
  userName,
  supportSent,
  setSupportSent,
  appendSupportRequestMessage,
  supportHandoffInFlightRef,
  supportHandoffMessage,
}: MessagesThreadListProps) {
  return (
    <>
      {messages.map((msg, index) => {
        console.log("RENDER MESSAGE", msg.sender, msg.content);
        return (
          <MessageThreadItem
            key={msg.id}
            msg={msg}
            index={index}
            userName={userName}
            supportSent={supportSent}
            setSupportSent={setSupportSent}
            appendSupportRequestMessage={appendSupportRequestMessage}
            supportHandoffInFlightRef={supportHandoffInFlightRef}
            supportHandoffMessage={supportHandoffMessage}
          />
        );
      })}
    </>
  );
}

export default function MessagesPage() {
  useEffect(() => { console.log("MESSAGES PAGE MOUNTED"); return () => console.log("MESSAGES PAGE UNMOUNTED"); }, []);
  const { user } = useAuth();
  const { sendMessageToAdmin } = useMessages();
  const { refresh: refreshUnreadCount } = useUnreadMessagesCount();
  const { bobEnabled } = useBobEnabled();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [supportSent, setSupportSent] = useState(false);
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const [flyingMessage, setFlyingMessage] = useState<FlyingMessage | null>(null);
  const sendInFlightRef = useRef(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [lastUserMessageAt, setLastUserMessageAt] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("Uživatel");
  const [showNewMessagesBelow, setShowNewMessagesBelow] = useState(false);
  /** UI: show jump chip whenever viewport is not strict-bottom (scroll sync). */
  const [awayFromBottom, setAwayFromBottom] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Synced on scroll + after programmatic pin — drives auto-scroll without post-commit mis-reads. */
  const pinnedToBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const supportHandoffInFlightRef = useRef(false);
  
  const hasMoreOlderRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const currentUserIdRef = useRef<string | undefined>(undefined);

  messagesRef.current = messages;
  currentUserIdRef.current = user?.id;

  const visibleMessages = messages.filter(
    (m) => m.content !== SUPPORT_REQUEST_MARKER
  );

  // Realtime: merge new messages instantly (admin replies, ai replies, etc).
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;

    const channel = supabase
      .channel(`messages-${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${uid}` },
        (payload) => {
          console.log("REALTIME EVENT:", payload);
          const newMessage = payload.new as Message;

          // Immediately sync mode ref before React re-renders — prevents stale reads in handleSend
          if (newMessage.sender === "admin" || newMessage.sender === "support") {
            if (newMessage.content === SUPPORT_CHAT_ENDED_MESSAGE) {
              chatModeRef.current = "ai";
            } else if (
              newMessage.content?.trim() &&
              newMessage.content !== SUPPORT_REQUEST_MARKER
            ) {
              chatModeRef.current = "admin";
            }
          }

          setMessages((prev) => {
            const exists = prev.some((m) => m.id === newMessage.id);
            if (exists) return prev;

            // Always append admin/support messages — do not filter out
            if (newMessage.sender === "admin" || newMessage.sender === "support") {
              return sortMessagesByCreatedAtAsc([...prev, newMessage]);
            }

            // Block stale in-flight AI messages from appearing in admin mode.
            // Check both the ref (immediate) and the committed state (source of truth)
            // so duplicate suppression works even when chatModeRef is briefly stale.
            if (newMessage.sender === "ai" &&
                (chatModeRef.current === "admin" || computeChatMode(prev) === "admin")) return prev;

            if (!newMessage.content || newMessage.content.trim() === "") return prev;

            // For user messages: replace matching optimistic instead of appending alongside it
            if (newMessage.sender === "user") {
              const optIdx = prev.findIndex(
                (m) =>
                  m.id.startsWith(OPTIMISTIC_MESSAGE_ID_PREFIX) &&
                  m.sender === "user" &&
                  m.content === newMessage.content,
              );
              if (optIdx >= 0) {
                const next = [...prev];
                next[optIdx] = newMessage;
                return sortMessagesByCreatedAtAsc(next);
              }
            }

            return sortMessagesByCreatedAtAsc([...prev, newMessage]);
          });
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user?.id]);

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
  }, [user?.id]);

  const pinToBottomInstant = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pinnedToBottomRef.current = true;
    setAwayFromBottom(false);
  }, []);

  /** Coalesce rapid tail updates (streaming) into one scroll adjustment per frame — reduces jumpiness. */
  const pinQueuedRafRef = useRef<number | null>(null);
  const queuePinToBottom = useCallback(() => {
    if (pinQueuedRafRef.current !== null) return;
    pinQueuedRafRef.current = requestAnimationFrame(() => {
      pinQueuedRafRef.current = null;
      pinToBottomInstant();
    });
  }, [pinToBottomInstant]);

  useEffect(
    () => () => {
      if (pinQueuedRafRef.current !== null) {
        cancelAnimationFrame(pinQueuedRafRef.current);
        pinQueuedRafRef.current = null;
      }
    },
    [],
  );

  /** Tracks last message id+content — prepend (pagination) leaves tail unchanged → no auto-scroll. */
  const chatTailKeyRef = useRef<string>("");

  useEffect(() => {
    chatTailKeyRef.current = "";
    setShowNewMessagesBelow(false);
    setAwayFromBottom(false);
    pinnedToBottomRef.current = true;
  }, [user?.id]);

  useEffect(() => {
    if (messages.length === 0) {
      chatTailKeyRef.current = "";
      setShowNewMessagesBelow(false);
      setAwayFromBottom(false);
      return;
    }
    const last = messages[messages.length - 1]!;
    const tailKey = `${last.id}\0${last.content}`;
    if (chatTailKeyRef.current === tailKey) return;
    const previousTail = chatTailKeyRef.current;
    chatTailKeyRef.current = tailKey;

    const isInitialTail = previousTail === "";

    if (isInitialTail) {
      setShowNewMessagesBelow(false);
      requestAnimationFrame(() => {
        queuePinToBottom();
      });
      return;
    }

    setShowNewMessagesBelow(false);
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [messages, queuePinToBottom]);

  const handleJumpToLatestMessages = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowNewMessagesBelow(false);
    setAwayFromBottom(false);
    pinnedToBottomRef.current = true;
  }, []);

  useEffect(() => {
    hasMoreOlderRef.current = hasMoreOlder;
  }, [hasMoreOlder]);

  const markAdminMessagesAsRead = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("user_id", uid)
      .in("sender", ["admin", "ai"])
      .eq("read", false);
  }, [user?.id]);

  /** One-time / user-change fetch only — never call after send; new rows come from realtime + optimistic UI. */
  const loadMessages = useCallback(async () => {
    console.log("loadMessages START");
    const uid = user?.id;
    if (!uid) return;
    setLoading(true);
    setHasMoreOlder(false);
    hasMoreOlderRef.current = false;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(CHAT_PAGE_SIZE);
    const rows = sortMessagesByCreatedAtAsc(data ? [...data] : []);
    console.log("MESSAGES RAW", rows);
    setMessages((prev) => {
      const merged = [...prev];

      rows.forEach((row) => {
        const existingIndex = merged.findIndex(
          (m) => m.id === row.id
        );

        if (existingIndex >= 0) {
          merged[existingIndex] = row as unknown as Message;
          return;
        }

        // Check for local copy with same sender+content (optimistic or locally inserted)
        const localIndex = merged.findIndex(
          (m) => m.sender === row.sender && m.content === row.content && m.id !== row.id
        );

        if (localIndex >= 0) {
          // Replace local copy with real DB row
          merged[localIndex] = row as unknown as Message;
          return;
        }

        merged.push(row as unknown as Message);
      });

      const sorted = sortMessagesByCreatedAtAsc(merged);
      messagesRef.current = sorted;
      return sorted;
    });
    console.log("MESSAGES IN STATE", rows);

    // Set mode ref immediately from loaded rows — before useEffect([chatMode]) runs
    chatModeRef.current = computeChatMode(rows as Message[]);

    const more = (data?.length ?? 0) === CHAT_PAGE_SIZE;
    setHasMoreOlder(more);
    hasMoreOlderRef.current = more;
    setLoading(false);
    // Stop waiting only when we can see an AI reply at the tail.
    const last = rows[rows.length - 1];
    if (last?.sender === "ai") {
      console.log("AI RESPONSE RECEIVED");
      setIsAwaitingReply(false);
    }
  }, [user?.id]);

  const loadOlderMessages = useCallback(async () => {
    const uid = user?.id;
    if (!uid || loadingOlderRef.current || !hasMoreOlderRef.current) return;

    const prev = messagesRef.current;
    const cursor = prev[0]?.created_at;
    if (!cursor) return;

    const scrollEl = scrollRef.current;
    const prevScrollHeight = scrollEl?.scrollHeight ?? 0;
    const prevScrollTop = scrollEl?.scrollTop ?? 0;

    loadingOlderRef.current = true;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", uid)
      .lt("created_at", cursor)
      .order("created_at", { ascending: false })
      .limit(CHAT_PAGE_SIZE);

    if (currentUserIdRef.current !== uid) {
      loadingOlderRef.current = false;
      return;
    }

    if (error) {
      loadingOlderRef.current = false;
      return;
    }

    const page = data ?? [];
    const more = page.length === CHAT_PAGE_SIZE;
    setHasMoreOlder(more);
    hasMoreOlderRef.current = more;

    setMessages((current) => {
      if (current.length === 0) return current;
      if (current[0]?.created_at !== cursor) return current;
      const prevIds = new Set(current.map((m) => m.id));
      const blockAsc = sortMessagesByCreatedAtAsc(page).filter((m) => !prevIds.has(m.id));
      const merged = sortMessagesByCreatedAtAsc([...blockAsc, ...current]);
      messagesRef.current = merged;
      return merged;
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (currentUserIdRef.current !== uid) {
          loadingOlderRef.current = false;
          return;
        }
        const el = scrollRef.current;
        if (el && scrollEl) {
          el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
          const pinned = chatIsPinnedToBottomStrict(el);
          pinnedToBottomRef.current = pinned;
          setAwayFromBottom(!pinned);
          if (pinned) setShowNewMessagesBelow(false);
        }
        loadingOlderRef.current = false;
      });
    });
  }, [user?.id]);

  const SCROLL_LOAD_OLDER_THRESHOLD_PX = 72;

  const handleMessagesScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const pinned = chatIsPinnedToBottomStrict(el);
    pinnedToBottomRef.current = pinned;
    if (pinned) {
      setAwayFromBottom(false);
      setShowNewMessagesBelow(false);
    } else {
      setAwayFromBottom(true);
    }

    if (loadingOlderRef.current || !hasMoreOlderRef.current) return;
    if (el.scrollTop > SCROLL_LOAD_OLDER_THRESHOLD_PX) return;
    void loadOlderMessages();
  }, [loadOlderMessages]);

  // Stable refs so the effect body always calls the latest version
  // without those functions appearing in the dependency array.
  const loadMessagesRef = useRef(loadMessages);
  const markAdminMessagesAsReadRef = useRef(markAdminMessagesAsRead);
  const refreshUnreadCountRef = useRef(refreshUnreadCount);
  loadMessagesRef.current = loadMessages;
  markAdminMessagesAsReadRef.current = markAdminMessagesAsRead;
  refreshUnreadCountRef.current = refreshUnreadCount;

  // Runs ONLY when the authenticated user changes — never after send or state updates.
  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      console.log("CALLING loadMessages");
      await loadMessagesRef.current();
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
      await markAdminMessagesAsReadRef.current();
      refreshUnreadCountRef.current();
    })();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling fallback when Realtime is unavailable (e.g. preview); loadMessages merges by id — no blind overwrite.
  useEffect(() => {
    if (!user?.id) return;
    const id = window.setInterval(() => {
      void loadMessagesRef.current();
    }, 2000);
    return () => window.clearInterval(id);
  }, [user?.id]);

  const showTypingIndicator = isAwaitingReply;

  const lastUserMessage = useMemo(() => {
    return (
      messages
        .filter((m) => m.sender === "user")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null
    );
  }, [messages]);

  const supportHandoffMessage = lastUserMessage?.content ?? "";

  const appendSupportRequestMessage = useCallback(() => {
    const now = new Date().toISOString();
    const supportMessage: Message = {
      id: `${OPTIMISTIC_MESSAGE_ID_PREFIX}support-${Date.now()}`,
      user_id: user?.id || "",
      sender: "admin",
      content: SUPPORT_REQUEST_MARKER,
      read: false,
      created_at: now,
    };
    setMessages((prev) => {
      const merged = sortMessagesByCreatedAtAsc([...prev, supportMessage]);
      messagesRef.current = merged;
      return merged;
    });
  }, [user?.id]);

  const chatMode = useMemo(() => computeChatMode(messages), [messages]);
  const chatModeRef = useRef<'ai' | 'admin'>('ai');
  // Only advance toward "admin" from rendered state — never retrograde to "ai".
  // The "ai" direction is handled by the realtime callback (SUPPORT_CHAT_ENDED_MESSAGE)
  // and by loadMessages. A stale render can compute chatMode="ai" before the admin
  // message lands in `messages`, which would clobber the ref already set by the
  // realtime callback — that is the root cause of both BUG-1 and BUG-2.
  if (chatMode === "admin") chatModeRef.current = chatMode;

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

  /** Send pipeline (button / Enter). AI reply comes back in the same await — no DB poll needed. */
  const handleSend = async () => {
    if (!newMessage.trim() || sendInFlightRef.current) return;

    const messageContent = newMessage.trim();
    sendInFlightRef.current = true;

    const optimisticId = `${OPTIMISTIC_MESSAGE_ID_PREFIX}${Date.now()}`;
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticMessage: Message = {
      id: optimisticId,
      user_id: user?.id || "",
      sender: "user",
      content: messageContent,
      read: false,
      created_at: optimisticCreatedAt,
    };

    flushSync(() => {
      setMessages((prev) => {
        const withOptimistic = [...prev, optimisticMessage];
        const sorted = sortMessagesByCreatedAtAsc(withOptimistic);
        messagesRef.current = sorted;
        return sorted;
      });
      setLastUserMessageAt(optimisticCreatedAt);
      // When Bob is globally disabled the message goes straight to admin — no AI typing indicator.
      setIsAwaitingReply(bobEnabled && chatModeRef.current === 'ai');
    });

    setFlyingMessage({ id: Date.now(), content: messageContent });
    createSparkles();
    setNewMessage("");

    try {
      console.log("SEND START");
      // Global Bob switch (admin-controlled via settings.bob_enabled): when OFF,
      // force the admin route so ai-chat is never called and the message goes
      // straight to support. Bob prompt / CTA / format are untouched.
      const mode = !bobEnabled ? "admin" : chatModeRef.current;
      // Single routing decision — exactly one send path per message
      console.log(`ROUTE: ${mode === "admin" ? "ADMIN" : "AI"}`);

      const result = await sendMessageToAdmin(messageContent, { supportActive: mode === "admin" });
      if (!bobEnabled) {
        sonnerToast("Zprávu jsme předali podpoře. Ozveme se co nejdříve.");
      }
      console.log("RESULT", result);

      if (result) {
        const { userMessage, aiMessage } = result;
        setLastUserMessageAt(userMessage.created_at);
        setMessages((prev) => {
          // Remove optimistic placeholder, dedup real row (realtime may have placed it already),
          // then re-insert the confirmed real row — message can never disappear.
          const withoutOptimistic = prev.filter((m) => m.id !== optimisticId);
          const withoutDup = withoutOptimistic.filter((m) => m.id !== userMessage.id);
          let next: Message[] = [...withoutDup, userMessage as Message];
          // Inject AI reply only when route was AI and we are still in AI mode.
          // Double-check committed state (prev) alongside the ref — if admin has already
          // been placed in state by the time this updater runs, suppress the AI reply.
          if (aiMessage && computeChatMode(prev) === "ai") {
            const ai = aiMessage as Message;
            const aiIdx = next.findIndex((m) => m.id === ai.id);
            if (aiIdx >= 0) {
              const updated = [...next];
              updated[aiIdx] = ai;
              next = updated;
            } else {
              next = [...next, ai];
            }
          }
          const merged = sortMessagesByCreatedAtAsc(next);
          messagesRef.current = merged;
          return merged;
        });
        requestAnimationFrame(() => queuePinToBottom());
        setIsAwaitingReply(false);
        toast({ title: "Odesláno" });
      } else {
        // Keep optimistic visible — user message was saved to DB; realtime will replace it
        setIsAwaitingReply(false);
        toast({ title: "Chyba", description: "Odeslání selhalo", variant: "destructive" });
      }
    } finally {
      sendInFlightRef.current = false;
      setFlyingMessage(null);
    }
  };

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendRef.current();
    }
  }, []);

  const hasDraft = newMessage.trim().length > 0;

  if (!user) {
    return <LoggedOutScreen />;
  }

  return (
    <div className="messages-mobile-fixed-shell om-msg-shell relative overflow-hidden">
      <div className="relative z-10 flex h-full flex-col md:h-[calc(100vh-80px)] max-w-4xl mx-auto">
        {/* Záhlaví – tmavý pruh s Bobem (deska Zprávy) */}
        <div className="shrink-0 px-4 pt-4 pb-3 md:px-6 md:pt-6">
          <div className="om-msg-bar">
            <div className="om-msg-ava">
              <Sparkles className="h-5 w-5" color="#F6D77A" strokeWidth={2.2} aria-hidden="true" />
              <span className="om-msg-dot" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="om-msg-title">Zprávy</h1>
              <p className="text-[11.5px] text-[#A9AAB3]">Bob a podpora OneMil</p>
            </div>
            <span className="om-msg-count">{messages.length} zpráv</span>
          </div>
        </div>

        {/* Messages Container — relative wrapper keeps flex footprint; button overlays scroll area */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleMessagesScroll}
            className="absolute inset-0 overflow-y-auto px-6 pb-4 space-y-4"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(194,144,47, 0.3) transparent',
            }}
          >
          {visibleMessages.length === 0 && !loading && (
            <div
              className="flex flex-col items-center justify-center min-h-full text-center py-6 gap-2.5"
              style={{ animation: 'fade-in 0.5s ease-out' }}
            >
              <img
                src={avatarPhone}
                alt="Avatar píše na telefonu"
                className="om-msg-empty-avatar h-[220px] w-auto object-contain"
              />
              <p className="om-msg-empty-title">Zatím žádné zprávy</p>
              <p className="text-sm text-[#5E5B57]">Napiš nám svou první zprávu</p>
              <div className="mt-1.5 flex flex-wrap justify-center gap-2">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="om-msg-quick"
                    onClick={() => {
                      setNewMessage(q);
                      inputRef.current?.focus();
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <MessagesThreadList
            messages={visibleMessages}
            userName={userName}
            supportSent={supportSent}
            setSupportSent={setSupportSent}
            appendSupportRequestMessage={appendSupportRequestMessage}
            supportHandoffInFlightRef={supportHandoffInFlightRef}
            supportHandoffMessage={supportHandoffMessage}
          />

          {showTypingIndicator && (
            <div className="flex justify-start">
              <div
                className="max-w-[80%] relative overflow-hidden px-[13px] py-[10px] transition-all duration-300"
                style={{
                  background: "linear-gradient(180deg, #FFFFFF, #FDF8EF)",
                  boxShadow: "inset 0 1px 0 #fff, 0 0 0 1px rgba(194,144,47,0.24), 0 6px 14px rgba(60,40,10,0.1)",
                  borderRadius: "18px 18px 18px 4px",
                }}
              >
                <p className="relative z-10 flex items-center gap-1.5 text-[11px] font-extrabold text-[#8A5A10] mb-[3px]">
                  <BobMark size={16} />
                  {AI_ASSISTANT_BOB_LABEL}
                </p>
                <p className="relative z-10 text-[14px] leading-[1.45] text-[#17171B]">
                  <span>{AI_ASSISTANT_TYPING_SUBLINE}</span>
                  <span className="typing-bob-dots" aria-hidden="true">
                    <span className="typing-bob-dot">.</span>
                    <span className="typing-bob-dot">.</span>
                    <span className="typing-bob-dot">.</span>
                  </span>
                </p>
              </div>
            </div>
          )}
          </div>

          {awayFromBottom && (
            <button
              type="button"
              onClick={handleJumpToLatestMessages}
              aria-label={showNewMessagesBelow ? "Nové zprávy" : "Na konec konverzace"}
              className="absolute bottom-4 left-1/2 z-20 flex min-w-[220px] -translate-x-1/2 items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-black shadow-lg transition-[transform,opacity] hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #C2902F 0%, #8A5A10 100%)',
                boxShadow: '0 4px 24px rgba(194,144,47, 0.45)',
                border: '1px solid rgba(194,144,47, 0.5)',
              }}
            >
              <span className="inline-block min-h-[1.25rem] text-center leading-tight">
                {showNewMessagesBelow ? "Nové zprávy ↓" : "↓"}
              </span>
            </button>
          )}
        </div>

        {/* Premium Input Bar */}
        <div className="shrink-0 p-6 pt-4">
          <div className="om-msg-compose">
            <div className="relative flex items-center gap-2">
              {/* Flying message animation */}
              {flyingMessage && (
                <div 
                  className="absolute right-16 bottom-full mb-2 z-50 pointer-events-none"
                  style={{ animation: 'fly-up 0.6s ease-out forwards' }}
                >
                  <div 
                    className="max-w-[200px] px-4 py-2 rounded-xl text-sm font-medium text-black truncate"
                    style={{
                      background: 'linear-gradient(135deg, #C2902F 0%, #8A5A10 100%)',
                      boxShadow: '0 4px 20px rgba(194,144,47, 0.5)',
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
                      <OneMilDiamondIcon
                        className="w-full h-full"
                        color="#E9B949"
                      />
                    </div>
                  ))}
                </div>
              )}

              <span data-testid="bob-state" className="sr-only">{bobEnabled ? "on" : "off"}</span>
              <input
                ref={inputRef}
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Napište zprávu..."
                className="om-msg-field"
              />
              
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !hasDraft}
                aria-label="Odeslat"
                className="om-msg-send"
              >
                <Send className="w-5 h-5 relative z-10 text-[#1A1205]" />
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

        .typing-bob-dots {
          display: inline;
          white-space: nowrap;
        }
        .typing-bob-dot {
          display: inline-block;
          animation: typing-bob-dot-wave 1.05s ease-in-out infinite;
          opacity: 0.35;
        }
        .typing-bob-dot:nth-child(1) { animation-delay: 0ms; }
        .typing-bob-dot:nth-child(2) { animation-delay: 140ms; }
        .typing-bob-dot:nth-child(3) { animation-delay: 280ms; }
        @keyframes typing-bob-dot-wave {
          0%, 65%, 100% { opacity: 0.3; }
          32% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
