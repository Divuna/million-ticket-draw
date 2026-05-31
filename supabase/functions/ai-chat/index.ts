import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

console.log("AI-CHAT VERSION: TIMING_V1")
console.log("AI CHAT: support NOT triggered automatically")
console.log("AI: no auto support")

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
}

const MAX_USER_MESSAGE_CHARS = 500
const BOB_GREETING_PAUSE_MS = 45 * 60 * 1000
/** Max prior thread messages sent to OpenAI (excluding system layers). */
const OPENAI_CHAT_HISTORY_LIMIT = 10
const OPENAI_TIMEOUT_MS = 5000
const OPENAI_FAILURE_FALLBACK_TEXT = "Teď se mi nepodařilo odpovědět. Zkus to prosím znovu."

const BOB_WHATSAPP_FALLBACK_URL =
  "https://wa.me/420XXXXXXXXX?text=Potřebuju%20pomoc%20s%20OneMil"

// ai-chat must never trigger support-handoff or claim it forwarded anything.

function bobSupportCtaPayload(text: string): BobAssistantPayload {
  const t = text.trim()
  const withHint = foldCs(t).includes("kontaktovat podporu")
    ? t
    : `${t}\nMůžu ti nabídnout kontaktovat podporu.`
  return { text: withHint, cta: null }
}

const AI_KNOWLEDGE = {
  base: {
    about:
      "OneMil je platforma, která propojuje zákazníky s partnery a odměňuje je za nákupy. Uživatel získává MioCoiny, které může využít pro vouchery nebo soutěže.",
    flow: "Nakupuj → získej MioCoiny → využij vouchery nebo hraj → získej výhody nebo vyhraj ceny.",
    trust:
      "Soutěže mají předem daná pravidla, výherní tiket je pevně určen a uživatel vidí stav soutěže.",
  },
  miocoin: {
    definition:
      "MioCoin je interní OneMil kredit pro nákup voucherů a účast v soutěžích. Není to hotovost a nelze ho vybrat ani směnit za peníze.",
    sources:
      "MioCoiny lze získat dobitím, od partnerů, jako bonus, ze sociálních sítí, akcí nebo influencerů.",
  },
  vouchers: {
    definition:
      "Vouchery jsou konkrétní nabídky partnerů (slevy, produkty, výhody), které si uživatel kupuje za MioCoiny.",
    rule: "Uživatel vždy ví, co kupuje. Voucher není náhodný.",
  },
  contests: {
    rule: "Každá soutěž má pevný počet tiketů a hlavní výhra padá na poslední tiket.",
  },
  support: {
    fallback: "Rádi ti pomůžeme. Pro kontakt s podporou klikni na tlačítko níže.",
  },
  pricing: {
    customer_text:
      "Jeden MioCoin má hodnotu 1 Kč. MioCoiny si můžeš dobít buď ve zvýhodněných balíčcích, nebo si zadat vlastní částku. U vlastní částky se bonus navíc nepřidává.",
    packages:
      "Aktuální balíčky MioCoinů:\n- 50 Kč → 50 MioCoinů\n- 300 Kč → 310 MioCoinů\n- 500 Kč → 525 MioCoinů\n- 1200 Kč → 1280 MioCoinů\n\nMůžete také zadat vlastní částku dobití. Minimální částka se může lišit podle nastavení systému.",
  },
  referral: {
    info:
      "Můžete zvát své přátele pomocí unikátního odkazu nebo kódu. Získáváte 5 % z každého jejich dobití a jednorázový bonus za první dobití.",
    privacy:
      "Nevidíte konkrétní finanční aktivitu ani částky svých pozvaných uživatelů. Systém chrání jejich soukromí.",
    stats: "V přehledu vidíte počet doporučení, získané MioCoiny a historii odměn.",
  },
  bonus: {
    info: "Bonusové MioCoiny se zobrazují odděleně v peněžence.",
    transfer: "Pro jejich použití je nutné je ručně převést do hlavního zůstatku.",
    history: "Historii převodů najdete ve své peněžence.",
  },
  profile: {
    info: "Vyplnění osobních údajů je důležité pro doručení výhry.",
    usage: "Údaje slouží pouze pro komunikaci a odeslání výhry.",
    safety: "Vaše údaje jsou chráněné a nejsou sdíleny s ostatními uživateli.",
  },
} as const

/** Czech number formatting (e.g. 4045.5 → 4 045,5). */
function formatCsNumber(n: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(n)
}

/**
 * Final approved scenarios — runs after DB handlers, before getPredefinedReply + GPT.
 * IMPORTANT: pricing is high-priority to avoid wrong MioCoin definition answers.
 */
function getExtendedKnowledgeReply(text: string): string | null {
  const t = text.toLowerCase()

  if (isGeneralRecommendationQuestion(text)) {
    return null
  }

  // Never return KB replies for user-specific data questions (balance, wins, vouchers).
  if (userDataIntentFromUserText(text) !== null) {
    return null
  }

  // Pricing intent must be high-priority to avoid returning the MioCoin definition.
  const pricingForced =
    t.includes("miocoin") &&
    (t.includes("kolik") || t.includes("cena") || t.includes("stojí") || t.includes("stoji"))

  const pricingSpecific =
    t.includes("kolik stojí jeden miocoin") ||
    t.includes("kolik stoji jeden miocoin") ||
    t.includes("cena jednoho miocoinu")

  // High-priority single-price wording (exact customer text).
  if (pricingSpecific) {
    return AI_KNOWLEDGE.pricing.customer_text
  }

  if (
    pricingForced ||
    t.includes("kolik stojí") ||
    t.includes("kolik stoji") ||
    t.includes("cena") ||
    t.includes("balíček") ||
    t.includes("balicek") ||
    t.includes("miocoin")
  ) {
    // BUT avoid conflict with definition
    if (!pricingForced && t.includes("co je miocoin")) {
      return AI_KNOWLEDGE.miocoin.definition
    }

    return AI_KNOWLEDGE.pricing.packages
  }

  if (t.includes("jak převést bonus") || t.includes("jak prevest bonus")) {
    return `${AI_KNOWLEDGE.bonus.transfer}\n\n${AI_KNOWLEDGE.bonus.history}`
  }

  if (
    t.includes("nevidím kolik utratili") ||
    t.includes("nevidim kolik utratili") ||
    t.includes("soukromí") ||
    t.includes("soukromi")
  ) {
    return AI_KNOWLEDGE.referral.privacy
  }

  if (t.includes("pozvi") || t.includes("referral")) {
    return `${AI_KNOWLEDGE.referral.info}\n\n${AI_KNOWLEDGE.referral.stats}`
  }

  if (t.includes("bonus") && t.includes("miocoin")) {
    return `${AI_KNOWLEDGE.bonus.info}\n\n${AI_KNOWLEDGE.bonus.transfer}`
  }

  if (t.includes("osobní údaje") || t.includes("osobni udaje") || t.includes("adresa") || t.includes("profil")) {
    return `${AI_KNOWLEDGE.profile.info}\n\n${AI_KNOWLEDGE.profile.usage}`
  }

  return null
}

function getPredefinedReply(userText: string): string | null {
  const text = userText.toLowerCase()

  if (text.includes("funguje")) return `${AI_KNOWLEDGE.base.flow}\n\n${AI_KNOWLEDGE.base.about}`

  // Prevent wrong fallback: pricing intent must not return the MioCoin definition.
  if (
    text.includes("miocoin") &&
    (text.includes("kolik") || text.includes("cena") || text.includes("stojí") || text.includes("stoji"))
  ) {
    return AI_KNOWLEDGE.pricing.packages
  }

  if (text.includes("miocoin") || text.includes("coin")) return AI_KNOWLEDGE.miocoin.definition
  if (text.includes("voucher")) return AI_KNOWLEDGE.vouchers.definition
  if (text.includes("vyhr")) return AI_KNOWLEDGE.contests.rule
  // Support/contact queries are handled by a dedicated pre-KB handler; never return email here.

  return null
}

/** Rephrase approved knowledge only; facts must come from `knowledgeText`. */
const KNOWLEDGE_REPHRASE_SYSTEM = `Jsi Bob, asistent OneMil v chatu.
Dostaneš SCHVÁLENÝ text (jediný zdroj faktů) a uživatelskou otázku jen pro kontext tónu.
Úkol: přepiš odpověď přirozeně, stručně, přátelsky a srozumitelně v češtině.
Přísně: zachovej význam a všechna fakta z TEXTu (čísla, částky, názvy, postupy). Nevymýšlej nic nového ani neodvozuj skrytá pravidla.
Vždy nejdřív odpověz přímo na otázku uživatele.
Potom přidej přesně JEDNU velmi krátkou větu s dalším krokem v aplikaci (max 1 věta), pokud to dává smysl — kromě případů níže, kde je „cta“ povinné.
Povinné „cta“: pokud uživatel v OTÁZCE jasně míří na jednu sekci aplikace, VŽDY přidej přesně odpovídající „cta“ (nesmí chybět):
• soutěže / hry / tikety / hraní → {"label":"Soutěže","action":"/games"}
• výhry / ceny / doručení výher → {"label":"Výhry","action":"/wins"}
• vouchery / MioCoin dobití / platby / peněženka / kredit / zůstatek → {"label":"Vouchery","action":"/vouchers"}
• profil / osobní údaje / notifikace / pozvat přátele → {"label":"Profil","action":"/profile"}
• předání na podporu / lidská podpora → "cta": null
Jiné normální situace: použij fallback {"label":"Soutěže","action":"/games"}.
Při více tématech v jedné otázce zvol jedno „cta“ nejvíc odpovídající prvnímu / hlavnímu záměru (priorita pro rozklad shody: Podpora > Výhry > Vouchery > Profil > Soutěže).
Forma doprovodné věty: mluv přirozeně a lidsky — ne jako robot. Vyhni se generickým motivačním větám typu „Pokračuj ve hře a přibliž se výhře“.
Každá odpověď jinak: přizpůsob tón otázce a TEXTu.
Buď konkrétní, když to jde: pokud jsou v TEXTu přesná čísla, zachovej je; bez nových faktů.
V poli „text“ používej názvy obrazovek tak, jak je uživatel vidí: „Peněženka“, „Soutěže“, „Výhry“, „Vouchery“ — nikdy v „text“ nepisuj vnitřní cesty (/…) ani URL.
„label“ a „action“ v „cta“ musí přesně odpovídat jedné řádce v tabulce výše (žádné jiné cesty).
Výstup musí být POUZE jeden platný JSON objekt (žádný markdown, žádné \`\`\`), např. {"text":"celá odpověď v češtině","cta":{"label":"Soutěže","action":"/games"}} nebo při předání na podporu {"text":"krátká odpověď","cta":null}.
Nepiš úvod typu „Jistě“ ani shrnutí navíc.`

async function rephraseKnowledgeForBob(
  openaiKey: string,
  knowledgeText: string,
  userQuestion: string,
): Promise<string | null> {
  const model = Deno.env.get("AI_CHAT_MODEL") ?? "gpt-4o-mini"
  const userContent = `Přepiš tuto odpověď přirozeně, lidsky a stručně v češtině.
Zachovej význam, nevymýšlej nové informace.

OTÁZKA UŽIVATELE (kontext tónu):
${userQuestion}

TEXT:
${knowledgeText}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)
  let openaiRes: Response
  try {
    openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: KNOWLEDGE_REPHRASE_SYSTEM },
            { role: "user", content: userContent },
          ],
          max_tokens: 220,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      signal: controller.signal,
    })
  } catch (e) {
    console.error("[ai-chat] knowledge rephrase OpenAI fetch failed", e)
    return null
  } finally {
    clearTimeout(timer)
  }

  if (!openaiRes.ok) {
    const errText = await openaiRes.text()
    console.error("[ai-chat] knowledge rephrase OpenAI error", openaiRes.status, errText)
    return null
  }

  const openaiData = (await openaiRes.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  const raw = openaiData?.choices?.[0]?.message?.content
  const text = typeof raw === "string" ? raw.trim() : ""
  return text.length > 0 ? text : null
}

function shouldRephraseKnowledge(knowledgeText: string): boolean {
  // Some replies must stay exact (customer-facing pricing statement).
  if (knowledgeText === AI_KNOWLEDGE.pricing.customer_text) return false
  return true
}

type ServiceSupabase = ReturnType<typeof createClient>

type AiMessageStoredCta = { label: string; action: string }

/** When model/parse omits CTA. */
const DEFAULT_AI_MESSAGE_CTA_FALLBACK: AiMessageStoredCta = {
  label: "Soutěže",
  action: "/games",
}

/**
 * Strict in-memory shape before persist. No undefined; CTA is either `{ label, action }` or null (never partial objects).
 */
function buildSanitizedAiMessagePayload(
  responseText: unknown,
  cta: unknown,
): { text: string; cta: AiMessageStoredCta | null } {
  const ctaObj =
    cta && typeof cta === "object" && cta !== null && !Array.isArray(cta)
      ? (cta as Record<string, unknown>)
      : null
  const payload: { text: string; cta: AiMessageStoredCta | null } = {
    text: String(responseText || ""),
    cta: ctaObj
      ? {
          label: String(ctaObj.label || ""),
          action: String(ctaObj.action || ""),
        }
      : null,
  }
  if (!payload.text) {
    payload.text = ""
  }
  return payload
}

/**
 * Sole serialization path for AI `messages.content`. Default CTA unless a CTA is explicitly provided.
 */
function serializeAiMessageContentForDb(responseText: unknown, cta: unknown): string {
  const explicitNullCta = cta === null
  const payload = buildSanitizedAiMessagePayload(responseText, cta)
  if (
    !explicitNullCta &&
    (!payload.cta || payload.cta === null)
  ) {
    payload.cta = { ...DEFAULT_AI_MESSAGE_CTA_FALLBACK }
  }
  return JSON.stringify(payload)
}

type AiMessageInsertContent = string | { text: string; cta?: unknown }

/** Parse legacy / pre-normalized string into strict JSON row content. */
function normalizeAiMessageContentForStorage(content: string): string {
  const trimmed = content.trim()
  if (trimmed.startsWith("{")) {
    try {
      const o = JSON.parse(trimmed) as Record<string, unknown>
      if (o && typeof o === "object" && "text" in o) {
        return serializeAiMessageContentForDb(o.text, o.cta)
      }
    } catch {
      // fall through: store whole string as text
    }
  }
  return serializeAiMessageContentForDb(content, undefined)
}

/** AI reply: `content` is always produced via `serializeAiMessageContentForDb` (directly or through `normalizeAiMessageContentForStorage`). */
async function insertAiReply(
  supabase: ServiceSupabase,
  userId: string,
  content: AiMessageInsertContent,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const rowContent =
    typeof content === "string"
      ? normalizeAiMessageContentForStorage(content)
      : serializeAiMessageContentForDb(content.text, content.cta)

  const { data, error } = await supabase
    .from("messages")
    .insert({
      user_id: userId,
      sender: "ai",
      content: rowContent,
      read: false,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[ai-chat] ai insert failed", error)
    return { ok: false, message: error.message }
  }
  return { ok: true, id: data.id }
}

/** Debounced DB writes while OpenAI streams (same `messages.content` shape as final: text + default CTA). */
const STREAM_DB_FLUSH_MS = 90
const OPENAI_STREAM_TIMEOUT_MS = 75_000

/**
 * Read `text` string value from a partial JSON buffer (Bob must emit `{"text":"…"}` per system prompt).
 * Used for streaming without `response_format: json_object` so token deltas arrive progressively.
 */
function extractPartialTextFromStreamJsonObject(s: string): string {
  const m = /"text"\s*:\s*"/m.exec(s)
  if (!m || m.index === undefined) return ""
  let i = m.index + m[0].length
  let out = ""
  while (i < s.length) {
    const c = s[i]
    if (c === "\\") {
      if (i + 1 >= s.length) break
      const n = s[i + 1]
      if (n === "n") {
        out += "\n"
        i += 2
        continue
      }
      if (n === "r") {
        out += "\r"
        i += 2
        continue
      }
      if (n === "t") {
        out += "\t"
        i += 2
        continue
      }
      if (n === '"' || n === "\\" || n === "/") {
        out += n
        i += 2
        continue
      }
      if (n === "u" && i + 5 < s.length) {
        const hex = s.slice(i + 2, i + 6)
        const code = parseInt(hex, 16)
        if (!Number.isNaN(code)) {
          out += String.fromCharCode(code)
          i += 6
          continue
        }
      }
      out += n
      i += 2
      continue
    }
    if (c === '"') break
    out += c
    i++
  }
  return out
}

/** Empty-text AI row + default CTA; content updated as the model streams. */
async function insertStreamingAiPlaceholder(
  supabase: ServiceSupabase,
  userId: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const rowContent = serializeAiMessageContentForDb("", DEFAULT_AI_MESSAGE_CTA_FALLBACK)
  const { data, error } = await supabase
    .from("messages")
    .insert({
      user_id: userId,
      sender: "ai",
      content: rowContent,
      read: false,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[ai-chat] streaming placeholder insert failed", error)
    return { ok: false, message: error.message }
  }
  return { ok: true, id: data.id }
}

async function updateAiMessageContentById(
  supabase: ServiceSupabase,
  messageId: string,
  content: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from("messages").update({ content }).eq("id", messageId)
  if (error) {
    console.error("[ai-chat] streaming content update failed", error)
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

async function deleteMessageById(
  supabase: ServiceSupabase,
  messageId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.from("messages").delete().eq("id", messageId)
  if (error) {
    console.error("[ai-chat] delete message failed", error)
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

/** SYSTEM (rules) — context sandwich, first layer. Answers must be Czech. */
const BOB_SYSTEM_BASE = `You are Bob, AI assistant for OneMil.
You speak Czech.
You are helpful, short, and human.
You ALWAYS answer the user's question fully first.
ONLY suggest the next step if it makes sense for the user's question and situation — EXCEPT when the user's message clearly targets one app section (see mandatory CTA rules below); then you MUST include the matching CTA.
Do NOT push actions aggressively in general chat.
Keep responses natural and human.
NEVER ask vague follow-up questions (e.g. "upřesni dotaz", "co přesně myslíš?") when the user's intent is already clear from their message.
If the user asks a general question like "Co mám dělat?" or "Jak pokračovat?", ALWAYS use the available user data from context (USER DATA mioCoins/wins, Last activity, Contests JSON) and give one or two concrete next steps in the app flow — do NOT answer with generic clarification questions only.
For such general questions, base suggestions on USER DATA mioCoins when it is not "unavailable" (e.g. low balance → Vouchery; enough for play → Soutěže); use USER DATA wins when the topic is výhry; if the topic is vouchers, point to Vouchery. If mioCoins is unavailable, still give concrete OneMil steps without asking the user to "upřesnit". Never write internal paths (/games, /wins, /vouchers, /profile, …) inside "text" — use visible Czech UI names (Soutěže, Výhry, Vouchery, Profil, …).
For support-related questions (complaints, account problems, legal, refunds): answer helpfully first. If you cannot answer confidently or the user clearly needs a human, say that clearly and set "cta": null. Do not claim the message was already forwarded.
If you need to offer human support, say so briefly in Czech in "text" and set "cta": null. Do not claim the message was already forwarded.
Generic help/support/contact/login/problem intents MUST use "cta": null. Never route these to the fallback Soutěže CTA.
Problem reports MUST NOT be answered only with account data. If the user reports that something is broken, missing, not credited, not opening, delayed, or wrong, acknowledge the problem first, give one practical next step, and mention support if it persists.
If the user asks whether MioCoins can be withdrawn or exchanged back to money, always answer exactly this fact: "MioCoin je interní kredit OneMil. Není to hotovost a nelze ho vybrat ani směnit zpět za peníze."
Win delivery/claim questions: say that details are in "Moje výhry"; use the Výhry CTA; if delivery/claim info is missing or delayed, suggest support. Do not answer only with the number of wins.
Profile data changes (phone, address, delivery address, personal data) route to Profil. If an already shipped win is mentioned, also suggest support in the text.
Age restriction: if the user says they are 15, 16, 17, or under 18, clearly say participation is only for users 18+. Do not push the Soutěže CTA.
Voucher problems (cannot open, wrong voucher, redemption problem) route to Vouchery, give a practical first step, and suggest support if it persists.
Payment confirmation/invoice questions route to Vouchery; do not invent where an invoice is if unknown, and suggest support if the user cannot find it.
Do not invent operational facts such as delivery timeframes unless they are explicitly present in approved OneMil knowledge.
Do not repeat the same support sentence twice.
NEVER suggest recharge if user has enough MioCoins (use USER DATA mioCoins as the numeric truth; if it is enough for typical contest ticket_price from contests data, do not suggest top-up).
A separate system message starts with USER DATA (mioCoins, wins, vouchers, etc.). Those fields are loaded from the database for this user — authoritative source of truth, not optional hints.

STRICT USER-DATA-FIRST RULE: If USER DATA contains a value that is not "unavailable" and the user's intent clearly matches one of the mappings below, you MUST answer using that value immediately in the FIRST sentence of "text". Generic definitions, marketing blurbs, or contest rules alone are FORBIDDEN as the only answer when a matching USER DATA value exists. Never contradict USER DATA with guesses or chat history.

INTENT → USER DATA (hard priority over general knowledge; use these exact fields):
- Balance / MioCoins / peněženka / zůstatek mincí / kolik mám (mince) → user.miocoin_balance = USER DATA line "mioCoins".
- Počet výher / moje výhry / kolik výher / wins → user.wins_count = USER DATA line "wins".
- Vouchery na účtu / slevové vouchery (zůstatek) / wallet vouchers → user.vouchers = USER DATA line "vouchers" (not the same as explaining what a voucher product is in general).

STRUCTURE of "text" when a mapping applies and the value is available:
- First sentence: direct factual answer quoting the USER DATA (numbers exactly as given).
- Second sentence (optional): one short follow-up or encouragement — may point to the app; never replace the first sentence with only a CTA or generic tip.
- Exception: if the user reports a problem or asks about delivery/claim/withdrawal/login/support/contact, do NOT use this user-data-first structure. Resolve the user's problem intent first.
The JSON "cta" field is separate (mandatory CTA rules below still apply); do not skip the first-sentence factual answer because a cta exists.

If mioCoins / wins / vouchers in USER DATA is "unavailable", say you cannot see that figure; do not invent numbers.
Put the conversational part in "text" using natural Czech and visible screen names — never put raw paths or external URLs inside "text".
MioCoin vždy popisuj jako interní OneMil kredit. Není to hotovost, nejde vybrat jako peníze a nejde převést mimo OneMil.
Nikdy neslibuj jistou výhru ani garantovaný výsledek.
Nevymýšlej fakta. Když si nejsi jistý, řekni to jasně a nabídni podporu.
Nepoužívej tato slova v odpovědi: casino, hazard, jackpot, sázení, losování.
Odpovědi drž krátké, užitečné a přátelské v češtině.

JSON a CTA (povinné pravidlo pro každou odpověď):
Každá normální odpověď musí být validní JSON objekt přesně ve tvaru {"text":"...","cta":{"label":"...","action":"..."}}.
Pouze při nabídce předání na podporu použij {"text":"...","cta":null}.
Pole cta musí mít label (česky) a action podle tohoto pravidla:

- soutěže, hry, tikety, hraní → action: "/games", label: "Soutěže"
- výhry, ceny, doručení výher → action: "/wins", label: "Výhry"
- vouchery, MioCoin dobití, platby, peněženka, kredit, zůstatek → action: "/vouchers", label: "Vouchery"
- profil, osobní údaje, notifikace, pozvat přátele → action: "/profile", label: "Profil"
- předání na podporu / lidská podpora → cta: null
- cokoliv jiného → action: "/games", label: "Soutěže"

PRAVIDLA:
- vždy interní route začínající /
- cta: null jen pro předání na podporu
- nikdy externí URL v cta ani v text
- label musí být česky a výstižně popisovat akci

OUTPUT FORMAT: jeden platný JSON objekt (žádný markdown, žádné trojité zpětné apostrofy v odpovědi).
Nepoužívej action "/messages". Pro podporu použij cta: null. Jinak vždy preferuj konkrétní sekci aplikace podle pravidel výše.`

const BOB_SUPPORT_MODE_SYSTEM = `SUPPORT MODE (hard rules):
- The user is in a support/help situation.
- DO NOT use sales language, upsell, "dobij si", "kup si", "vyzkoušej soutěže", or any persuasive marketing.
- DO NOT recommend purchases or top-ups.
- Focus ONLY on resolving the issue: clear steps, reassurance, and if needed, route to human support handoff rules.
- Tone: calm, empathetic, non-pushy, short.`

function buildBobContextSystemMessage(params: {
  displayName: string
  balanceCoins: number | null
  winsCount: number | null
  winsLoadFailed: boolean
  vouchersBalance: number | null
  lastActivity: string
  contestsJson: string
}): string {
  const nameLine = params.displayName.trim() || "uživatel"

  const mioCoinsLine =
    params.balanceCoins !== null && Number.isFinite(params.balanceCoins)
      ? String(params.balanceCoins)
      : "unavailable"

  const winsLine =
    !params.winsLoadFailed && params.winsCount !== null && Number.isFinite(params.winsCount)
      ? String(Math.max(0, Math.trunc(params.winsCount)))
      : "unavailable"

  const vouchersLine =
    params.vouchersBalance !== null && Number.isFinite(params.vouchersBalance)
      ? String(params.vouchersBalance)
      : "unavailable"

  const lines: string[] = [
    "AKTUÁLNÍ DATA UŽIVATELE – POVINNÉ POUŽITÍ:",
    "Pokud se uživatel ptá na cokoliv co je níže uvedeno,",
    "MUSÍŠ odpovědět přesnou hodnotou z těchto dat.",
    "Nikdy neodpovídej obecně pokud data existují.",
    "",
    "USER DATA (database snapshot for this user — authoritative source of truth, not optional hints):",
    `- mioCoins (user.miocoin_balance / wallet): ${mioCoinsLine}`,
    `- wins (user.wins_count / winners): ${winsLine}`,
    `- vouchers (user.vouchers / wallet balance_vouchers): ${vouchersLine}`,
    "",
    "Intent mapping: balance questions → mioCoins; výhry / wins count → wins; voucher balance on account → vouchers. If the user asks about their own data and the matching field is not \"unavailable\", Bob MUST answer with that value first (see BOB_SYSTEM_BASE).",
    "",
    "Additional context (general knowledge only after USER DATA; never overrides USER DATA for the user's own numbers):",
    `- Display name: ${nameLine}`,
    `- Last activity (timestamp of latest message in this thread): ${params.lastActivity}`,
    "",
    "Project:",
    "OneMil is a platform where users collect MioCoins and use them to enter contests.",
    "",
    "Contests (from DB, JSON):",
    params.contestsJson,
  ]
  return lines.join("\n")
}

/** Allowed in-app CTA targets; label is canonical per action (normalized server-side). Matches customer routes in App.tsx. */
const BOB_CTA_BY_ACTION = {
  "/games": "Soutěže",
  "/wins": "Výhry",
  "/vouchers": "Vouchery",
  "/profile": "Profil",
} as const

type BobCtaAction = keyof typeof BOB_CTA_BY_ACTION
type BobCta = { label: (typeof BOB_CTA_BY_ACTION)[BobCtaAction]; action: BobCtaAction }
type BobAssistantPayload = { text: string; cta?: BobCta | null }

function stripAssistantCodeFence(raw: string): string {
  const s = raw.trim()
  const m = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im.exec(s)
  if (m) return m[1].trim()
  return s
}

function keepOnlyLastValidJsonObject(raw: string): string {
  const s = stripAssistantCodeFence(raw).trim()
  if (!s) return s

  // Extract all top-level {...} blocks and keep the LAST valid JSON.
  const blocks: string[] = []
  let start: number | null = null
  let depth = 0
  let inStr = false
  let esc = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) {
        esc = false
      } else if (ch === "\\") {
        esc = true
      } else if (ch === '"') {
        inStr = false
      }
      continue
    }

    if (ch === '"') {
      inStr = true
      continue
    }
    if (ch === "{") {
      if (depth === 0) start = i
      depth++
      continue
    }
    if (ch === "}") {
      if (depth > 0) depth--
      if (depth === 0 && start !== null) {
        blocks.push(s.slice(start, i + 1))
        start = null
      }
    }
  }

  for (let i = blocks.length - 1; i >= 0; i--) {
    const cand = blocks[i].trim()
    try {
      const o = JSON.parse(cand) as Record<string, unknown>
      if (!o || typeof o !== "object") continue
      return cand
    } catch {
      // keep searching
    }
  }

  // No JSON object found — return trimmed raw so downstream can fallback.
  return s
}

function bobPayloadFromRawAssistantString(raw: string): BobAssistantPayload {
  const cleaned = stripAssistantCodeFence(raw)
  try {
    const o = JSON.parse(cleaned) as Record<string, unknown>
    if (!o || typeof o !== "object" || typeof o.text !== "string") {
      return { text: raw.trim() }
    }
    const text = o.text.trim()
    if ("cta" in o && o.cta === null) {
      return { text, cta: null }
    }
    if (!o.cta || typeof o.cta !== "object") {
      return { text }
    }
    const c = o.cta as Record<string, unknown>
    if (typeof c.label !== "string" || typeof c.action !== "string") {
      return { text }
    }
    const action = c.action.trim() as BobCtaAction
    if (!(action in BOB_CTA_BY_ACTION)) {
      return { text }
    }
    return { text, cta: { label: BOB_CTA_BY_ACTION[action], action } }
  } catch {
    return { text: raw.trim() }
  }
}

// NOTE: Support is never handed off automatically from ai-chat; support handoff uses cta: null.

/** Lowercase + strip diacritics for robust Czech keyword matching. */
function foldCs(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
}

type UserDataIntent = "balance" | "wins" | "vouchers" | null

function userDataIntentFromUserText(userText: string): UserDataIntent {
  const f = foldCs(userText)
  if (
    isMioCoinPurchaseProblem(userText) ||
    isGameCreditProblem(userText) ||
    isMioCoinWithdrawalQuestion(userText) ||
    isWinClaimOrDeliveryQuestion(userText) ||
    isVoucherProblemQuestion(userText) ||
    isPaymentConfirmationQuestion(userText) ||
    isGenericHelpSupportContactOrLoginProblem(userText)
  ) {
    return null
  }
  const isBalance =
    f.includes("zustatek") ||
    f.includes("zustatku") ||
    f.includes("penezen") ||
    f.includes("stav uctu") ||
    f.includes("muj stav") ||
    f.includes("kolik mam") ||
    f.includes("kolik mi zbyv") ||
    f.includes("miocoin") ||
    f.includes("mio coin") ||
    f.includes("minc") ||
    f.includes("coin")
  if (isBalance) return "balance"

  const isWins = f.includes("vyhr") || f.includes("moje vyhr")
  if (isWins) return "wins"

  const isVouchers =
    f.includes("voucher") ||
    f.includes("vouchery") ||
    f.includes("kredit") ||
    f.includes("dobit") ||
    f.includes("dobij") ||
    f.includes("platb")
  if (isVouchers) return "vouchers"

  return null
}

function isGeneralRecommendationQuestion(userText: string): boolean {
  const f = foldCs(userText)
  return (
    f.includes("doporuc") ||
    f.includes("co mam delat") ||
    f.includes("jak pokracovat")
  )
}

function isSupportRelatedQuestion(userText: string): boolean {
  const f = foldCs(userText)
  return (
    f.includes("podpora") ||
    f.includes("kontakt") ||
    f.includes("reklamac") ||
    f.includes("vratit") ||
    f.includes("refund") ||
    f.includes("problem") ||
    f.includes("nefunguje") ||
    f.includes("nejde") ||
    f.includes("chci mluvit") ||
    f.includes("lidsk")
  )
}

function hasProblemSignal(userText: string): boolean {
  const f = foldCs(userText)
  return (
    f.includes("problem") ||
    f.includes("nejde") ||
    f.includes("nefunguje") ||
    f.includes("neprips") ||
    f.includes("nepris") ||
    f.includes("nedoraz") ||
    f.includes("neotevr") ||
    f.includes("otevrit") ||
    f.includes("omylem") ||
    f.includes("spatn") ||
    f.includes("chybn") ||
    f.includes("zpozden") ||
    f.includes("stale") ||
    f.includes("porad")
  )
}

function isGenericHelpSupportContactOrLoginProblem(userText: string): boolean {
  const f = foldCs(userText)
  const isSpecificSectionProblem =
    isMioCoinPurchaseProblem(userText) ||
    isGameCreditProblem(userText) ||
    isWinClaimOrDeliveryQuestion(userText) ||
    isProfileDataChangeQuestion(userText) ||
    isVoucherProblemQuestion(userText) ||
    isPaymentConfirmationQuestion(userText) ||
    isMioCoinWithdrawalQuestion(userText) ||
    isAgeRestrictionQuestion(userText)

  if (isSpecificSectionProblem) return false

  return (
    f.includes("potrebuji pomoci") ||
    f.includes("potrebuju pomoci") ||
    f.includes("pomoc") ||
    f.includes("pomoz") ||
    f.includes("podpora") ||
    f.includes("kontakt") ||
    f.includes("chci mluvit") ||
    f.includes("prihlasen") ||
    f.includes("prihlasit") ||
    f.includes("login") ||
    f.includes("heslo") ||
    f.includes("problem")
  )
}

function isMioCoinWithdrawalQuestion(userText: string): boolean {
  const f = foldCs(userText)
  const mentionsMioCoin = f.includes("miocoin") || f.includes("mio coin")
  return (
    mentionsMioCoin &&
    (
      f.includes("vybrat") ||
      f.includes("vyber") ||
      f.includes("zpatky jako penize") ||
      f.includes("smenit") ||
      f.includes("vratit") ||
      f.includes("hotovost") ||
      f.includes("penize")
    )
  )
}

function isMioCoinPurchaseProblem(userText: string): boolean {
  const f = foldCs(userText)
  return (
    (f.includes("miocoin") || f.includes("mio coin") || f.includes("kredit")) &&
    (f.includes("koupil") || f.includes("dobij") || f.includes("dobit") || f.includes("platb")) &&
    (f.includes("neprips") || f.includes("nepris") || f.includes("nedoraz") || hasProblemSignal(userText))
  )
}

function isGameCreditProblem(userText: string): boolean {
  const f = foldCs(userText)
  return (
    (f.includes("hra") || f.includes("hru") || f.includes("hrat") || f.includes("soutez") || f.includes("tiket")) &&
    (f.includes("nejde") || f.includes("uplatnit") || f.includes("pouzit")) &&
    (f.includes("miocoin") || f.includes("kredit") || f.includes("zustatek"))
  )
}

function isWinClaimOrDeliveryQuestion(userText: string): boolean {
  const f = foldCs(userText)
  const mentionsWin = f.includes("vyhr") || f.includes("cenu") || f.includes("cena") || f.includes("bonusovou")
  return (
    mentionsWin &&
    (
      f.includes("vyzved") ||
      f.includes("poslete") ||
      f.includes("poslat") ||
      f.includes("doruc") ||
      f.includes("odeslan") ||
      f.includes("nepris") ||
      f.includes("nedoraz") ||
      f.includes("co mam ted delat") ||
      f.includes("co mam delat")
    )
  )
}

function isProfileDataChangeQuestion(userText: string): boolean {
  const f = foldCs(userText)
  return (
    (f.includes("zmenit") || f.includes("upravit") || f.includes("zmenim")) &&
    (
      f.includes("telefon") ||
      f.includes("adresa") ||
      f.includes("adresu") ||
      f.includes("doruceni") ||
      f.includes("osobni udaj")
    )
  )
}

function isVoucherProblemQuestion(userText: string): boolean {
  const f = foldCs(userText)
  return (
    f.includes("voucher") &&
    (
      f.includes("nejde") ||
      f.includes("otevrit") ||
      f.includes("uplatnit") ||
      f.includes("spatn") ||
      f.includes("omylem") ||
      f.includes("problem")
    )
  )
}

function isPaymentConfirmationQuestion(userText: string): boolean {
  const f = foldCs(userText)
  return (
    f.includes("faktur") ||
    f.includes("potvrzeni o platbe") ||
    (f.includes("potvrzeni") && f.includes("platb"))
  )
}

function isAgeRestrictionQuestion(userText: string): boolean {
  const f = foldCs(userText)
  return (
    f.includes("je mi 15") ||
    f.includes("mi je 15") ||
    f.includes("je mi 16") ||
    f.includes("mi je 16") ||
    f.includes("je mi 17") ||
    f.includes("mi je 17") ||
    f.includes("pod 18") ||
    f.includes("mladsi 18") ||
    f.includes("nedosah")
  )
}

type SupportIntentHistoryMessage = { sender: string; content: string; created_at: string }

/** Broader context for SUPPORT MODE tone (empathy, no upsell). Does NOT control whether support handoff is offered. */
function isSupportToneContext(
  userText: string,
  assistantText: string | undefined,
  // NOTE: wired for future context-aware support intent; logic still uses only current message.
  _history: SupportIntentHistoryMessage[],
): boolean {
  const q = foldCs(userText)
  const a = typeof assistantText === "string" ? foldCs(assistantText) : ""
  const hasExplicitPhrases =
    q.includes("predam podpor") ||
    q.includes("kontaktovat podporu") ||
    q.includes("predat to podpor") ||
    q.includes("napis podpore") ||
    q.includes("chci podporu") ||
    a.includes("predam podpor") ||
    a.includes("kontaktovat podporu")

  const explicitlyAsksForHelp =
    q.includes("pomoc") || q.includes("pomoz") || q.includes("help")

  const current = hasExplicitPhrases || explicitlyAsksForHelp
  if (current) return true

  const isVagueProblemFollowupPhrase = (f: string): boolean => {
    // Natural Czech follow-ups that usually mean "something didn't arrive / still not fixed"
    // and should keep the support CTA visible.
    return (
      f.includes("porad nic") ||
      f.includes("furt nic") ||
      f.includes("stale nic") ||
      f.includes("nedoslo") ||
      f.includes("neprislo") ||
      f.includes("neprisla") ||
      f.includes("nedorazilo") ||
      f.includes("nedorazila") ||
      f.includes("co s tim") ||
      f.includes("jak to resit") ||
      f.includes("jak to vyresit")
    )
  }

  // Persistent support intent (simple keyword match) — consult recent history only if
  // the current message is NOT already support intent by the strict rules above.
  // History is expected to be "most recent first" (as loaded for GPT); decay: check only last 3.
  const history = _history ?? []
  const take = Math.min(3, history.length)
  const recent = history.slice(0, take)

  const isSupportKeywordHit = (raw: string): boolean => {
    const f = foldCs(raw)
    if (!f) return false

    // Reuse existing broad support signals + common win/delivery problem phrases.
    if (isSupportRelatedQuestion(f)) return true
    if (isWinProblem(f)) return true
    if (isVagueProblemFollowupPhrase(f)) return true

    // Also accept explicit CTA/support mentions in prior context.
    if (f.includes("kontaktovat podporu")) return true
    if (f.includes("predam podpor")) return true
    if (f.includes("predat to podpor")) return true
    if (f.includes("napis podpore")) return true
    if (f.includes("chci podporu")) return true
    if (f.includes("support")) return true

    return false
  }

  // 1) Improve detection for natural follow-ups in the CURRENT message (no history required).
  if (isVagueProblemFollowupPhrase(q)) return true

  // 2) Frustration tone: short negative follow-up after an issue.
  // Only triggers if recent context already looked support-related.
  const isShortFrustration = (f: string): boolean => {
    const t = f.trim()
    if (!t) return false
    if (t.length > 18) return false
    return (
      t === "nic" ||
      t === "ne" ||
      t === "nevim" ||
      t.includes("nic") ||
      t.includes("nejde") ||
      t.includes("nefunguje") ||
      t.includes("stve") ||
      t.includes("zase") ||
      t.includes("fakt ne")
    )
  }

  if (isShortFrustration(q)) {
    for (const m of recent) {
      if (isSupportKeywordHit(m.content)) return true
    }
  }

  for (const m of recent) {
    if (isSupportKeywordHit(m.content)) return true
  }

  return false
}

function previewForLog(s: string, max = 120): string {
  const t = (s ?? "").toString().replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return t.slice(0, max) + "…"
}

function nowMs(): number {
  // Edge runtime supports performance.now(); fall back to Date.now() if needed.
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now()
  } catch {
    // ignore
  }
  return Date.now()
}

function isExplicitSupportHandoffRequest(userText: string): boolean {
  const f = foldCs(userText)
  return (
    f.includes("predat podpor") ||
    f.includes("kontaktovat podpor") ||
    f.includes("napis podpore") ||
    f.includes("chci podporu")
  )
}

/** True when assistant text clearly offers human support / admits limits (server-side support handoff gate). */
function assistantSignalsHumanSupportOffer(assistantText: string | undefined): boolean {
  if (!assistantText || typeof assistantText !== "string") return false
  const f = foldCs(assistantText)
  if (!f) return false
  if (f.includes("nevim")) return true
  if (f.includes("nejsem si jist")) return true
  if (f.includes("ted si nejsem")) return true
  if (f.includes("nepodarilo se mi")) return true
  if (f.includes("nemuzu ti to vyresit")) return true
  if (f.includes("nemuzu ti pomoct")) return true
  if (f.includes("nemam potrebn") && f.includes("informac")) return true
  if (f.includes("kontaktovat podpor")) return true
  if (f.includes("klikni") && f.includes("podpor")) return true
  if (f.includes("kliknete") && f.includes("podpor")) return true
  if (f.includes("osobni pomoc")) return true
  if (f.includes("osobni podpor")) return true
  if (f.includes("lidskou podpor")) return true
  if (f.includes("lidska podpora")) return true
  if (f.includes("spojit") && f.includes("podpor")) return true
  if (f.includes("predat") && f.includes("podpor")) return true
  if (f.includes("napis podpore")) return true
  if (f.includes("napiš podpore")) return true
  if (f.includes("napiste podpore")) return true
  return false
}

/** Hard-coded replies where we always allow the support CTA (technical limits). */
function isForcedSupportOfferReply(text: string): boolean {
  const t = text.trim()
  return (
    t.startsWith("Tuhle zprávu se mi nepodařilo zpracovat") ||
    t.startsWith("Teď se mi nepodařilo načíst výhry") ||
    t.startsWith("Teď se mi nepodařilo odpovědět") ||
    t.startsWith("Teď si nejsem jistý")
  )
}

/** When Bob may show "Kontaktovat podporu" — only when Bob offers human help or on forced technical fallback. */
function allowBobSupportCta(
  userText: string,
  assistantText: string | undefined,
  _history: SupportIntentHistoryMessage[],
): boolean {
  if (isGenericHelpSupportContactOrLoginProblem(userText)) return true
  if (isAgeRestrictionQuestion(userText)) return true
  if (assistantSignalsHumanSupportOffer(assistantText)) return true
  if (assistantText && isForcedSupportOfferReply(assistantText)) return true
  return false
}

function isWinProblem(userText: string): boolean {
  const f = foldCs(userText)
  return (
    f.includes("neprisla") ||
    f.includes("nedorazila") ||
    f.includes("kde je") ||
    f.includes("neobdrzel") ||
    f.includes("problem")
  )
}

function addOptionalSupportCta(text: string): string {
  // Keep message neutral; do not claim we forwarded anything.
  return text.trim()
}

/**
 * Questions about *this user's* balances, wins, or account state must go to GPT with USER DATA,
 * not static KB/predefined text or the short wallet/winners template replies.
 */
function shouldRouteUserDataQuestionToGpt(userText: string): boolean {
  const f = foldCs(userText)
  if (f.includes("moje vyhr")) return true
  if (f.includes("muj stav")) return true
  if (f.includes("kolik mam")) return true
  if (f.includes("mam miocoin") || f.includes("mam mio coin") || f.includes("mam minc")) return true
  if (f.includes("kolik mi zbyv")) return true
  if (f.includes("jaky je muj") && f.includes("zust")) return true
  if ((f.includes("muj") || f.includes("moje")) && (f.includes("miocoin") || f.includes("mio coin") || f.includes("minc"))) {
    return true
  }
  return false
}

/**
 * If the user message clearly targets one app section, that CTA is required (enforced server-side).
 * Tie-break when multiple sections match (earliest match in text first, then priority).
 */
function requiredBobCtaActionFromUserQuestion(userQuestion: string): BobCtaAction | null {
  const f = foldCs(userQuestion)
  if (isProfileDataChangeQuestion(userQuestion)) return "/profile"
  if (isWinClaimOrDeliveryQuestion(userQuestion)) return "/wins"
  if (isVoucherProblemQuestion(userQuestion)) return "/vouchers"
  if (isPaymentConfirmationQuestion(userQuestion)) return "/vouchers"
  if (isMioCoinPurchaseProblem(userQuestion)) return "/vouchers"
  if (isMioCoinWithdrawalQuestion(userQuestion)) return "/vouchers"
  if (isGameCreditProblem(userQuestion)) return "/games"
  const rules: Array<{ action: BobCtaAction; re: RegExp }> = [
    { action: "/games", re: /\bsoutez|hry\b|games?\b|tikety?\b|otevreni\s+tiketu?|\bhrani\b|\bhrat\b/i },
    {
      action: "/wins",
      re: /moje\s+vyhry|\bvyhry\b|\bvyher\b|\bvyhre\b|\bvyhra\b|\bvyhru\b|\bvyhram\b|\bceny\b|\bcena\b|dorucen/i,
    },
    {
      action: "/vouchers",
      re: /voucher|miocoin|mio[\s-]*coin|platb|dobit|dobij|dobijen|\bpenezen|\bkredit|\bzustatek|\bzustatku|\bbilanc/i,
    },
    { action: "/profile", re: /\bprofil|ucet|uctu|nastaven|osobni\s+udaj|notifikac|pozv[a-z]*\s+pratel|doporuc/i },
  ]
  const priority: Record<BobCtaAction, number> = {
    "/wins": 0,
    "/vouchers": 1,
    "/profile": 2,
    "/games": 3,
  }
  const hits: Array<{ action: BobCtaAction; idx: number }> = []
  for (const { action, re } of rules) {
    const m = re.exec(f)
    if (m && m.index !== undefined) hits.push({ action, idx: m.index })
  }
  if (hits.length === 0) return null
  hits.sort((a, b) => {
    if (a.idx !== b.idx) return a.idx - b.idx
    return priority[a.action] - priority[b.action]
  })
  return hits[0].action
}

function enforceRequiredSectionCta(
  userQuestion: string,
  payload: BobAssistantPayload,
  history: SupportIntentHistoryMessage[],
): BobAssistantPayload {
  if (payload.cta === null) {
    const ok = allowBobSupportCta(userQuestion, payload.text, history)
    console.log("[ai-chat] support handoff gate (enforceRequiredSectionCta)", {
      userPreview: previewForLog(userQuestion),
      assistantPreview: previewForLog(payload.text),
      ok,
    })
    if (ok) return payload
    return { text: payload.text, cta: { label: BOB_CTA_BY_ACTION["/games"], action: "/games" } }
  }
  const req = requiredBobCtaActionFromUserQuestion(userQuestion)
  if (!req) return payload
  return {
    text: payload.text,
    cta: { label: BOB_CTA_BY_ACTION[req], action: req },
  }
}

function normalizeBobPayloadBeforeFinalize(
  userQuestion: string,
  payload: BobAssistantPayload,
  history: SupportIntentHistoryMessage[],
): BobAssistantPayload {
  const stripped = payload
  if (stripped.cta === null && !allowBobSupportCta(userQuestion, stripped.text, history)) {
    console.log("[ai-chat] support handoff stripped → fallback /games (normalize)", {
      userPreview: previewForLog(userQuestion),
      assistantPreview: previewForLog(stripped.text),
      originalCta: payload.cta ?? null,
    })
    return enforceRequiredSectionCta(
      userQuestion,
      { ...stripped, cta: { label: BOB_CTA_BY_ACTION["/games"], action: "/games" } },
      history,
    )
  }
  return enforceRequiredSectionCta(userQuestion, stripped, history)
}

async function finalizeBobPayloadNormalized(
  supabase: ServiceSupabase,
  userId: string,
  currentMessageId: string,
  userQuestion: string,
  payload: BobAssistantPayload,
  history: SupportIntentHistoryMessage[],
): Promise<string> {
  return finalizeBobPayload(
    supabase,
    userId,
    currentMessageId,
    normalizeBobPayloadBeforeFinalize(userQuestion, payload, history),
  )
}

async function finalizeBobPayload(
  supabase: ServiceSupabase,
  userId: string,
  currentMessageId: string,
  payload: BobAssistantPayload,
): Promise<string> {
  const greetedText = await withBobGreetingIfNeeded(supabase, userId, currentMessageId, payload.text)
  return serializeAiMessageContentForDb(greetedText, payload.cta)
}

function shouldFallbackToAdmin(reply: string): boolean {
  const t = reply.trim()
  if (t.length === 0) return true
  const f = foldCs(t)
  return f.includes("nevim") || f.includes("nejsem si jist")
}

function jsonSuccess(replyMessageId: string) {
  return new Response(JSON.stringify({ success: true, reply_message_id: replyMessageId }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

/**
 * Session-based greeting:
 * - queries `messages.created_at` for the last user message (same `user_id`, sender=`user`)
 * - never breaks chat: on any error, returns `reply` unchanged
 */
async function withBobGreetingIfNeeded(
  supabase: ServiceSupabase,
  userId: string,
  currentMessageId: string,
  reply: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("created_at")
      .eq("user_id", userId)
      .eq("sender", "user")
      // Exclude the currently processed user message so we can detect "first ever".
      .neq("id", currentMessageId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return reply

    // No previous user message (ever) -> greeting true with "Dobrý den"
    if (!data?.created_at) {
      return `Dobrý den 🙂\n${reply}`
    }

    const lastMs = new Date(data.created_at).getTime()
    if (!Number.isFinite(lastMs)) return reply

    const diffMs = Date.now() - lastMs
    if (diffMs > BOB_GREETING_PAUSE_MS) {
      // Returning after a pause
      return `Zdravím 🙂\n${reply}`
    }

    return reply
  } catch (_e) {
    return reply
  }
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
    const body = (await req.json()) as { message_id?: string; ctaClicked?: unknown }
    if ((body as any)?.ctaClicked === true) {
      // ai-chat must never trigger support-handoff; CTA click should call support-handoff directly.
      console.log("BLOCKED SUPPORT CALL")
    }
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
      const reply = "Tuhle zprávu se mi nepodařilo zpracovat automaticky."
      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        { text: reply, cta: null },
        [],
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    // Intent debug (temporary)
    console.log("INTENT MATCH:", userContent.toLowerCase())

    const userTextLower = userContent.toLowerCase()
    const userDataIntent = userDataIntentFromUserText(userContent)
    const isGeneralReco = isGeneralRecommendationQuestion(userContent)
    const routeUserDataToGpt =
      shouldRouteUserDataQuestionToGpt(userContent) || userDataIntent !== null || isGeneralReco
    if (routeUserDataToGpt) {
      console.log("[ai-chat] user-specific data question → GPT (skip quick handlers, KB, predefined)")
    }

    // Audit-backed problem intents: handle before user-data shortcuts so Bob does not answer only with balances/counts.
    if (isMioCoinWithdrawalQuestion(userContent)) {
      const reply =
        "MioCoin je interní kredit OneMil. Není to hotovost a nelze ho vybrat ani směnit zpět za peníze."
      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        { text: reply, cta: { label: "Vouchery", action: "/vouchers" } },
        [],
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    if (isAgeRestrictionQuestion(userContent)) {
      const reply =
        "Účast je dostupná pouze pro uživatele 18+. Pokud si myslíte, že máte věk v profilu špatně, zkontrolujte osobní údaje nebo kontaktujte podporu."
      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        { text: reply, cta: null },
        [],
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    if (isGenericHelpSupportContactOrLoginProblem(userContent)) {
      const reply = foldCs(userContent).includes("prihlas")
        ? "Mrzí mě, že máte problém s přihlášením. Zkuste obnovu hesla; pokud to nepomůže, můžu vám nabídnout kontaktovat podporu."
        : "Rád pomůžu. Napište mi prosím, s čím konkrétně potřebujete poradit, nebo můžu nabídnout kontaktovat podporu."
      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        { text: reply, cta: null },
        [],
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    if (isMioCoinPurchaseProblem(userContent)) {
      const reply =
        "Mrzí mě, že se MioCoiny nepřipsaly. Zkontrolujte prosím platbu a kredit ve Voucherech; pokud se stav nezmění, kontaktujte podporu."
      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        { text: reply, cta: { label: "Vouchery", action: "/vouchers" } },
        [],
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    if (isGameCreditProblem(userContent)) {
      const reply =
        "Pokud máte dostatečný kredit a hra přesto nejde spustit, zkuste akci v Soutěžích znovu. Když problém trvá, kontaktujte podporu."
      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        { text: reply, cta: { label: "Soutěže", action: "/games" } },
        [],
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    if (isWinClaimOrDeliveryQuestion(userContent)) {
      const reply =
        "Detail výhry a další postup najdete v Moje výhry. Pokud tam chybí informace k vyzvednutí nebo doručení, kontaktujte podporu."
      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        { text: reply, cta: { label: "Výhry", action: "/wins" } },
        [],
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    if (isProfileDataChangeQuestion(userContent)) {
      const alreadyShipped = foldCs(userContent).includes("odeslan") || foldCs(userContent).includes("poslan")
      const reply = alreadyShipped
        ? "Telefon a doručovací adresu zkontrolujte v Profilu. Pokud už byla výhra odeslaná, kontaktujte podporu."
        : "Telefon, adresu doručení a osobní údaje upravíte v Profilu."
      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        { text: reply, cta: { label: "Profil", action: "/profile" } },
        [],
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    if (isVoucherProblemQuestion(userContent)) {
      const reply =
        "Zkuste voucher znovu otevřít nebo zkontrolovat v sekci Vouchery. Pokud problém trvá nebo jste koupili špatný voucher, kontaktujte podporu."
      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        { text: reply, cta: { label: "Vouchery", action: "/vouchers" } },
        [],
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    if (isPaymentConfirmationQuestion(userContent)) {
      const reply =
        "Nejsem si jistý, kde přesně je potvrzení nebo faktura v aplikaci dostupná. Zkontrolujte platbu v sekci Vouchery; pokud ji nenajdete, kontaktujte podporu."
      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        { text: reply, cta: { label: "Vouchery", action: "/vouchers" } },
        [],
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    // General recommendation questions must use USER DATA (wallet balance) and must bypass KB/referral/generic replies.
    if (isGeneralReco) {
      const { data: walletRow, error: wErr } = await supabase
        .from("wallets")
        .select("balance_coins")
        .eq("user_id", userMsg.user_id)
        .maybeSingle()

      if (wErr) {
        console.error("[ai-chat] wallets lookup failed", wErr)
      } else if (walletRow && typeof walletRow.balance_coins === "number" && Number.isFinite(walletRow.balance_coins)) {
        const bal = Math.max(0, walletRow.balance_coins)
        const reply =
          bal > 0
            ? `Máte ${formatCsNumber(bal)} MioCoinů. Doporučuji vybrat si soutěž a koupit tiket v sekci Soutěže.`
            : "Na účtu teď nemáte žádné MioCoiny. Doporučuji si je nejdřív dobít v Peněžence a pak se zapojit do soutěže."

        const finalReply = await finalizeBobPayloadNormalized(
          supabase,
          userMsg.user_id,
          messageId,
          userContent,
          bobPayloadFromRawAssistantString(reply),
          [],
        )

        const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
        if (!ins.ok) {
          return new Response(JSON.stringify({ error: ins.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
        return jsonSuccess(ins.id)
      }
      // If wallet missing/unavailable, fall through to GPT with USER DATA (KB still skipped via routeUserDataToGpt).
    }

    // 1) Dynamic user-data handlers (Supabase → quick reply). Fires for all balance-intent queries.
    if (userDataIntent === "balance") {
      const { data: walletRow, error: wErr } = await supabase
        .from("wallets")
        .select("balance_coins")
        .eq("user_id", userMsg.user_id)
        .maybeSingle()

      if (wErr) {
        console.error("[ai-chat] wallets lookup failed", wErr)
      } else {
        const safeWallet = walletRow ?? null

        if (safeWallet && typeof safeWallet.balance_coins === "number") {
          const reply = `Na vašem účtu máte ${formatCsNumber(safeWallet.balance_coins)} MioCoinů.`

          const finalReply = await finalizeBobPayloadNormalized(
            supabase,
            userMsg.user_id,
            messageId,
            userContent,
            bobPayloadFromRawAssistantString(reply),
            [],
          )

          const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)

          if (!ins.ok) {
            return new Response(JSON.stringify({ error: ins.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
          }

          return jsonSuccess(ins.id)
        }
      }
      // If wallet missing, fall through to knowledge / OpenAI
    }

    // If user asks about winning (vyhr*), ALWAYS use winners table (no GPT fallback).
    if (userDataIntent === "wins") {
      if (isWinProblem(userContent)) {
        const reply =
          "Výhra se odesílá zpravidla do týdne, pokud není uvedeno jinak. Pokud vám výhra nedorazila, klikněte na Kontaktovat podporu."

        const finalReply = await finalizeBobPayloadNormalized(
          supabase,
          userMsg.user_id,
          messageId,
          userContent,
          { text: reply, cta: null },
          [],
        )

        const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
        if (!ins.ok) {
          return new Response(JSON.stringify({ error: ins.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
        return jsonSuccess(ins.id)
      }

      console.log("DB handler: winners")
      const { count, error: winErr } = await supabase
        .from("winners")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userMsg.user_id)

      if (winErr) {
        console.error("[ai-chat] winners lookup failed", winErr)
        const reply =
          "Teď se mi nepodařilo načíst výhry z databáze. Zkuste to prosím znovu."
        const finalReply = await finalizeBobPayloadNormalized(
          supabase,
          userMsg.user_id,
          messageId,
          userContent,
          bobSupportCtaPayload(reply),
          [],
        )
        const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
        if (!ins.ok) {
          return new Response(JSON.stringify({ error: ins.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
        return jsonSuccess(ins.id)
      }

      const safeCount = typeof count === "number" ? count : 0
      const reply =
        safeCount === 0
          ? "Zatím nemáte žádnou výhru."
          : `Máte ${formatCsNumber(safeCount)} výher. Najdete je v sekci Moje výhry.`

      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        bobPayloadFromRawAssistantString(reply),
        [],
      )

      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    if (
      userTextLower.includes("tiket") ||
      userTextLower.includes("lístek") ||
      userTextLower.includes("list")
    ) {
      const { count, error: tErr } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userMsg.user_id)

      if (tErr) {
        console.error("[ai-chat] tickets lookup failed", tErr)
      } else if (typeof count === "number") {
        const reply = `Máte ${formatCsNumber(count)} tiketů.`

        const finalReply = await finalizeBobPayloadNormalized(
          supabase,
          userMsg.user_id,
          messageId,
          userContent,
          bobPayloadFromRawAssistantString(reply),
          [],
        )

        const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
        if (!ins.ok) {
          return new Response(JSON.stringify({ error: ins.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
        return jsonSuccess(ins.id)
      }
      // fall through
    }

    // Support / contact queries → offer support handoff with cta null; never suggest an email address.
    if (userTextLower.includes("podpora") || userTextLower.includes("kontakt")) {
      console.log("[ai-chat] support/contact query → cta null")
      const supportText = "Rádi ti pomůžeme. Můžu ti nabídnout kontaktovat podporu."
      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        bobSupportCtaPayload(supportText),
        [],
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    // 2) Knowledge-base: general informational only — skipped for user-specific data questions (GPT + USER DATA).
    if (!routeUserDataToGpt) {
      const extendedKb = getExtendedKnowledgeReply(userContent.trim())
      if (extendedKb) {
        console.log("KB handler: extended → rephrase")
        const rephrased = shouldRephraseKnowledge(extendedKb)
          ? await rephraseKnowledgeForBob(openaiKey, extendedKb, userContent)
          : null
        const reply = rephrased ?? extendedKb
        const signalOffer = assistantSignalsHumanSupportOffer(reply) || isForcedSupportOfferReply(reply)
        console.log("[ai-chat] support CTA check (KB extended)", {
          userPreview: previewForLog(userContent),
          assistantPreview: previewForLog(reply),
          signalOffer,
        })

        const payload: BobAssistantPayload =
          signalOffer
            ? {
                text: addOptionalSupportCta(reply),
                cta: null,
              }
            : bobPayloadFromRawAssistantString(reply)

        const finalReply = await finalizeBobPayloadNormalized(
          supabase,
          userMsg.user_id,
          messageId,
          userContent,
          payload,
          [],
        )

        const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
        if (!ins.ok) {
          return new Response(JSON.stringify({ error: ins.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
        return jsonSuccess(ins.id)
      }

      const predefined = getPredefinedReply(userContent.trim())
      if (predefined) {
        if (userTextLower.includes("funguje")) {
          console.log("KB handler: funguje → rephrase")
        } else {
          console.log("KB handler: predefined → rephrase")
        }
        const rephrased = shouldRephraseKnowledge(predefined)
          ? await rephraseKnowledgeForBob(openaiKey, predefined, userContent)
          : null
        const reply = rephrased ?? predefined
        const signalOffer = assistantSignalsHumanSupportOffer(reply) || isForcedSupportOfferReply(reply)
        console.log("[ai-chat] support CTA check (KB predefined)", {
          userPreview: previewForLog(userContent),
          assistantPreview: previewForLog(reply),
          signalOffer,
        })

        const payload: BobAssistantPayload =
          signalOffer
            ? {
                text: addOptionalSupportCta(reply),
                cta: null,
              }
            : bobPayloadFromRawAssistantString(reply)

        const finalReply = await finalizeBobPayloadNormalized(
          supabase,
          userMsg.user_id,
          messageId,
          userContent,
          payload,
          [],
        )

        const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
        if (!ins.ok) {
          return new Response(JSON.stringify({ error: ins.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
        return jsonSuccess(ins.id)
      }
    }

    // 3) GPT — parallel reads (contests, wallet, messages, profile, winners count), then OpenAI stream (USER DATA in system context).
    console.log(routeUserDataToGpt ? "GPT (user-specific, USER DATA context)" : "GPT fallback")

    // Timing must cover the entire GPT branch.
    const tGptPathStart = nowMs()
    const timing: Record<string, number> = {}
    const timingMeta = { message_id: messageId, user_id: userMsg.user_id }
    let supportMode = false
    let gptResult: Response | null = null

    try {
      while (true) {
        const tDbHistoryStart = nowMs()
        const { data: recent } = await supabase
          .from("messages")
          .select("sender, content, created_at")
          .eq("user_id", userMsg.user_id)
          .order("created_at", { ascending: false })
          .limit(OPENAI_CHAT_HISTORY_LIMIT)
        timing.db_history_ms = nowMs() - tDbHistoryStart

        const supportIntentHistory: SupportIntentHistoryMessage[] = (recent ?? []).map((m) => ({
          sender: typeof m.sender === "string" ? m.sender : "",
          content: typeof m.content === "string" ? m.content : "",
          created_at: typeof m.created_at === "string" ? m.created_at : "",
        }))

        // Separate support vs sales modes: if support intent is active, constrain GPT to support-only.
        supportMode = isSupportToneContext(userContent, undefined, supportIntentHistory)

        const tDbParallelStart = nowMs()
        const [
          { data: contests, error: contestsErr },
          { data: walletRaw, error: walletErr },
          { data: profileRow, error: profileErr },
          { count: winsCountRaw, error: winsErr },
        ] = await Promise.all([
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
            .from("profiles")
            .select("full_name")
            .eq("id", userMsg.user_id)
            .maybeSingle(),
          supabase
            .from("winners")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userMsg.user_id),
        ])
        timing.db_parallel_ms = nowMs() - tDbParallelStart

        if (contestsErr) {
          console.error("[ai-chat] contests load failed", contestsErr)
        }
        if (walletErr) {
          console.error("[ai-chat] wallet load failed", walletErr)
        }
        if (profileErr) {
          console.error("[ai-chat] profiles load failed", profileErr)
        }
        if (winsErr) {
          console.error("[ai-chat] winners count load failed", winsErr)
        }

        const contestsJson = JSON.stringify(contests ?? [])

        const safeWallet =
          walletRaw && !walletErr
            ? {
                balance_coins: walletRaw?.balance_coins ?? null,
                balance_vouchers: walletRaw?.balance_vouchers ?? null,
                bonus_balance_coins: walletRaw?.bonus_balance_coins ?? null,
              }
            : null

        const balanceCoinsForContext =
          typeof safeWallet?.balance_coins === "number" && Number.isFinite(safeWallet.balance_coins)
            ? safeWallet.balance_coins
            : null

        const displayName =
          typeof profileRow?.full_name === "string" && profileRow.full_name.trim().length > 0
            ? profileRow.full_name.trim()
            : "uživatel"

        const lastActivity =
          recent?.[0] && typeof recent[0].created_at === "string" ? recent[0].created_at : "unknown"

        const winsLoadFailed = Boolean(winsErr)
        const winsCountForContext =
          !winsLoadFailed && typeof winsCountRaw === "number" && Number.isFinite(winsCountRaw)
            ? winsCountRaw
            : null

        const vouchersForContext =
          safeWallet && typeof safeWallet.balance_vouchers === "number" && Number.isFinite(safeWallet.balance_vouchers)
            ? safeWallet.balance_vouchers
            : null

        const systemContext = buildBobContextSystemMessage({
          displayName,
          balanceCoins: balanceCoinsForContext,
          winsCount: winsCountForContext,
          winsLoadFailed,
          vouchersBalance: vouchersForContext,
          lastActivity,
          contestsJson,
        })

        const chronological = (recent ?? []).slice().reverse()
        const history = chronological.map((m) => {
          let content = typeof m.content === "string" ? m.content : ""
          // AI messages are stored as JSON {"text":"…","cta":{…}}. Strip the wrapper so
          // OpenAI receives only the natural-language text, not raw JSON with pricing data.
          if (m.sender !== "user" && content.startsWith("{")) {
            try {
              const parsed = JSON.parse(content) as { text?: unknown }
              if (parsed && typeof parsed.text === "string") content = parsed.text
            } catch { /* keep raw content */ }
          }
          return {
            role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
            content,
          }
        })

        const ph = await insertStreamingAiPlaceholder(supabase, userMsg.user_id)
        if (!ph.ok) {
          gptResult = new Response(JSON.stringify({ error: ph.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
          break
        }
        const streamingRowId = ph.id

        const applyFallbackToPlaceholder = async (
          fallbackReply: string,
          payloadOverride?: BobAssistantPayload,
        ): Promise<Response> => {
          const tPostStart = nowMs()
          const basePayload = payloadOverride ?? bobPayloadFromRawAssistantString(fallbackReply)
          const finalFallbackReply = await finalizeBobPayloadNormalized(
            supabase,
            userMsg.user_id,
            messageId,
            userContent,
            basePayload,
            supportIntentHistory,
          )
          timing.postprocess_ms = (timing.postprocess_ms ?? 0) + (nowMs() - tPostStart)
          const up = await updateAiMessageContentById(supabase, streamingRowId, finalFallbackReply)
          if (!up.ok) {
            return new Response(JSON.stringify({ error: up.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
          }
          return jsonSuccess(streamingRowId)
        }

        const model = Deno.env.get("AI_CHAT_MODEL") ?? "gpt-4o-mini"
        const controller = new AbortController()
        /** Must cover full SSE body read — do not clear when `fetch` resolves (headers only for stream). */
        let streamTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
          controller.abort()
        }, OPENAI_STREAM_TIMEOUT_MS)

        const clearStreamTimer = () => {
          if (streamTimer !== null) {
            clearTimeout(streamTimer)
            streamTimer = null
          }
        }

        let openaiRes: Response | null = null
        const tOpenAiFetchStart = nowMs()
        try {
          openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content:
                    BOB_SYSTEM_BASE +
                    (supportMode ? "\n\n" + BOB_SUPPORT_MODE_SYSTEM : "") +
                    "\n\n" +
                    systemContext,
                },
                ...history,
              ],
              max_tokens: 320,
              temperature: 0.2,
              // No `response_format: json_object` — it can prevent true token streaming; Bob still outputs JSON per system prompt.
              stream: true,
            }),
            signal: controller.signal,
          })
        } catch (e) {
          console.error("[ai-chat] OpenAI fetch failed", e)
          clearStreamTimer()
        }
        timing.openai_fetch_headers_ms = nowMs() - tOpenAiFetchStart

        if (!openaiRes || !openaiRes.ok) {
          clearStreamTimer()
          if (openaiRes && !openaiRes.ok) {
            const errText = await openaiRes.text()
            console.error("[ai-chat] OpenAI error", openaiRes.status, errText)
          }
          gptResult = await applyFallbackToPlaceholder(
            OPENAI_FAILURE_FALLBACK_TEXT,
            bobSupportCtaPayload(OPENAI_FAILURE_FALLBACK_TEXT),
          )
          break
        }

        const bodyReader = openaiRes.body?.getReader()
        if (!bodyReader) {
          clearStreamTimer()
          gptResult = await applyFallbackToPlaceholder(
            OPENAI_FAILURE_FALLBACK_TEXT,
            bobSupportCtaPayload(OPENAI_FAILURE_FALLBACK_TEXT),
          )
          break
        }

        const decoder = new TextDecoder()
        let sseCarry = ""
        let rawAssistant = ""
        let debounceT: ReturnType<typeof setTimeout> | null = null
        let flushChain: Promise<void> = Promise.resolve()

        const tOpenAiStreamStart = nowMs()
        const flushStreamingPartial = async () => {
          const partialText = extractPartialTextFromStreamJsonObject(rawAssistant)
          const rowContent = serializeAiMessageContentForDb(partialText, DEFAULT_AI_MESSAGE_CTA_FALLBACK)
          const up = await updateAiMessageContentById(supabase, streamingRowId, rowContent)
          if (!up.ok) {
            console.error("[ai-chat] streaming partial update failed", up.message)
          }
        }

        const scheduleStreamingPartialFlush = () => {
          if (debounceT !== null) clearTimeout(debounceT)
          debounceT = setTimeout(() => {
            debounceT = null
            flushChain = flushChain
              .then(() => flushStreamingPartial())
              .catch((err) => console.error("[ai-chat] streaming flush chain", err))
          }, STREAM_DB_FLUSH_MS)
        }

        let streamChunkIndex = 0
        try {
          while (true) {
            const { done, value } = await bodyReader.read()
            if (done) break
            sseCarry += decoder.decode(value, { stream: true })
            const lines = sseCarry.split(/\r?\n/)
            sseCarry = lines.pop() ?? ""
            for (const line of lines) {
              const t = line.trim()
              if (!t.startsWith("data:")) continue
              const sseData = t.slice(5).trim()
              if (sseData === "[DONE]") {
                streamChunkIndex++
                console.log("[ai-chat] stream chunk", { n: streamChunkIndex, kind: "[DONE]" })
                continue
              }
              try {
                const chunk = JSON.parse(sseData) as {
                  choices?: Array<{
                    delta?: { content?: string | null; role?: string | null }
                    finish_reason?: string | null
                  }>
                }
                streamChunkIndex++
                const choice0 = chunk?.choices?.[0]
                const delta = choice0?.delta?.content
                const deltaLen = typeof delta === "string" ? delta.length : 0
                console.log("[ai-chat] stream chunk", {
                  n: streamChunkIndex,
                  deltaLen,
                  deltaPreview: typeof delta === "string" && delta.length > 0 ? delta.slice(0, 120) : null,
                  finish_reason: choice0?.finish_reason ?? null,
                  roleDelta: choice0?.delta?.role ?? null,
                  rawAssistantLen: rawAssistant.length + deltaLen,
                })
                if (typeof delta === "string" && delta.length > 0) {
                  rawAssistant += delta
                  scheduleStreamingPartialFlush()
                }
              } catch (parseErr) {
                console.warn("[ai-chat] stream chunk JSON parse failed", {
                  preview: sseData.slice(0, 200),
                  err: parseErr instanceof Error ? parseErr.message : String(parseErr),
                })
              }
            }
          }
        } catch (e) {
          console.error("[ai-chat] OpenAI stream read failed", e)
          clearStreamTimer()
          gptResult = await applyFallbackToPlaceholder(
            OPENAI_FAILURE_FALLBACK_TEXT,
            bobSupportCtaPayload(OPENAI_FAILURE_FALLBACK_TEXT),
          )
          break
        } finally {
          clearStreamTimer()
        }
        timing.openai_stream_ms = nowMs() - tOpenAiStreamStart

        if (debounceT !== null) {
          clearTimeout(debounceT)
          debounceT = null
        }
        await flushChain
        await flushStreamingPartial()

        const rawTrimmed = keepOnlyLastValidJsonObject(rawAssistant)
        let bobPayload = bobPayloadFromRawAssistantString(rawTrimmed)
        if (!bobPayload.text.trim()) {
          gptResult = await applyFallbackToPlaceholder(
            OPENAI_FAILURE_FALLBACK_TEXT,
            bobSupportCtaPayload(OPENAI_FAILURE_FALLBACK_TEXT),
          )
          break
        }

        const allowSupport = allowBobSupportCta(userContent, bobPayload.text, supportIntentHistory)
        console.log("[ai-chat] support CTA check (GPT final)", {
          userPreview: previewForLog(userContent),
          assistantPreview: previewForLog(bobPayload.text),
          bobCta: bobPayload.cta ?? null,
          allowSupport,
        })

        if (bobPayload.cta === null && !allowSupport) {
          console.log("[ai-chat] support handoff removed → /games (GPT final)", {
            userPreview: previewForLog(userContent),
            assistantPreview: previewForLog(bobPayload.text),
          })
          bobPayload = { ...bobPayload, cta: { label: "Soutěže", action: "/games" } }
        } else if (allowSupport) {
          bobPayload = { ...bobPayload, cta: null }
        }

        if (shouldFallbackToAdmin(bobPayload.text)) {
          const finalFallbackReply = await finalizeBobPayloadNormalized(
            supabase,
            userMsg.user_id,
            messageId,
            userContent,
            { text: "Teď si nejsem jistý. Můžu ti nabídnout kontaktovat podporu.", cta: null },
            supportIntentHistory,
          )
          const up = await updateAiMessageContentById(supabase, streamingRowId, finalFallbackReply)
          if (!up.ok) {
            gptResult = new Response(JSON.stringify({ error: up.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            })
            break
          }
          gptResult = jsonSuccess(streamingRowId)
          break
        }

        const tPostStart = nowMs()
        const finalReply = await finalizeBobPayloadNormalized(
          supabase,
          userMsg.user_id,
          messageId,
          userContent,
          bobPayload,
          supportIntentHistory,
        )
        timing.postprocess_ms = (timing.postprocess_ms ?? 0) + (nowMs() - tPostStart)

        const finUp = await updateAiMessageContentById(supabase, streamingRowId, finalReply)
        if (!finUp.ok) {
          gptResult = new Response(JSON.stringify({ error: finUp.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
          break
        }

        gptResult = jsonSuccess(streamingRowId)
        break
      }
    } finally {
      // Timing log must always print for GPT path, even on early returns/fallbacks.
      try {
        timing.total_gpt_path_ms = nowMs() - tGptPathStart
        console.log("[ai-chat] timing", {
          ...timingMeta,
          supportMode,
          ...timing,
        })
      } catch (_e) {
        // Never break chat on logging failures.
      }
    }

    // Return after finally (guarantee timing log always ran).
    if (gptResult) return gptResult
    return new Response(JSON.stringify({ error: "GPT branch ended without result" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ai-chat]", msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
