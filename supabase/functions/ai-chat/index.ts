import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
}

/** Exact handoff text for human support (fallback + oversized input). */
const ADMIN_FALLBACK_CONTENT =
  "Bob si není jistý 🤖 Přeposílám to podpoře 👍"

const MAX_USER_MESSAGE_CHARS = 500

/**
 * System instructions for the model (English for maintainability).
 * Bob must still answer users only in Czech.
 */
const BOB_SYSTEM_BASE = `You are Bob, the AI assistant of OneMil (support chat inside the OneMil app).

Identity and language
- Always act as Bob.
- When the user asks who you are or your name, you MUST answer: "Jsem Bob, AI asistent OneMil."
- Never say you don't have a name.
- Never say "jsem AI bez jména".
- Every answer must be in Czech.
- In normal conversation, you may naturally refer to yourself as Bob when relevant.

Tone, structure, and conversion
- Prefer actionable answers over long theory. Guide the user to the next step inside OneMil.
- Use short sentences. Avoid long paragraphs.
- You may break ideas into a few simple lines (one idea per line). Do not use markdown symbols (no #, *, bullets with dashes as formatting, or code blocks).
- When the user asks HOW to do something, answer as numbered steps: 1) … 2) … 3) … (only as many steps as needed).
- When the user seems confused, simplify: fewer terms, shorter lines, one clear path.
- When the user asks about buying, paying, or getting tickets, steer them through the real flow: voucher → MioCoin → tickets → contests (name the next concrete action in the app).
- When the question is vague or could mean several things, do not guess: ask exactly one short clarification question in Czech, then wait (no invented details).
- If the user is already close to taking action (for example asking about tickets, buying, payment, or how to proceed), do NOT ask clarification questions. Instead, directly guide the user to the next step in OneMil (voucher → MioCoin → tickets → contests).
- When the user reports a problem, briefly explain what usually applies in OneMil (only from context below) and add one clear next step they can try in the app.
- If intent is unclear, ask one short clarifying question instead of assuming.

Intent quick map
- Buying / tickets / coins → guide to the next step in the voucher → MioCoin → tickets flow.
- Problem / error / „nejde to“ → short explanation + one next step; if you lack detail, one clarifying question.
- Unknown or off-topic within OneMil → one clarifying question; if still unsure after that, nevím.

Scope — OneMil only
- You may discuss: MioCoin (internal currency), wallet, vouchers, contests, tickets, winners, and in-app support topics.
- Core flow: voucher → MioCoin → tickets → contests → winnings.
- Do not invent facts, policies, amounts, or dates not supported by the conversation and the context blocks below.
- Do not mention external platforms, competitors, or unrelated generic advice.

Uncertainty
- If you are not sure, reply with exactly: nevím (do not guess).

Output format
- Plain Czech text only. Do not output JSON or markdown code fences unless the user explicitly asks for code or JSON.`

function buildSystemContent(contestsJson: string, walletJson: string | null): string {
  let out = `${BOB_SYSTEM_BASE}

Current contests (name, status, ticket_price):
${contestsJson}`
  if (walletJson) {
    out += `

Current user wallet (MioCoin = balance_coins):
${walletJson}`
  }
  return out
}

function shouldFallbackToAdmin(reply: string): boolean {
  const t = reply.trim()
  if (t.length === 0) return true
  return t.toLowerCase().includes("nevím")
}

type ServiceSupabase = ReturnType<typeof createClient>

async function insertAdminHandoff(
  supabase: ServiceSupabase,
  userId: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      user_id: userId,
      sender: "admin",
      content: ADMIN_FALLBACK_CONTENT,
      read: false,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[ai-chat] admin handoff insert failed", error)
    return { ok: false, message: error.message }
  }
  return { ok: true, id: data.id }
}

function jsonSuccess(replyMessageId: string) {
  return new Response(JSON.stringify({ success: true, reply_message_id: replyMessageId }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? ""
  const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? ""

  const providedInternal = req.headers.get("x-internal-token") ?? ""
  if (internalToken && providedInternal !== internalToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (!openaiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const body = (await req.json()) as { message_id?: string }
    const messageId = body?.message_id
    if (typeof messageId !== "string" || messageId.length === 0) {
      return new Response(JSON.stringify({ error: "message_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userMsg, error: fetchErr } = await supabase
      .from("messages")
      .select("id, user_id, sender, content")
      .eq("id", messageId)
      .single()

    if (fetchErr || !userMsg) {
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (userMsg.sender !== "user") {
      return new Response(JSON.stringify({ error: "Not a user message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const userContent = typeof userMsg.content === "string" ? userMsg.content.trim() : ""
    if (!userContent) {
      return new Response(JSON.stringify({ error: "Empty content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Oversized user text: skip OpenAI, same admin handoff as uncertain Bob
    if (userContent.length > MAX_USER_MESSAGE_CHARS) {
      console.warn("[ai-chat] user message over char limit", {
        message_id: messageId,
        length: userContent.length,
      })
      const handoff = await insertAdminHandoff(supabase, userMsg.user_id)
      if (!handoff.ok) {
        return new Response(JSON.stringify({ error: handoff.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(handoff.id)
    }

    const [{ data: contests, error: contestsErr }, { data: wallet, error: walletErr }, { data: recent }] =
      await Promise.all([
        supabase
          .from("contests")
          .select("name, status, ticket_price")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("wallets")
          .select("balance_coins, balance_vouchers, bonus_balance_coins")
          .eq("user_id", userMsg.user_id)
          .maybeSingle(),
        supabase
          .from("messages")
          .select("sender, content")
          .eq("user_id", userMsg.user_id)
          .order("created_at", { ascending: false })
          .limit(20),
      ])

    if (contestsErr) {
      console.error("[ai-chat] contests load failed", contestsErr)
    }
    if (walletErr) {
      console.error("[ai-chat] wallet load failed", walletErr)
    }

    const contestsJson = JSON.stringify(contests ?? [])
    const walletJson =
      wallet && !walletErr
        ? JSON.stringify({
            balance_coins: wallet.balance_coins,
            balance_vouchers: wallet.balance_vouchers,
            bonus_balance_coins: wallet.bonus_balance_coins,
          })
        : null

    const systemContent = buildSystemContent(contestsJson, walletJson)

    const chronological = (recent ?? []).slice().reverse()
    const history = chronological.map((m) => ({
      role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
      content: typeof m.content === "string" ? m.content : "",
    }))

    const model = Deno.env.get("AI_CHAT_MODEL") ?? "gpt-4o-mini"

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemContent }, ...history],
        max_tokens: 250,
        temperature: 0.2,
      }),
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error("[ai-chat] OpenAI error", openaiRes.status, errText)
      return new Response(JSON.stringify({ error: "OpenAI request failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const openaiData = await openaiRes.json() as {
      choices?: Array<{ message?: { content?: string | null } }>
    }
    const rawContent = openaiData?.choices?.[0]?.message?.content
    const replyText = typeof rawContent === "string" ? rawContent.trim() : ""

    if (shouldFallbackToAdmin(replyText)) {
      const handoff = await insertAdminHandoff(supabase, userMsg.user_id)
      if (!handoff.ok) {
        return new Response(JSON.stringify({ error: handoff.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(handoff.id)
    }

    const { data: inserted, error: insErr } = await supabase
      .from("messages")
      .insert({
        user_id: userMsg.user_id,
        sender: "ai",
        content: replyText,
        read: false,
      })
      .select("id")
      .single()

    if (insErr) {
      console.error("[ai-chat] insert failed", insErr)
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return jsonSuccess(inserted.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ai-chat]", msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
