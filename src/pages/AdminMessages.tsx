"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Star, Building2, User } from "lucide-react";

interface Thread {
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  last_message: string;
  last_date: string;
  has_unread: boolean;
  is_influencer: boolean;
  is_partner: boolean;
  role: "user" | "influencer" | "partner";
}

export default function AdminMessages() {
  const navigate = useNavigate();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);

  const loadThreads = async () => {
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

    // Group by user_id
    const grouped: Record<string, any[]> = {};
    messagesData?.forEach((msg) => {
      if (!grouped[msg.user_id]) grouped[msg.user_id] = [];
      grouped[msg.user_id].push(msg);
    });

    // Get unique user IDs
    const userIds = Object.keys(grouped);

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
          isInfluencer: !!p.notes?.toLowerCase().includes("influencer"),
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

    const result: Thread[] = userIds.map((uid) => {
      const userMessages = grouped[uid];
      const hasUnread = userMessages.some((msg) => msg.sender === "user" && !msg.read);
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
        has_unread: hasUnread,
        is_influencer: isInfluencer,
        is_partner: isPartner,
        role: isInfluencer ? "influencer" as const : isPartner ? "partner" as const : "user" as const,
      };
    });

    // Sort: influencer/partner+unread → unread → influencer/partner+read → read, then by date
    result.sort((a, b) => {
      const aScore = (a.has_unread ? 2 : 0) + (a.is_influencer || a.is_partner ? 1 : 0);
      const bScore = (b.has_unread ? 2 : 0) + (b.is_influencer || b.is_partner ? 1 : 0);
      if (aScore !== bScore) return bScore - aScore;
      return new Date(b.last_date).getTime() - new Date(a.last_date).getTime();
    });

    setThreads(result);
    setLoading(false);
  };

  useEffect(() => {
    loadThreads();

    const channel = supabase
      .channel("admin-message-thread-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadThreads())
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return (
    <div className="flex flex-col p-6 gap-6 h-full pb-24">
      <h2 className="text-xl font-bold text-foreground">Zprávy uživatelů</h2>

      {loading ? (
        <p className="text-muted-foreground">Načítání…</p>
      ) : threads.length === 0 ? (
        <p className="text-muted-foreground">Zatím žádné zprávy.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {threads.map((thread) => {
            const isSpecial = thread.is_influencer || thread.is_partner;
            const isSpecialUnread = isSpecial && thread.has_unread;
            const isSpecialRead = isSpecial && !thread.has_unread;
            const isUserUnread = !isSpecial && thread.has_unread;

            return (
              <div
                key={thread.user_id}
                onClick={() => navigate(`/admin/messages/${thread.user_id}`)}
                className={`
                  relative rounded-2xl cursor-pointer 
                  transition-all duration-200 ease-in-out
                  hover:scale-[1.02] hover:shadow-xl
                  ${thread.is_influencer && isSpecialUnread
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
                  ${thread.is_influencer && isSpecialUnread
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
                  {thread.has_unread && (
                    <div className={`absolute top-3 right-3 w-3 h-3 rounded-full animate-pulse ring-2 ${
                      thread.is_influencer
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
                        Influencer
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
