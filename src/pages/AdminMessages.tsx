"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom"; // ✅ Lovable router

export default function AdminMessages() {
  const navigate = useNavigate();

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

    const grouped: Record<string, any[]> = {};

    data?.forEach((msg) => {
      if (!grouped[msg.user_id]) grouped[msg.user_id] = [];
      grouped[msg.user_id].push(msg);
    });

    const result = Object.keys(grouped).map((uid) => ({
      user_id: uid,
      last_message: grouped[uid][0]?.content || "",
      last_date: grouped[uid][0]?.created_at || "",
    }));

    setThreads(result);
    setLoading(false);
  };

  useEffect(() => {
    loadThreads();

    const channel = supabase
      .channel("admin-message-thread-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadThreads())
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
              onClick={() => navigate(`/admin/messages/${th.user_id}`)} // ✅ plně funkční
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
