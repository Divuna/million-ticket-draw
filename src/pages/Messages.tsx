import { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import type { CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { capAfterTailGrowth, CHAT_PAGE_SIZE } from "@/lib/chatMessagesStateCap";
import {
  AI_ASSISTANT_BOB_LABEL,
  AI_ASSISTANT_TYPING_SUBLINE,
} from "@/constants/messagesUi";
import { MessageCircle, Send, Sparkles } from "lucide-react";

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

type AiTypingRevealTextProps = {
  targetText: string;
  /** True while the tail AI row is receiving server chunks (`streamingAiMessageId`). */
  enabled: boolean;
  className: string;
};

/** How many characters to reveal this tick (prefix of `target` after `visible`). */
function nextTypingRevealStep(visible: string, target: string): number {
  if (!target.startsWith(visible)) return 0;
  const rest = target.slice(visible.length);
  const behind = rest.length;
  if (behind === 0) return 0;
  if (behind > 260) {
    const m = /^(\S+\s*)/.exec(rest);
    return m ? m[0].length : Math.min(6, behind);
  }
  if (behind > 120) {
    const m = /^(\S+\s*)/.exec(rest);
    if (m && m[0].length <= 36) return m[0].length;
    return Math.min(3, behind);
  }
  if (behind > 45) return 2;
  return 1;
}

function typingTickDelayMs(behind: number): number {
  if (behind > 220) return 14;
  if (behind > 100) return 20;
  if (behind > 40) return 26;
  return 32;
}

/**
 * Frontend-only typing: advances toward `targetText` on a timer so large realtime payloads
 * still appear progressively (words when far behind, chars when close). Final text matches server when `enabled` flips false.
 */
function AiTypingRevealText({ targetText, enabled, className }: AiTypingRevealTextProps) {
  const [visible, setVisible] = useState(() => (enabled ? "" : targetText));

  useEffect(() => {
    if (!enabled) {
      setVisible(targetText);
      return;
    }
    setVisible((v) => {
      if (targetText.length < v.length) return targetText;
      if (!targetText.startsWith(v)) return targetText;
      return v;
    });
  }, [enabled, targetText]);

  useEffect(() => {
    if (!enabled) return;
    if (visible.length >= targetText.length) return;
    if (!targetText.startsWith(visible)) return;

    const behind = targetText.length - visible.length;
    const delayMs = typingTickDelayMs(behind);

    const id = window.setTimeout(() => {
      setVisible((v) => {
        if (v.length >= targetText.length) return v;
        if (!targetText.startsWith(v)) return targetText;
        const step = nextTypingRevealStep(v, targetText);
        if (step <= 0) return targetText;
        return targetText.slice(0, v.length + step);
      });
    }, delayMs);

    return () => clearTimeout(id);
  }, [enabled, targetText, visible]);

  return <p className={className}>{visible}</p>;
}

/** Stable background particles — avoid Math.random() on every parent re-render (typing) → forced reflow. */
const BACKGROUND_PARTICLE_COUNT = 20;
function buildBackgroundParticles(): Array<{
  id: number;
  hueBoost: number;
  leftPct: number;
  topPct: number;
  durationS: number;
  delayS: number;
}> {
  return Array.from({ length: BACKGROUND_PARTICLE_COUNT }, (_, i) => ({
    id: i,
    hueBoost: 50 + ((i * 17) % 20),
    leftPct: ((i * 37) % 100) + (i % 7) * 0.3,
    topPct: ((i * 53) % 100) + (i % 5) * 0.4,
    durationS: 8 + (i % 12) + (i % 3) * 0.5,
    delayS: ((i * 1.1) % 5) * 0.4,
  }));
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
  sender: "user" | "admin" | "ai";
  content: string;
  read: boolean;
  created_at: string;
}

const OPTIMISTIC_MESSAGE_ID_PREFIX = "optimistic-";

function sortMessagesAsc(a: Message, b: Message): number {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
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

/** True when thread UI would look the same — ignores `read` so bulk mark-read does not re-render. */
function messageRowDisplayUnchanged(a: Message, b: Message): boolean {
  return (
    a.id === b.id &&
    a.user_id === b.user_id &&
    a.sender === b.sender &&
    a.content === b.content &&
    a.created_at === b.created_at
  );
}

/** In a single realtime batch, keep only the last UPDATE per row id (earlier ones are redundant). */
function squashEarlierDuplicateUpdates(
  batch: RealtimePostgresChangesPayload<Message>[],
): RealtimePostgresChangesPayload<Message>[] {
  const lastIndexById = new Map<string, number>();
  for (let i = 0; i < batch.length; i++) {
    const p = batch[i];
    if (p.eventType === "UPDATE" && p.new) {
      lastIndexById.set(String((p.new as Message).id), i);
    }
  }
  return batch.filter((p, i) => {
    if (p.eventType !== "UPDATE" || !p.new) return true;
    const id = String((p.new as Message).id);
    return lastIndexById.get(id) === i;
  });
}

function mergeMessagesFromRealtime(
  prev: Message[],
  payload: RealtimePostgresChangesPayload<Message>,
): Message[] {
  let next: Message[];

  if (payload.eventType === "INSERT" && payload.new) {
    const row = payload.new as Message;
    if (prev.some((m) => m.id === row.id)) {
      next = prev;
    } else if (row.sender === "user") {
      let replaced = false;
      next = prev;
      for (let i = prev.length - 1; i >= 0; i--) {
        const m = prev[i];
        if (
          m.id.startsWith(OPTIMISTIC_MESSAGE_ID_PREFIX) &&
          m.sender === "user" &&
          m.content === row.content
        ) {
          const nextRows = [...prev];
          nextRows[i] = row;
          next = nextRows.sort(sortMessagesAsc);
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        next = [...prev, row].sort(sortMessagesAsc);
      }
    } else {
      next = [...prev, row].sort(sortMessagesAsc);
    }
  } else if (payload.eventType === "UPDATE" && payload.new) {
    const row = payload.new as Message;
    const idx = prev.findIndex((m) => m.id === row.id);
    if (idx === -1) {
      // Not in the visible window — ignore (e.g. mark-read on older rows)
      next = prev;
    } else if (messageRowDisplayUnchanged(prev[idx], row)) {
      next = prev;
    } else {
      next = prev.map((m) => (m.id === row.id ? row : m));
    }
  } else if (payload.eventType === "DELETE" && payload.old) {
    const id = String((payload.old as { id: string }).id);
    if (!prev.some((m) => m.id === id)) {
      next = prev;
    } else {
      next = prev.filter((m) => m.id !== id);
    }
  } else {
    next = prev;
  }

  return next;
}

type MessageThreadItemProps = {
  msg: Message;
  index: number;
  userName: string;
  /** Tail AI row actively streaming (hide CTA + typing-style text reveal). */
  tailAiStreamActive: boolean;
  onSupportCtaClick: () => void;
};

const MessageThreadItem = memo(
  function MessageThreadItem({ msg, index, userName, tailAiStreamActive, onSupportCtaClick }: MessageThreadItemProps) {
  const navigate = useNavigate();
  const parsed = parseMessageContent(msg.content);
  const displayText = parsed.text;
  const cta = parsed.cta;
  const isSystemMessage = displayText.includes("🎉") || displayText.includes("zákonný zástupce");
  const senderNormalized = (msg.sender || "").toLowerCase().trim();
  const isUserMessage = senderNormalized === "user";
  const isAiMessage = senderNormalized === "ai";
  const senderLabel =
    msg.sender === "ai"
      ? AI_ASSISTANT_BOB_LABEL
      : msg.sender === "admin"
        ? "Podpora"
        : null;

  const bubbleStyle: CSSProperties = isUserMessage
    ? {
        background: "linear-gradient(135deg, #1FAF6D 0%, #169B5C 100%)",
        border: "1px solid rgba(34, 197, 94, 0.6)",
        boxShadow: "0 6px 25px rgba(34, 197, 94, 0.35)",
      }
    : isAiMessage
      ? {
          background: "linear-gradient(135deg, hsl(260, 60%, 18%) 0%, hsl(280, 65%, 14%) 100%)",
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
        className={`max-w-[75%] relative overflow-hidden rounded-2xl p-4 hover:scale-[1.01] ${
          isAiMessage
            ? "transition-[transform,opacity] duration-150 [contain:layout]"
            : "transition-all duration-300"
        }`}
        style={bubbleStyle}
      >
        {isUserMessage && (
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: "linear-gradient(90deg, transparent 0%, rgba(34, 197, 94, 0.5) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 3s ease-in-out infinite",
            }}
          />
        )}

        {isSystemMessage && !isUserMessage && (
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-[hsl(35,70%,55%)]" />
            <span
              className="text-xs font-semibold"
              style={{
                background: "linear-gradient(90deg, hsl(35, 70%, 55%) 0%, hsl(45, 80%, 60%) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Systémová zpráva
            </span>
          </div>
        )}

        {!isSystemMessage && senderLabel && (
          <p className="relative z-10 text-xs font-semibold text-gray-400 mb-1">{senderLabel}</p>
        )}

        {isUserMessage && (
          <p className="relative z-10 text-xs font-semibold text-white/70 mb-1">{userName}</p>
        )}

        {isAiMessage && !isSystemMessage ? (
          <AiTypingRevealText
            targetText={displayText}
            enabled={tailAiStreamActive}
            className={`relative z-10 text-[15px] leading-relaxed whitespace-pre-wrap break-words text-gray-100`}
          />
        ) : (
          <p
            className={`relative z-10 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
              isUserMessage ? "text-white font-medium" : "text-gray-100"
            }`}
          >
            {displayText}
          </p>
        )}

        {cta && !(isAiMessage && tailAiStreamActive) && (
          <button
            type="button"
            onClick={async (e) => {
              console.log("CTA CLICK", cta);
              e.preventDefault();
              e.stopPropagation();
              if (cta.action.startsWith("http")) {
                window.open(cta.action, "_blank", "noopener");
              } else {
                if (cta.action === "/messages") {
                  await onSupportCtaClick();
                  return;
                }
                navigate(cta.action);
              }
            }}
            className="relative z-10 mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, hsl(45, 80%, 45%) 0%, hsl(35, 90%, 38%) 100%)",
              color: "hsl(220, 20%, 8%)",
              boxShadow: "0 4px 12px hsl(45, 80%, 40%, 0.3)",
              border: "1px solid hsl(45, 70%, 50%, 0.4)",
              pointerEvents: "auto",
              position: "relative",
              zIndex: 50,
            }}
          >
            {cta.label}
          </button>
        )}

        <p
          className={`relative z-10 text-xs mt-2 ${
            isUserMessage ? "text-white/50" : "text-gray-500"
          }`}
        >
          {timeLabel}
        </p>
      </div>
    </div>
  );
},
  (prev, next) =>
    prev.msg.id === next.msg.id &&
    prev.msg.sender === next.msg.sender &&
    prev.msg.created_at === next.msg.created_at &&
    prev.msg.content === next.msg.content &&
    prev.userName === next.userName &&
    prev.index === next.index &&
    prev.tailAiStreamActive === next.tailAiStreamActive,
);

/** Hide empty tail AI placeholder while typing line is shown (same insert, first chunk not yet). */
function filterMessagesForDisplay(
  rows: Message[],
  showTypingIndicator: boolean,
): Message[] {
  if (rows.length === 0) return rows;
  const last = rows[rows.length - 1]!;
  if (
    showTypingIndicator &&
    last.sender === "ai" &&
    !parseMessageContent(last.content).text.trim()
  ) {
    return rows.filter((m) => m.id !== last.id);
  }
  return rows;
}

type MessagesThreadListProps = {
  messages: Message[];
  userName: string;
  streamingAiMessageId: string | null;
  showTypingIndicator: boolean;
  onSupportCtaClick: () => void;
};

const MessagesThreadList = memo(function MessagesThreadList({
  messages,
  userName,
  streamingAiMessageId,
  showTypingIndicator,
  onSupportCtaClick,
}: MessagesThreadListProps) {
  const visible = useMemo(
    () => filterMessagesForDisplay(messages, showTypingIndicator),
    [messages, showTypingIndicator],
  );
  return (
    <>
      {visible.map((msg, index) => (
        <MessageThreadItem
          key={msg.id}
          msg={msg}
          index={index}
          userName={userName}
          tailAiStreamActive={streamingAiMessageId !== null && streamingAiMessageId === msg.id}
          onSupportCtaClick={onSupportCtaClick}
        />
      ))}
    </>
  );
});

export default function MessagesPage() {
  const { user } = useAuth();
  const { sendMessageToAdmin } = useMessages();
  const { refresh: refreshUnreadCount } = useUnreadMessagesCount();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [newMessage, setNewMessage] = useState("");
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
  const streamSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supportHandoffInFlightRef = useRef(false);
  const prevTailAiStreamRef = useRef<{ id: string; content: string } | null>(null);
  const skipTailAiStreamDebounceRef = useRef(true);
  const hasMoreOlderRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const currentUserIdRef = useRef<string | undefined>(undefined);
  const backgroundParticles = useMemo(() => buildBackgroundParticles(), []);

  messagesRef.current = messages;
  currentUserIdRef.current = user?.id;

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
    skipTailAiStreamDebounceRef.current = true;
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

    if (pinnedToBottomRef.current) {
      setShowNewMessagesBelow(false);
      queuePinToBottom();
      return;
    }

    const el = scrollRef.current;
    const dist = el ? chatScrollDistanceFromBottom(el) : Infinity;
    setShowNewMessagesBelow(dist > CHAT_NEW_MESSAGES_INDICATOR_MIN_OFFSET_PX);
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
    const rows = data ? [...data].reverse() : [];
    setMessages(rows);
    const more = (data?.length ?? 0) === CHAT_PAGE_SIZE;
    setHasMoreOlder(more);
    hasMoreOlderRef.current = more;
    setLoading(false);
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
      const blockAsc = [...page].reverse().filter((m) => !prevIds.has(m.id));
      return [...blockAsc, ...current];
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

  useEffect(() => {
    if (!user?.id) return;

    void (async () => {
      await loadMessages();
      // Let the loaded thread paint once before bulk mark-read UPDATEs hit realtime.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      await markAdminMessagesAsRead();
      refreshUnreadCount();
    })();
  }, [user?.id, loadMessages, markAdminMessagesAsRead, refreshUnreadCount]);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;

    const pending: RealtimePostgresChangesPayload<Message>[] = [];
    let rafId: number | null = null;

    const flush = () => {
      rafId = null;
      if (pending.length === 0) return;
      const raw = pending.splice(0, pending.length);
      const batch = squashEarlierDuplicateUpdates(raw);
      setMessages((prev) => {
        const beforeLen = prev.length;
        let next = prev;
        for (const payload of batch) {
          next = mergeMessagesFromRealtime(next, payload);
        }
        return capAfterTailGrowth(beforeLen, next);
      });
    };

    const channel = supabase
      .channel(`messages-thread-pg:${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${uid}` },
        (payload) => {
          pending.push(payload as RealtimePostgresChangesPayload<Message>);
          if (rafId == null) {
            rafId = requestAnimationFrame(flush);
          }
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      if (rafId != null) cancelAnimationFrame(rafId);
      pending.length = 0;
    };
  }, [user?.id]);

  const lastUserMessageTs = useMemo(
    () => (lastUserMessageAt ? new Date(lastUserMessageAt).getTime() : 0),
    [lastUserMessageAt],
  );

  const hasRenderableAiOrAdminReply = useMemo(() => {
    return messages.some((msg) => {
      if (new Date(msg.created_at).getTime() < lastUserMessageTs) return false;
      if (msg.sender === "admin") return true;
      if (msg.sender === "ai") {
        return parseMessageContent(msg.content).text.trim().length > 0;
      }
      return false;
    });
  }, [messages, lastUserMessageTs]);

  const showTypingIndicator = isAwaitingReply && !hasRenderableAiOrAdminReply;

  const handleSupportCtaClick = useCallback(async () => {
    if (supportHandoffInFlightRef.current) return;
    supportHandoffInFlightRef.current = true;
    try {
      const lastUser = [...messagesRef.current].reverse().find((m) => m.sender === "user");
      const message = typeof lastUser?.content === "string" ? lastUser.content : "";
      await supabase.functions.invoke("support-handoff", {
        body: { message },
      });
      await loadMessages();
    } catch {
      toast({
        title: "Chyba",
        description: "Nepodařilo se předat dotaz podpoře",
        variant: "destructive",
      });
    } finally {
      supportHandoffInFlightRef.current = false;
    }
  }, [loadMessages]);

  useEffect(() => {
    if (hasRenderableAiOrAdminReply) {
      setIsAwaitingReply(false);
    }
  }, [hasRenderableAiOrAdminReply]);

  /** After last realtime burst, treat tail AI row as finalized → show CTA. */
  const AI_STREAM_SETTLE_MS = 700;
  const [streamingAiMessageId, setStreamingAiMessageId] = useState<string | null>(null);

  const tailStreamSignature = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last) return "";
    return `${last.sender}:${last.id}:${last.content}`;
  }, [messages]);

  useEffect(() => {
    const clearTimer = () => {
      if (streamSettleTimerRef.current) {
        clearTimeout(streamSettleTimerRef.current);
        streamSettleTimerRef.current = null;
      }
    };

    const rows = messagesRef.current;
    if (rows.length === 0) {
      clearTimer();
      prevTailAiStreamRef.current = null;
      skipTailAiStreamDebounceRef.current = true;
      setStreamingAiMessageId(null);
      return;
    }

    const last = rows[rows.length - 1]!;

    if (skipTailAiStreamDebounceRef.current) {
      skipTailAiStreamDebounceRef.current = false;
      clearTimer();
      if (last.sender === "ai") {
        prevTailAiStreamRef.current = { id: last.id, content: last.content };
      } else {
        prevTailAiStreamRef.current = null;
      }
      setStreamingAiMessageId(null);
      return;
    }

    if (last.sender !== "ai") {
      clearTimer();
      prevTailAiStreamRef.current = null;
      setStreamingAiMessageId(null);
      return;
    }

    const prev = prevTailAiStreamRef.current;
    const contentChanged = !prev || prev.id !== last.id || prev.content !== last.content;
    prevTailAiStreamRef.current = { id: last.id, content: last.content };

    if (!contentChanged) {
      return;
    }

    clearTimer();
    setStreamingAiMessageId(last.id);
    streamSettleTimerRef.current = setTimeout(() => {
      streamSettleTimerRef.current = null;
      setStreamingAiMessageId(null);
    }, AI_STREAM_SETTLE_MS);
  }, [tailStreamSignature]);

  useEffect(
    () => () => {
      if (streamSettleTimerRef.current) {
        clearTimeout(streamSettleTimerRef.current);
        streamSettleTimerRef.current = null;
      }
    },
    [],
  );

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

  /** Send pipeline (button / Enter). No loadMessages here — inserts merge via postgres_changes only (+ optimistic). */
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
      setMessages((prev) => capAfterTailGrowth(prev.length, [...prev, optimisticMessage]));
      setLastUserMessageAt(optimisticCreatedAt);
      setIsAwaitingReply(true);
    });

    setFlyingMessage({ id: Date.now(), content: messageContent });
    createSparkles();
    setNewMessage("");

    try {
      const inserted = await sendMessageToAdmin(messageContent);

      if (inserted) {
        setLastUserMessageAt(inserted.created_at);
        toast({ title: "Odesláno" });
      } else {
        setMessages((prev) =>
          capAfterTailGrowth(prev.length, prev.filter((msg) => msg.id !== optimisticId)),
        );
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
  const sendButtonSurface = useMemo(
    () =>
      hasDraft
        ? {
            background: "linear-gradient(135deg, hsl(45, 80%, 45%) 0%, hsl(35, 90%, 35%) 100%)",
            boxShadow: "0 4px 20px hsl(45, 80%, 40%, 0.4)",
            border: "1px solid hsl(45, 70%, 50%, 0.3)",
          }
        : {
            background: "linear-gradient(135deg, hsl(220, 25%, 15%) 0%, hsl(220, 30%, 20%) 100%)",
            boxShadow: "none",
            border: "1px solid hsl(220, 20%, 25%)",
          },
    [hasDraft],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(220,20%,4%)] via-[hsl(220,25%,6%)] to-[hsl(220,20%,4%)] relative overflow-hidden">
      {/* Premium floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {backgroundParticles.map((p) => (
          <div
            key={p.id}
            className="absolute w-1 h-1 rounded-full opacity-20"
            style={{
              background: `radial-gradient(circle, hsl(45, 93%, ${p.hueBoost}%) 0%, transparent 70%)`,
              left: `${p.leftPct}%`,
              top: `${p.topPct}%`,
              animation: `float ${p.durationS}s ease-in-out infinite`,
              animationDelay: `${p.delayS}s`,
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

        {/* Messages Container — relative wrapper keeps flex footprint; button overlays scroll area */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={handleMessagesScroll}
            className="absolute inset-0 overflow-y-auto px-6 pb-4 space-y-4"
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

          <MessagesThreadList
            messages={messages}
            userName={userName}
            streamingAiMessageId={streamingAiMessageId}
            showTypingIndicator={showTypingIndicator}
            onSupportCtaClick={handleSupportCtaClick}
          />

          {showTypingIndicator && (
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
                background: 'linear-gradient(135deg, hsl(45, 80%, 50%) 0%, hsl(35, 90%, 42%) 100%)',
                boxShadow: '0 4px 24px hsl(45, 80%, 40%, 0.45)',
                border: '1px solid hsl(45, 70%, 55%, 0.5)',
              }}
            >
              <span className="inline-block min-h-[1.25rem] text-center leading-tight">
                {showNewMessagesBelow ? "Nové zprávy ↓" : "↓"}
              </span>
            </button>
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
                onChange={(e) => {
                  setNewMessage(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Napište zprávu..."
                className="flex-1 bg-[hsl(220,25%,10%)] text-gray-100 p-4 rounded-xl border border-[hsl(220,20%,20%)] focus:border-[hsl(45,70%,50%)]/50 focus:ring-2 focus:ring-[hsl(45,70%,50%)]/20 transition-all duration-300 placeholder:text-gray-500 text-[15px] disabled:opacity-50"
                style={{
                  boxShadow: 'inset 0 2px 4px hsl(0, 0%, 0%, 0.2)',
                }}
              />
              
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !hasDraft}
                className="relative overflow-hidden p-4 rounded-xl transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                style={sendButtonSurface}
              >
                {/* Button shimmer */}
                {hasDraft && (
                  <div 
                    className="absolute inset-0 opacity-30"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, hsl(45, 93%, 70%) 50%, transparent 100%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 2s ease-in-out infinite',
                    }}
                  />
                )}
                <Send
                  className={`w-5 h-5 relative z-10 transition-transform ${hasDraft ? "text-black" : "text-gray-500"}`}
                />
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
