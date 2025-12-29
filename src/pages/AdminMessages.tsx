"use client";

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Thread {
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  last_message: string;
  last_date: string;
  has_unread: boolean;
}

export default function AdminMessages() {
  const navigate = useNavigate();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);

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

    // Group by user_id
    const grouped: Record<string, any[]> = {};
    messagesData?.forEach((msg) => {
      if (!grouped[msg.user_id]) grouped[msg.user_id] = [];
      grouped[msg.user_id].push(msg);
    });

    // Get unique user IDs
    const userIds = Object.keys(grouped);

    // Fetch user info for all users
    const { data: usersData } = await supabase
      .from("users")
      .select("id, email, name, first_name, last_name")
      .in("id", userIds);

    // Create a map of user info
    const userMap: Record<string, { email: string | null; name: string | null }> = {};
    usersData?.forEach((user) => {
      const displayName = user.name || 
        (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : null) ||
        user.first_name || null;
      userMap[user.id] = { email: user.email, name: displayName };
    });

    const result: Thread[] = userIds.map((uid) => {
      const userMessages = grouped[uid];
      const hasUnread = userMessages.some((msg) => msg.sender === "user" && !msg.read);
      const userInfo = userMap[uid] || { email: null, name: null };
      
      return {
        user_id: uid,
        user_email: userInfo.email,
        user_name: userInfo.name,
        last_message: userMessages[0]?.content || "",
        last_date: userMessages[0]?.created_at || "",
        has_unread: hasUnread,
      };
    });

    // Sort by last_date DESC
    result.sort((a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime());

    setThreads(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadThreads();

    const channel = supabase
      .channel("admin-messages-list-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => loadThreads()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        () => loadThreads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadThreads]);

  return (
    <div className="flex flex-col p-6 gap-6 h-full pb-24">
      <h2 className="text-xl font-bold text-foreground">Zprávy uživatelů</h2>

      {loading ? (
        <p className="text-muted-foreground">Načítání…</p>
      ) : threads.length === 0 ? (
        <p className="text-muted-foreground">Zatím žádné zprávy.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {threads.map((thread) => (
            <div
              key={thread.user_id}
              onClick={() => navigate(`/admin/messages/${thread.user_id}`)}
              className={`
                relative p-4 rounded-2xl cursor-pointer 
                transition-all duration-200 ease-in-out
                hover:scale-[1.02] hover:shadow-xl
                ${thread.has_unread 
                  ? "bg-destructive/10 border-2 border-destructive/40 shadow-md shadow-destructive/10" 
                  : "bg-card border border-border/50 shadow-md hover:bg-accent/50"
                }
              `}
            >
              {/* Unread red dot */}
              {thread.has_unread && (
                <div className="absolute top-3 right-3 w-3 h-3 bg-destructive rounded-full animate-pulse" />
              )}
              
              {/* Sender / User name or email */}
              <p className="text-foreground font-semibold text-sm truncate pr-6">
                {thread.user_name || thread.user_email || `${thread.user_id.slice(0, 8)}…`}
              </p>
              
              {/* Last message preview */}
              <p className="text-muted-foreground text-sm mt-2 line-clamp-2 min-h-[2.5rem]">
                {thread.last_message}
              </p>
              
              {/* Timestamp */}
              <p className="text-muted-foreground/70 text-xs mt-3 font-medium">
                {new Date(thread.last_date).toLocaleString("cs-CZ", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
