import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { Header } from "@/components/Header";
import { BottomNavigation } from "@/components/BottomNavigation";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cs } from "date-fns/locale";

export default function MessagesPage() {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useMessages(user?.id);
  const [content, setContent] = useState("");

  const handleSend = async () => {
    if (!content.trim()) return;

    const success = await sendMessage(content);
    if (success) {
      setContent("");
      toast({
        title: "Úspěch",
        description: "Zpráva byla odeslána",
      });
    } else {
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-6 pb-24 flex flex-col">
        <h1 className="text-3xl font-bold mb-6 text-foreground">Zprávy</h1>

        {/* Messages container */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Načítám zprávy...</p>
          ) : messages.length === 0 ? (
            <Card className="p-8 text-center bg-card/50 border-border/50">
              <p className="text-muted-foreground">Zatím nemáte žádné zprávy</p>
            </Card>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    msg.sender === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-card border border-border/50 text-card-foreground rounded-bl-sm'
                  }`}
                  style={
                    msg.sender === 'admin'
                      ? { boxShadow: 'var(--glow-blue)' }
                      : undefined
                  }
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {format(new Date(msg.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sticky input bar */}
        <div className="bg-card border border-border/50 rounded-lg p-4 shadow-lg">
          <div className="flex gap-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Napište zprávu..."
              className="resize-none bg-input border-border/50 focus:border-primary"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              onClick={handleSend}
              disabled={!content.trim()}
              className="self-end bg-primary hover:bg-primary/90"
              size="icon"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
}
