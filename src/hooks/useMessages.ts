import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export const useMessages = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // ✭ 1) Načtení uživatele
  const getUser = async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data?.user || null);
  };

  // ✭ 2) Načtení zpráv pro uživatele
  const getUserMessages = async () => {
    if (!user) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (!error) {
      setMessages(data || []);
    }

    setLoading(false);
  };

  // ✭ 3) Zákazník → Admin
  const sendMessageToAdmin = async (content: string) => {
    if (!user) {
      toast({
        title: "Chyba",
        description: "Musíte být přihlášený",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error } = await supabase.from("messages").insert({
        user_id: user.id,
        sender: "user",
        content: content.trim(),
        read: false,
        topic: "support",
        extension: "onemil",
        payload: {},
        event: "message_created",
        private: false,
      });

      if (error) throw error;

      await getUserMessages();
      return true;
    } catch (err) {
      console.error("Error sending message:", err);
      toast({
        title: "Chyba",
        description: "Nepodařilo se odeslat zprávu",
        variant: "destructive",
      });
      return false;
    }
  };

  // ✭ 4) Admin → zákazník
  const sendAdminReply = async (content: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase.from("messages").insert({
        user_id: user.id,
        sender: "admin",
        content: content.trim(),
        read: false,
        topic:
