"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface MessageRow {
  user_id: string;
  content: string;
  created_at: string;
  sender: string;
}

export default function AdminMessages() {
  const router = useRouter();

  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadThreads = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("user_id, content, created_at, sender")
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

    // GROUP BY user_id
    const byUser: Record<string, MessageRow[]> = {};

    data?.forEach((msg) => {
      if (!byUser[msg.user_id]) byUser[msg.user_id] = [];
      byUser[msg.user_id].push(msg);
    });

    const result = Object.keys(byUser).map((uid) => {
      const sorted = byUser[uid].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return {
        user_id: uid,
        last_message: sorted[0]?.content ?? "",
        last_date: sorted[0]?.created_at ?? "",
      };
    });

    setThreads(result);
    setLoading(false);
  };

  useEffect(() => {
    loadThreads();

    const channel = supabase
      .channel("admin-message-thread-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, loadThreads)
      .subscribe();

    return () => channel.unsubscribe();
  }, []);

  return (
    <div className="flex flex-col p-6 gap-4 h-full">
      <h2 className="text-xl font-bold text-gray-100">Zprávy uživatelů</h2>

      {loading ? (
        <p className="text-gray-400">Načítání…</p>
      ) : threads.length === 0 ? (
        <p className="text-gray-400">Zatím žádné zprávy.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {threads.map((th) => (
            <div
              key={th.user_id}
              onClick={() => router.push(`/admin/messages/${th.user_id}`)}
              className="p-4 bg-gray-800 rounded-xl cursor-pointer hover:bg-gray-700 transition"
            >
              <p className="text-gray-100 font-semibold">{th.user_id}</p>
              <p className="text-gray-400 text-sm truncate">{th.last_message}</p>
              <p className="text-gray-500 text-xs mt-1">{new Date(th.last_date).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
