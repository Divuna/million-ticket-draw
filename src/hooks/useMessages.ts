import { useCallback } from "react";
import { supabase, withEdgeInternalToken } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ConversationMessage {
  id: string;
  user_id: string;
  content: string;
  sender: "user" | "admin" | "ai";
  read: boolean;
  created_at: string;
}

export interface SendMessageResult {
  userMessage: ConversationMessage;
  aiMessage: ConversationMessage;
}

/**
 * Send flow:
 * 1. Insert user message → get userMessage row with real DB id
 * 2. Invoke ai-chat edge function (synchronous — waits for full AI response)
 *    Edge function writes AI reply to DB before returning { reply_message_id }
 * 3. Fetch the single AI row by reply_message_id (always present at this point)
 * 4. Return { userMessage, aiMessage } so caller can update UI state directly
 */
export const useMessages = () => {
  const sendMessageToAdmin = useCallback(async (content: string): Promise<SendMessageResult | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("[useMessages] no authenticated user");
      return null;
    }

    try {
      // Step 1: insert user message
      const { data: userMessage, error: insertErr } = await supabase
        .from("messages")
        .insert({ user_id: user.id, sender: "user", content: content.trim(), read: false })
        .select("*")
        .single();

      if (insertErr) {
        console.error("[useMessages] insert failed — code:", insertErr.code, "message:", insertErr.message, "details:", insertErr.details);
        throw insertErr;
      }
      if (!userMessage) throw new Error("user message insert returned no row");
      console.log("[useMessages] userMessage inserted", userMessage.id);

      // Step 2: invoke ai-chat — blocks until the edge function has written the AI reply to DB
      // withEdgeInternalToken adds x-internal-token header required by the edge function.
      const { data: aiData, error: invokeErr } = await supabase.functions.invoke("ai-chat", {
        body: { message_id: userMessage.id },
        headers: withEdgeInternalToken({}),
      });

      if (invokeErr) throw invokeErr;

      const replyMessageId =
        aiData && typeof aiData === "object"
          ? (aiData as Record<string, unknown>).reply_message_id
          : null;

      console.log("[useMessages] reply_message_id", replyMessageId);

      if (typeof replyMessageId !== "string" || !replyMessageId) {
        throw new Error(`ai-chat returned no reply_message_id — got: ${JSON.stringify(aiData)}`);
      }

      // Step 3: fetch the settled AI row (it exists in DB by the time invoke() returned)
      const { data: aiMessage, error: fetchErr } = await supabase
        .from("messages")
        .select("*")
        .eq("id", replyMessageId)
        .single();

      if (fetchErr) throw fetchErr;
      if (!aiMessage) throw new Error(`AI message row ${replyMessageId} not found`);
      console.log("[useMessages] aiMessage fetched", aiMessage.id, aiMessage.content?.slice(0, 80));

      return {
        userMessage: userMessage as ConversationMessage,
        aiMessage: aiMessage as ConversationMessage,
      };
    } catch (err) {
      console.error("[useMessages] sendMessageToAdmin failed", err);
      toast({ title: "Chyba", description: "Nepodařilo se odeslat zprávu", variant: "destructive" });
      return null;
    }
  }, []);

  return { sendMessageToAdmin };
};
