console.log("🔥🔥🔥 TOTO JE TEN SPRAVNY FILE - Messages.tsx");

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMessages } from "@/hooks/useMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Reply } from "lucide-react";

export default function MessagesPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [replies, setReplies] = useState({});
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [replyContent, setReplyContent] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [user, setUser] = useState(null);
  const { sendMessageToAdmin, getMessageReplies } = useMessages();

  const load = async () => {
    console.log("Loading messages...");
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (userData?.user?.id) {
      setUser(userData.user);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", userData.user.id)
        .is("parent_message_id", null)
        .order("created_at", { ascending: false });
      setMessages(data || []);

      // Load replies for each message
      if (data) {
        const repliesMap = {};
        for (const msg of data) {
          const msgReplies = await getMessageReplies(msg.id);
          repliesMap[msg.id] = msgReplies;
        }
        setReplies(repliesMap);
      }
    }
  };

  const handleReply = async (messageId: string) => {
    const content = replyContent[messageId];
    if (!user?.id || !content) {
      console.error("Cannot send reply - missing user or content");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await sendMessageToAdmin(user.id, "", content, messageId);

      if (error) {
        console.error("Error sending reply:", error);
      } else {
        console.log("Reply sent successfully!", data);
        setReplyContent({ ...replyContent, [messageId]: "" });
        setReplyingTo(null);
        await load();
      }
    } catch (err) {
      console.error("Reply failed:", err);
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    console.log("Sending message as user:", user?.id);

    if (!user?.id) {
      console.error("Cannot send message - user.id is missing");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await sendMessageToAdmin(user.id, title, content, null);

      if (error) {
        console.error("Error sending message:", error);
      } else {
        console.log("Message sent successfully!", data);
        setTitle("");
        setContent("");
        await load();
      }
    } catch (err) {
      console.error("Send failed:", err);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const loadMessages = async () => {
      console.log("🔥 MessagesPage LOADING…");

      const { data: userData, error: authError } = await supabase.auth.getUser();
      console.log("👤 USER:", userData?.user?.id);
      console.log("AUTH ERROR:", authError);

      if (!userData?.user?.id) {
        console.log("❌ Žádný user → Nenačítám zprávy.");
        return;
      }

      setUser(userData.user);

      const { data, error } = await supabase.from("messages").select("*").eq("user_id", userData.user.id);

      console.log("📩 ZPRÁVY:", data);
      console.log("⚠️ ERROR:", error);

      setMessages(data || []);
    };

    loadMessages();
  }, []);

  return (
    <div className="p-4 text-white">
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="text-white hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">📨 Zprávy ({messages.length})</h1>
      </div>

      {messages.length === 0 && <p className="text-muted-foreground">Žádné zprávy</p>}

      {messages.map((m) => (
        <div key={m.id} className="border border-border bg-card p-4 rounded-lg mb-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              {m.title && <div className="font-bold text-lg mb-1">{m.title}</div>}
              <div className="text-sm text-muted-foreground mb-2">
                {m.sender === "admin" ? "Od: Admin" : "Vy"} • {new Date(m.created_at).toLocaleString("cs-CZ")}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReplyingTo(replyingTo === m.id ? null : m.id)}
              className="ml-2"
            >
              <Reply className="h-4 w-4 mr-1" />
              Odpovědět
            </Button>
          </div>
          
          <div className="mb-3 whitespace-pre-wrap">{m.content}</div>

          {/* Display replies */}
          {replies[m.id] && replies[m.id].length > 0 && (
            <div className="ml-4 mt-4 border-l-2 border-border pl-4 space-y-3">
              {replies[m.id].map((reply) => (
                <div key={reply.id} className="bg-muted/50 p-3 rounded">
                  <div className="text-sm text-muted-foreground mb-1">
                    {reply.sender === "admin" ? "Od: Admin" : "Vy"} • {new Date(reply.created_at).toLocaleString("cs-CZ")}
                  </div>
                  <div className="whitespace-pre-wrap">{reply.content}</div>
                </div>
              ))}
            </div>
          )}

          {/* Reply input */}
          {replyingTo === m.id && (
            <div className="mt-4 border-t border-border pt-4">
              <Textarea
                placeholder="Napište odpověď..."
                value={replyContent[m.id] || ""}
                onChange={(e) => setReplyContent({ ...replyContent, [m.id]: e.target.value })}
                className="mb-2 min-h-20"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleReply(m.id)}
                  disabled={sending || !replyContent[m.id]}
                  size="sm"
                >
                  {sending ? "Odesílám..." : "Odeslat odpověď"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setReplyingTo(null)}
                  size="sm"
                >
                  Zrušit
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Form for sending new message */}
      <div className="mt-6 border-t border-border pt-4">
        <h2 className="text-lg font-bold mb-3">📤 Nová zpráva</h2>
        <Input
          type="text"
          placeholder="Titulek (volitelně)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-2"
        />
        <Textarea
          placeholder="Zpráva"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="mb-2 min-h-24"
        />
        <Button
          onClick={handleSend}
          disabled={sending || !content}
          className="w-full"
        >
          {sending ? "Odesílám..." : "Odeslat zprávu"}
        </Button>
      </div>
    </div>
  );
}
