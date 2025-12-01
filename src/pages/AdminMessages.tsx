"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Thread {
  user_id: string;
  last_message: string;
  last_date: string;
  has_unread: boolean;
}

export default function AdminMessages() {
  const navigate = useNavigate();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);

  const loadThreads = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("user_id, content, created_at, sender, read")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
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
    data?.forEach((msg) => {
      if (!grouped[msg.user_id]) grouped[msg.user_id] = [];
      grouped[msg.user_id].push(msg);
    });

    const result = Object.keys(grouped).map((uid) => {
      const userMessages = grouped[uid];
      const hasUnread = userMessages.some((msg) => msg.sender === "user" && !msg.read);
      
      return {
        user_id: uid,
        last_message: userMessages[0]?.content || "",
        last_date: userMessages[0]?.created_at || "",
        has_unread: hasUnread,
      };
    });

    // Sort by last_date DESC
    result.sort((a, b) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime());

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
    <div className="p-6 pb-24">
      <h2 className="text-xl font-bold text-foreground mb-6">Zprávy uživatelů</h2>

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
              className={`relative p-4 rounded-2xl cursor-pointer transition-all duration-200 shadow-md hover:shadow-lg hover:scale-[1.02] ${
                thread.has_unread 
                  ? "bg-destructive/20 border border-destructive/40 hover:bg-destructive/30" 
                  : "bg-card border border-border hover:bg-accent/50"
              }`}
            >
              {thread.has_unread && (
                <div className="absolute top-3 right-3 w-3 h-3 bg-destructive rounded-full animate-pulse" />
              )}
              <p className="text-foreground font-semibold text-sm truncate pr-6">
                {thread.user_id.slice(0, 8)}...
              </p>
              <p className="text-muted-foreground text-sm mt-2 line-clamp-2 min-h-[40px]">
                {thread.last_message}
              </p>
              <p className="text-muted-foreground/70 text-xs mt-3 border-t border-border/50 pt-2">
                {new Date(thread.last_date).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
