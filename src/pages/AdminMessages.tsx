"use client";
// rebuild

import { useCallback, useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { NavigateToLogin } from "@/components/NavigateToLogin";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Star, Building2, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useBobEnabled } from "@/hooks/useBobEnabled";
import { Switch } from "@/components/ui/switch";
import { SUPPORT_REQUEST_MARKER } from "@/constants/supportRequestMarker";

interface Thread {
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  last_message: string;
  last_date: string;
  last_sender: "user" | "admin" | "ai" | null;
  has_unread: boolean;
  /** Open ticket: last row is admin + content exactly SUPPORT REQUEST, no later non-marker admin reply. */
  support_active: boolean;
  /** Time of that exact SUPPORT REQUEST row (ordering). */
  support_active_at: string | null;
  is_influencer: boolean;
  is_partner: boolean;
  role: "user" | "influencer" | "partner";
}

function safePlainTextFromMessageContent(content: unknown): string {
  if (typeof content !== "string") return "";
  const t = content.trim();
  if (!t) return "";
  // If content is a JSON wrapper (ai rows), extract `text` instead of inspecting raw JSON.
  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      const parsed = JSON.parse(t) as { text?: unknown };
      if (parsed && typeof parsed === "object" && typeof parsed.text === "string") {
        return parsed.text.trim();
      }
    } catch {
      // ignore
    }
  }
  return t;
}

export default function AdminMessages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { bobEnabled, setBobEnabledRemote } = useBobEnabled();
  const [bobSaving, setBobSaving] = useState(false);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);

  const handleToggleBob = async (next: boolean) => {
    setBobSaving(true);
    const { error } = await setBobEnabledRemote(next);
    setBobSaving(false);
    if (error) {
      toast({ title: "Chyba", description: "Nepodařilo se přepnout Boba.", variant: "destructive" });
      return;
    }
    toast({ title: next ? "Bob aktivní" : "Bob vypnutý" });
  };

  const loadThreads = useCallback(async () => {
    setLoading(true);

    // Fetch messages
    const { data: messagesData, error: messagesError } = await supabase
      .from("messages")
      .select("user_id, content, created_at, sender, read")
      .order("created_at", { ascending: false });

    if (messagesError) {
      console.error(messagesError);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst zprávy.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Group by user_id (skip messages with null user_id)
    const grouped: Record<string, any[]> = {};
    messagesData?.forEach((msg) => {
      if (msg.user_id == null) return;
      if (!grouped[msg.user_id]) grouped[msg.user_id] = [];
      grouped[msg.user_id].push(msg);
    });

    // Get unique user IDs
    const userIds = Object.keys(grouped);

    // Skip DB queries when no messages (empty .in() causes PostgREST error)
    if (userIds.length === 0) {
      setThreads([]);
      setLoading(false);
      return;
    }

    // Fetch user info and all partners in parallel
    const [usersRes, partnersRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, email, name, first_name, last_name")
        .in("id", userIds),
      supabase
        .from("partners")
        .select("auth_user_id, name, contact_email, notes")
        .in("auth_user_id", userIds),
    ]);

    // Create partner map with role detection
    const partnerMap: Record<string, { name: string | null; email: string | null; isInfluencer: boolean }> = {};
    (partnersRes.data || []).forEach((p) => {
      if (p.auth_user_id) {
        partnerMap[p.auth_user_id] = {
          name: p.name || null,
          email: p.contact_email || null,
          isInfluencer: !!(typeof p.notes === "string" ? p.notes : "").toLowerCase().includes("influencer"),
        };
      }
    });

    // Create a map of user info, using partner data as fallback
    const userMap: Record<string, { email: string | null; name: string | null }> = {};
    usersRes.data?.forEach((user) => {
      const partner = partnerMap[user.id];
      const displayName = (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : null) ||
        user.name || partner?.name || null;
      userMap[user.id] = { email: user.email || partner?.email || null, name: displayName };
    });

    // Also add entries for partner users not in users table
    Object.keys(partnerMap).forEach((uid) => {
      if (!userMap[uid]) {
        userMap[uid] = { name: partnerMap[uid].name, email: partnerMap[uid].email };
      }
    });

    const result: Thread[] = userIds
      .map((uid) => {
      const userMessages = grouped[uid];
      const senderNorm = (s: unknown): Thread["last_sender"] => {
        const v = typeof s === "string" ? s.toLowerCase().trim() : "";
        if (v === "user" || v === "admin" || v === "ai") return v;
        return null;
      };
      // Per-thread “unread” dot: same criterion as global admin badge (useUnreadMessagesCount) — unread marker row only.
      const hasUnread = userMessages.some(
        (msg) =>
          senderNorm(msg?.sender) === "admin" &&
          typeof msg?.content === "string" &&
          msg.content === SUPPORT_REQUEST_MARKER &&
          msg.read === false,
      );

      const isExactSupportRequestRow = (msg: { sender?: unknown; content?: unknown }): boolean =>
        senderNorm(msg?.sender) === "admin" &&
        typeof msg?.content === "string" &&
        msg.content === SUPPORT_REQUEST_MARKER;

      const isAdminNonMarkerReply = (msg: { sender?: unknown; content?: unknown }): boolean =>
        senderNorm(msg?.sender) === "admin" &&
        typeof msg?.content === "string" &&
        msg.content !== SUPPORT_REQUEST_MARKER;

      const markerRows = userMessages.filter(isExactSupportRequestRow);

      const lastMarkerAt = markerRows.length > 0
        ? markerRows.reduce((latest, m) => {
            const t = new Date(m.created_at).getTime();
            return t > new Date(latest).getTime() ? m.created_at : latest;
          }, markerRows[0].created_at)
        : null;

      const supportActive = lastMarkerAt
        ? !userMessages.some((m) => {
            if (!isAdminNonMarkerReply(m)) return false;
            return new Date(m.created_at).getTime() > new Date(lastMarkerAt).getTime();
          })
        : false;

      const lastSender = senderNorm(userMessages[0]?.sender);
      const userInfo = userMap[uid] || { email: null, name: null };
      const partner = partnerMap[uid];
      const isInfluencer = partner?.isInfluencer ?? false;
      const isPartner = !!partner && !isInfluencer;

      return {
        user_id: uid,
        user_email: userInfo.email,
        user_name: userInfo.name,
        last_message: userMessages[0]?.content || "",
        last_date: userMessages[0]?.created_at || "",
        last_sender: lastSender,
        has_unread: hasUnread,
        support_active: supportActive,
        support_active_at: supportActive ? lastMarkerAt : null,
        is_influencer: isInfluencer,
        is_partner: isPartner,
        role: isInfluencer ? "influencer" as const : isPartner ? "partner" as const : "user" as const,
      };
    })
      .filter((t): t is Thread => Boolean(t));

    // Base sort: unread + role weighting, then by date
    const baseSorted = [...result].sort((a, b) => {
      const aScore = (a.has_unread ? 2 : 0) + (a.is_influencer || a.is_partner ? 1 : 0);
      const bScore = (b.has_unread ? 2 : 0) + (b.is_influencer || b.is_partner ? 1 : 0);
      if (aScore !== bScore) return bScore - aScore;
      return new Date(b.last_date).getTime() - new Date(a.last_date).getTime();
    });

    // Open support tickets first (oldest marker first), then everything else.
    const activeSupport = baseSorted
      .filter((t) => t.support_active)
      .sort((a, b) => {
        const at = a.support_active_at ?? a.last_date;
        const bt = b.support_active_at ?? b.last_date;
        return new Date(at).getTime() - new Date(bt).getTime();
      });
    const others = baseSorted.filter((t) => !t.support_active);

    setThreads([...activeSupport, ...others]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user || !isAdmin || roleLoading) return;

    loadThreads();

    const channel = supabase
      .channel("admin-message-thread-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        loadThreads();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user, isAdmin, roleLoading, loadThreads]);

  if (!user) return <NavigateToLogin />;
  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col p-6 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-foreground">Zprávy uživatelů</h2>
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-2 ${
            bobEnabled
              ? "border-border/50 bg-card/60"
              : "border-[hsl(35,90%,55%,0.5)] bg-[hsl(35,90%,12%)]"
          }`}
          data-testid="admin-bob-toggle"
        >
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground" data-testid="admin-bob-status">
              {bobEnabled ? "Bob aktivní" : "Bob vypnutý"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {bobEnabled
                ? "AI odpovídá zákazníkům"
                : "Zprávy jdou přímo adminovi"}
            </span>
          </div>
          <Switch
            checked={bobEnabled}
            disabled={bobSaving}
            onCheckedChange={handleToggleBob}
            aria-label="Přepnout Boba"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Načítání…</p>
      ) : threads.length === 0 ? (
        <p className="text-muted-foreground">Žádné zprávy.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {threads.map((thread) => {
            const isSpecial = thread.is_influencer || thread.is_partner;
            const isSpecialUnread = isSpecial && thread.has_unread;
            const isSpecialRead = isSpecial && !thread.has_unread;
            const isUserUnread = !isSpecial && thread.has_unread;
            const isSupportRed = thread.support_active && thread.last_sender === "user";
            const isActiveChatOrange = !isSupportRed && thread.last_sender === "user";
            const showUnreadIndicator = thread.has_unread;

            return (
              <div
                key={thread.user_id}
                data-testid={`admin-thread-${thread.user_id}`}
                onClick={() => navigate(`/admin/messages/${thread.user_id}`)}
                className={`
                  relative rounded-2xl cursor-pointer 
                  transition-all duration-200 ease-in-out
                  hover:scale-[1.02] hover:shadow-xl
                  ${isSupportRed
                    ? "p-[2px] bg-gradient-to-br from-destructive/70 to-destructive/20 shadow-md shadow-destructive/20"
                    : isActiveChatOrange
                    ? "p-[2px] bg-gradient-to-br from-[hsl(35,90%,55%,0.55)] to-[hsl(30,85%,45%,0.18)] shadow-md shadow-[hsl(35,90%,45%,0.12)]"
                    : thread.is_influencer && isSpecialUnread
                    ? "p-[2px] bg-gradient-to-br from-[hsl(280,70%,55%)] to-[hsl(300,60%,45%)] shadow-lg shadow-[hsl(280,60%,50%,0.3)]"
                    : thread.is_partner && isSpecialUnread
                      ? "p-[2px] bg-gradient-to-br from-[hsl(200,70%,50%)] to-[hsl(210,60%,40%)] shadow-lg shadow-[hsl(200,60%,50%,0.3)]"
                      : thread.is_influencer && isSpecialRead
                        ? "p-[2px] bg-gradient-to-br from-[hsl(280,40%,35%)] to-[hsl(280,30%,25%)] shadow-md"
                        : thread.is_partner && isSpecialRead
                          ? "p-[2px] bg-gradient-to-br from-[hsl(200,40%,30%)] to-[hsl(200,30%,22%)] shadow-md"
                          : isUserUnread
                            ? "p-[2px] bg-gradient-to-br from-destructive/60 to-destructive/30 shadow-md shadow-destructive/15"
                            : "p-0 border border-border/30 shadow-sm"
                  }
                `}
              >
                <div className={`
                  rounded-[14px] p-4 h-full
                  ${isSupportRed
                    ? "bg-destructive/10"
                    : isActiveChatOrange
                    ? "bg-[hsl(35,70%,12%)]"
                    : thread.is_influencer && isSpecialUnread
                    ? "bg-[hsl(280,40%,12%)]"
                    : thread.is_partner && isSpecialUnread
                      ? "bg-[hsl(200,35%,12%)]"
                      : thread.is_influencer && isSpecialRead
                        ? "bg-[hsl(280,25%,10%)]"
                        : thread.is_partner && isSpecialRead
                          ? "bg-[hsl(200,20%,10%)]"
                          : isUserUnread
                            ? "bg-destructive/10"
                            : "bg-card/60 hover:bg-accent/30"
                  }
                `}>
                  {/* Unread dot */}
                  {showUnreadIndicator && (
                    <div className={`absolute top-3 right-3 w-3 h-3 rounded-full animate-pulse ring-2 ${
                      isSupportRed
                        ? "bg-destructive ring-destructive/40"
                        : thread.is_influencer
                        ? "bg-[hsl(280,70%,60%)] ring-[hsl(280,70%,60%,0.4)]"
                        : thread.is_partner
                          ? "bg-[hsl(200,70%,55%)] ring-[hsl(200,70%,55%,0.4)]"
                          : "bg-destructive ring-destructive/40"
                    }`} />
                  )}

                  {/* Role badge */}
                  {thread.is_influencer && (
                    <div className="mb-2">
                      <Badge className="bg-[hsl(280,50%,45%)] text-white border-[hsl(280,60%,55%,0.3)] text-[10px] uppercase tracking-wider gap-1">
                        <Star className="w-3 h-3" />
                        Affiliate partner
                      </Badge>
                    </div>
                  )}
                  {thread.is_partner && (
                    <div className="mb-2">
                      <Badge className="bg-[hsl(200,60%,40%)] text-white border-[hsl(200,70%,50%,0.3)] text-[10px] uppercase tracking-wider gap-1">
                        <Building2 className="w-3 h-3" />
                        Partner
                      </Badge>
                    </div>
                  )}
                  {isSupportRed && (
                    <div className="mb-2">
                      <Badge className="bg-destructive text-white border-destructive/40 text-[10px] uppercase tracking-wider">
                        Support
                      </Badge>
                    </div>
                  )}

                  <p
                    className={`text-[11px] font-medium mb-2 ${
                      thread.last_sender === "user" ? "text-[hsl(35,90%,70%)]" : "text-muted-foreground/70"
                    }`}
                  >
                    {thread.last_sender === "user" ? "Čeká na odpověď" : "Vyřešeno"}
                  </p>
                  
                  {/* Sender */}
                  <p className={`font-semibold text-sm truncate ${isSpecial ? "pr-2" : "pr-6"} ${
                    thread.is_influencer && isSpecialUnread ? "text-[hsl(280,80%,85%)]"
                      : thread.is_partner && isSpecialUnread ? "text-[hsl(200,80%,85%)]"
                        : isSpecialRead ? "text-muted-foreground"
                          : isUserUnread ? "text-foreground"
                            : "text-muted-foreground"
                  }`}>
                    {thread.user_name || thread.user_email || `${thread.user_id.slice(0, 8)}…`}
                  </p>

                  {/* Email subtitle */}
                  {thread.user_email && thread.user_name && (
                    <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{thread.user_email}</p>
                  )}
                  
                  {/* Last message */}
                  <p className={`text-sm mt-2 line-clamp-2 min-h-[2.5rem] ${
                    thread.has_unread ? "text-muted-foreground" : "text-muted-foreground/50"
                  }`}>
                    {thread.last_message}
                  </p>
                  
                  {/* Timestamp */}
                  <p className={`text-xs mt-3 font-medium ${
                    thread.has_unread ? "text-muted-foreground/70" : "text-muted-foreground/40"
                  }`}>
                    {new Date(thread.last_date).toLocaleString("cs-CZ", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
