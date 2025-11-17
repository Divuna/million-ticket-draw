import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { BottomNavigation } from "@/components/BottomNavigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMessages } from "@/hooks/useMessages";
import { useAuth } from "@/hooks/useAuth";
import { Send } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

export default function Messages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useMessages(user?.id);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  if (!user) {
    navigate("/login");
    return null;
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!content.trim()) {
      return toast({
        title: "Chyba",
        description: "Zpráva nemůže být prázdná.",
        variant: "destructive",
      });
    }

    setSending(true);
    const success = await sendMessage(content);
    setSending(false);

    if (success) {
      setContent("");
      toast({
        title: "Úspěch",
        description: "Zpráva byla odeslána.",
      });
    } else {
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F19]">
      <Header />

      {/* Chat messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-32 space-y-4">
        {loading && <p className="text-center text-muted-foreground">Načítám...</p>}

        {messages.map((msg) => {
          const isUser = msg.sender === "user";

          return (
            <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"} w-full`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-lg border
                  ${
                    isUser
                      ? "bg-blue-600 border-blue-700 text-white"
                      : "bg-[#111827] border-yellow-400 shadow-yellow-500/20 text-white"
                  }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                <p className="text-[10px] opacity-70 mt-1">
                  {format(new Date(msg.created_at), "d. M. yyyy HH:mm", {
                    locale: cs,
                  })}
                </p>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </main>

      {/* Message input */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0B0F19] border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Napište odpověď…"
            className="flex-1 bg-[#111827] text-white border border-white/10 rounded-xl resize-none h-12"
          />

          <Button
            onClick={handleSend}
            disabled={sending || !content.trim()}
            className="h-12 px-4 flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
}
