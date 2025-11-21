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
    <div className="flex flex-col p-6 gap-4 h-full pb-24">
      <h2 className="text-xl font-bold text-gray-100">Zprávy uživatelů</h2>

      {loading ? (
        <p className="text-gray-400">Načítání…</p>
      ) : threads.length === 0 ? (
        <p className="text-gray-400">Zatím žádné zprávy.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {threads.map((thread) => (
            <div
              key={thread.user_id}
              onClick={() => navigate(`/admin/messages/${thread.user_id}`)}
              className={`p-5 rounded-2xl cursor-pointer hover:bg-gray-700/80 transition-all relative shadow-lg ${
                thread.has_unread 
                  ? "bg-red-900/40 border border-red-500/50" 
                  : "bg-gray-800 border border-gray-700/50"
              }`}
            >
              {thread.has_unread && (
                <div className="absolute top-5 right-5 w-3 h-3 bg-red-500 rounded-full"></div>
              )}
              <p className="text-gray-100 font-semibold">{thread.user_id}</p>
              <p className="text-gray-400 text-sm truncate">{thread.last_message}</p>
              <p className="text-gray-500 text-xs mt-1">{new Date(thread.last_date).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
