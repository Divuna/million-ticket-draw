import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { toast } from "@/hooks/use-toast";

interface Message {
  id: string;
  user_id: string;
  sender: "user" | "admin";
  title: string | null;
  content: string;
  category: string | null;
  read: boolean;
  created_at: string;
  parent_message_id: string | null;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { sendMessageToAdmin } = useMessages();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    const loadMessages = async () => {
      if (!user) return;
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await window.supabase
          .from("messages")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("❌ Chyba při načítání zpráv:", error);
          setError("Nepodařilo se načíst zprávy.");
          return;
        }

        setMessages(Array.isArray(data) ? data : []);
      } catch (err: any) {
        console.error("❌ Neočekávaná chyba:", err);
        setError("Došlo k chybě při načítání zpráv.");
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [user]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    try {
      setLoading(true);
      await sendMessageToAdmin(newMessage);
      toast({ title: "Zpráva odeslána", description: "Vaše zpráva byla úspěšně odeslána.", variant: "default" });
      setNewMessage("");
    } catch (err: any) {
      console.error("❌ Odesílání zprávy selhalo:", err);
      toast({ title: "Chyba", description: "Nepodařilo se odeslat zprávu.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
        <p>Přihlaste se, abyste mohli zobrazit a odesílat zprávy.</p>
      </div>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
        <p>Načítání zpráv...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-red-500">
        <p>{error}</p>
      </div>
    );
  }

  const safeMessages = Array.isArray(messages) ? messages : [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[70vh]">
        {safeMessages.length > 0 ? (
          safeMessages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded-xl ${
                msg.sender === "user" ? "bg-blue-500/10 self-end" : "bg-gray-700/20 self-start"
              }`}
            >
              <p className="text-sm text-gray-300">{msg.content}</p>
              <p className="text-xs text-gray-500 mt-1">{new Date(msg.created_at).toLocaleString()}</p>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-400">Zatím žádné zprávy.</p>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Napište zprávu..."
          className="flex-1 bg-gray-800 text-gray-100 p-2 rounded-lg outline-none border border-gray-700 focus:border-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
        >
          Odeslat
        </button>
      </div>
    </div>
  );
}
