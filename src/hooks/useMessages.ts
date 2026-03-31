import { useCallback } from "react";
import { supabase, supabaseUrl, withEdgeInternalToken } from "@/integrations/supabase/client";
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

      // Step 2: force-refresh the session so we hold a guaranteed-fresh access_token.
      // supabase.functions.invoke injects its own Authorization header from internal
      // client state and can override an explicitly passed header — use raw fetch instead
      // to have full control over every header sent to the edge function.
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshed.session) {
        console.error("[useMessages] session refresh failed", refreshErr);
        throw new Error("Session expired — please log in again.");
      }
      console.log("[useMessages] session refreshed, expires_at", refreshed.session.expires_at);

      const fnHeaders = withEdgeInternalToken({
        "Authorization": `Bearer ${refreshed.session.access_token}`,
        "Content-Type": "application/json",
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      });

      const invokeRes = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
        method: "POST",
        headers: fnHeaders,
        body: JSON.stringify({ message_id: userMessage.id }),
      });

      if (!invokeRes.ok) {
        const errBody = await invokeRes.text().catch(() => "");
        console.error("[useMessages] ai-chat HTTP error", invokeRes.status, errBody);
        throw new Error(`ai-chat returned HTTP ${invokeRes.status}: ${errBody}`);
      }

      const aiData: unknown = await invokeRes.json();

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
