import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
}

/** Exact handoff text for human support (fallback + oversized input). */
const ADMIN_FALLBACK_CONTENT = "Bob si není jistý 🤖 Přeposílám to podpoře 👍"

const MAX_USER_MESSAGE_CHARS = 500
const BOB_GREETING_PAUSE_MS = 45 * 60 * 1000
/** Max prior thread messages sent to OpenAI (excluding system layers). */
const OPENAI_CHAT_HISTORY_LIMIT = 10
const OPENAI_TIMEOUT_MS = 5000
const OPENAI_FAILURE_FALLBACK_TEXT = "Teď se mi nepodařilo odpovědět. Zkus to prosím znovu."

const BOB_WHATSAPP_FALLBACK_URL =
  "https://wa.me/420XXXXXXXXX?text=Potřebuju%20pomoc%20s%20OneMil"

const BOB_SUPPORT_HANDOFF_PHRASE = "Tohle radši předám podpoře."

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
      "MioCoin je interní kredit pro nákup voucherů a účast v soutěžích. Nelze ho vybrat ani směnit za peníze.",
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
    email: "podpora@onemil.cz",
    fallback: "Můžu tě přepojit na podporu nebo napiš na podpora@onemil.cz.",
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

  if (t.includes("doporuč") || t.includes("doporuc") || t.includes("pozvi") || t.includes("referral")) {
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
  if (text.includes("podpora") || text.includes("kontakt")) return AI_KNOWLEDGE.support.email

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
• výhry / výhra / výher / „moje výhry“ / přehled výher → {"label":"Výhry","action":"/wins"}
• peněženka / MioCoiny / dobíjení / zůstatek mincí → {"label":"Peněženka","action":"/wallet"}
• vouchery / platby / dobití → {"label":"Vouchery","action":"/vouchers"}
• moje soutěže / účast → {"label":"Moje soutěže","action":"/my-contests"}
• soutěže / tikety / losování / hraní → {"label":"Soutěže","action":"/games"}
Jiné situace: jedno volitelné „cta“ jen když dává smysl; jinak „cta“ vynech.
Při více tématech v jedné otázce zvol jedno „cta“ nejvíc odpovídající prvnímu / hlavnímu záměru (priorita pro rozklad shody: Výhry > Peněženka > Vouchery > Moje soutěže > Soutěže).
Forma doprovodné věty: mluv přirozeně a lidsky — ne jako robot. Vyhni se generickým motivačním větám typu „Pokračuj ve hře a přibliž se výhře“.
Každá odpověď jinak: přizpůsob tón otázce a TEXTu.
Buď konkrétní, když to jde: pokud jsou v TEXTu přesná čísla, zachovej je; bez nových faktů.
V poli „text“ používej názvy obrazovek tak, jak je uživatel vidí: „Peněženka“, „Soutěže“, „Výhry“, „Vouchery“ — nikdy v „text“ nepisuj vnitřní cesty (/…) ani URL.
„label“ a „action“ v „cta“ musí přesně odpovídat jedné řádce v tabulce výše (žádné jiné cesty).
Výstup musí být POUZE jeden platný JSON objekt (žádný markdown, žádné \`\`\`), např. {"text":"celá odpověď v češtině"} nebo s „cta“ podle pravidel výše.
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
 * Sole serialization path for AI `messages.content`. Default CTA unless `isBobSupportOrWhatsAppReplyText` (support handoff → keep cta null, no button).
 */
function serializeAiMessageContentForDb(responseText: unknown, cta: unknown): string {
  const payload = buildSanitizedAiMessagePayload(responseText, cta)
  if (
    !isBobSupportOrWhatsAppReplyText(payload.text) &&
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
  return serializeAiMessageContentForDb(content, null)
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
      : serializeAiMessageContentForDb(content.text, content.cta ?? null)

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

/** SYSTEM (rules) — context sandwich, first layer. Answers must be Czech. */
const BOB_SYSTEM_BASE = `You are Bob, AI assistant for OneMil.
You speak Czech.
You are helpful, short, and human.
You ALWAYS answer the user's question fully first.
ONLY suggest the next step if it makes sense for the user's question and situation — EXCEPT when the user's message clearly targets one app section (see mandatory CTA rules below); then you MUST include the matching CTA.
Do NOT push actions aggressively in general chat.
Keep responses natural and human.
NEVER ask vague follow-up questions (e.g. "upřesni dotaz", "co přesně myslíš?") when the user's intent is already clear from their message.
If the user asks a general question like "Co mám dělat?" or "Jak pokračovat?", ALWAYS use the available user data from context (Balance, Last activity, Contests JSON) and give one or two concrete next steps in the app flow — do NOT answer with generic clarification questions only.
For such general questions, base suggestions on wallet.balance_coins when Balance is present in context (e.g. low balance → Peněženka; enough for play → Soutěže); if the topic is wins or vouchers, point to Výhry or Vouchery instead of defaulting to contests. If Balance is missing from context, still give concrete OneMil steps without asking the user to "upřesnit". Never write internal paths (/games, /my-contests, /wins, /vouchers, /wallet, /profile, /customer-inbox, …) inside "text" — use visible Czech UI names (Peněženka, Soutěže, Výhry, Vouchery, Profil, …).
For support-related questions (complaints, account problems, legal, refunds, "chci mluvit s někým", urgent help): answer helpfully and NEVER add an extra action suggestion or in-app navigation CTA in the same message.
If you trigger human support fallback, return ONLY the support handoff sentence (and the app may add WhatsApp); do NOT add any other line, CTA, or internal path after that.
NEVER suggest recharge if user has enough MioCoins (use Balance from context; if balance is enough for typical contest ticket_price from contests data, do not suggest top-up).
Use real user data from the separate context message; never invent balances or activity.
If balance is not provided in context, do not mention the user's coin balance.
Put the conversational part in "text" using natural Czech and visible screen names — never put raw paths or external URLs inside "text" (exception: support handoff flow may include WhatsApp as appended by the app, not invented by you).

JSON a CTA (povinné pravidlo pro každou odpověď, kromě handoffu na podporu níže):
Každá odpověď musí být validní JSON objekt s polem text a cta.
Pole cta musí mít label (česky) a action podle tohoto pravidla:

- soutěže, hraní, MioCoin, tikety → action: '/games', label: "Soutěže"
- moje soutěže, účast → action: '/my-contests'
- výhry, historie výher → action: '/wins'
- profil, účet, nastavení → action: '/profile'
- platby, vouchery, dobití → action: '/vouchers'
- peněženka, zůstatek MioCoinů → action: '/wallet'
- cokoliv jiného → action: '/games', label: "Soutěže"

PRAVIDLA:
- vždy interní route začínající /
- nikdy cta: null (vždy objekt s label + action)
- nikdy externí URL v cta ani v text (výjimka: support handoff — pouze věta předaná podpoře, bez vlastních odkazů)
- label musí být česky a výstižně popisovat akci

Výjimka — handoff na lidskou podporu: vrať POUZE {"text":"...přesná handoff věta..."} bez pole cta (žádné tlačítko v téže zprávě).
OUTPUT FORMAT: jeden platný JSON objekt (žádný markdown, žádné trojité zpětné apostrofy v odpovědi).
If you are not sure or the user needs human support, put exactly this in "text" only (no cta):
"${BOB_SUPPORT_HANDOFF_PHRASE.trim()}"
(and the app may append a WhatsApp link; do not invent phone numbers).`

function buildBobContextSystemMessage(params: {
  displayName: string
  balanceCoins: number | null
  lastActivity: string
  contestsJson: string
}): string {
  const nameLine = params.displayName.trim() || "uživatel"
  const lines: string[] = [
    "User info:",
    `- Name: ${nameLine}`,
  ]
  if (params.balanceCoins !== null && Number.isFinite(params.balanceCoins)) {
    lines.push(`- Balance: ${formatCsNumber(params.balanceCoins)} MioCoins`)
  }
  lines.push(`- Last activity: ${params.lastActivity}`)
  lines.push("")
  lines.push("Project:")
  lines.push("OneMil is a platform where users collect MioCoins and use them to enter contests.")
  lines.push("")
  lines.push("Contests (from DB, JSON):")
  lines.push(params.contestsJson)
  return lines.join("\n")
}

function appendWhatsAppIfSupportHandoff(reply: string): string {
  const t = reply.trim()
  if (!t) return t
  const marker = BOB_SUPPORT_HANDOFF_PHRASE.replace(/\.$/, "").toLowerCase()
  if (!t.toLowerCase().includes(marker)) return reply
  if (t.includes("wa.me")) return reply
  return `${t}\n${BOB_WHATSAPP_FALLBACK_URL}`
}

/** Allowed in-app CTA targets; label is canonical per action (normalized server-side). Matches customer routes in App.tsx. */
const BOB_CTA_BY_ACTION = {
  "/games": "Soutěže",
  "/my-contests": "Moje soutěže",
  "/customer-inbox": "Soutěže",
  "/wallet": "Peněženka",
  "/wins": "Výhry",
  "/vouchers": "Vouchery",
  "/profile": "Profil",
} as const

type BobCtaAction = keyof typeof BOB_CTA_BY_ACTION
type BobCta = { label: (typeof BOB_CTA_BY_ACTION)[BobCtaAction]; action: BobCtaAction }
type BobAssistantPayload = { text: string; cta?: BobCta }

function stripAssistantCodeFence(raw: string): string {
  const s = raw.trim()
  const m = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im.exec(s)
  if (m) return m[1].trim()
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

function isBobSupportOrWhatsAppReplyText(text: string): boolean {
  const t = text.toLowerCase()
  const marker = BOB_SUPPORT_HANDOFF_PHRASE.replace(/\.$/, "").toLowerCase()
  return t.includes(marker) || t.includes("wa.me")
}

function stripCtaIfSupportOrWhatsApp(payload: BobAssistantPayload): BobAssistantPayload {
  if (isBobSupportOrWhatsAppReplyText(payload.text)) {
    return { text: payload.text }
  }
  return payload
}

/** Lowercase + strip diacritics for robust Czech keyword matching. */
function foldCs(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
}

/**
 * If the user message clearly targets one app section, that CTA is required (enforced server-side).
 * Tie-break when multiple sections match (earliest match in text first, then priority).
 */
function requiredBobCtaActionFromUserQuestion(userQuestion: string): BobCtaAction | null {
  const f = foldCs(userQuestion)
  const rules: Array<{ action: BobCtaAction; re: RegExp }> = [
    {
      action: "/wins",
      re: /moje\s+vyhry|\bvyhry\b|\bvyher\b|\bvyhre\b|\bvyhra\b|\bvyhru\b|\bvyhram\b/i,
    },
    { action: "/wallet", re: /\bpenezen|miocoin|mio[\s-]*coin\b/i },
    { action: "/vouchers", re: /voucher|platb|dobit|dobij|dobijen/i },
    { action: "/profile", re: /\bprofil|ucet|uctu|nastaven/i },
    {
      action: "/my-contests",
      re: /moje\s+soutez|ucast|ucasti|moje\s+tikety|my[\s-]contest/i,
    },
    { action: "/games", re: /\bsoutez|tikety?\b|losovan|\bhrani\b/i },
    { action: "/customer-inbox", re: /customer[\s-]inbox|inbox/i },
  ]
  const priority: Record<BobCtaAction, number> = {
    "/wins": 0,
    "/wallet": 1,
    "/vouchers": 2,
    "/profile": 3,
    "/my-contests": 4,
    "/games": 5,
    "/customer-inbox": 6,
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
): BobAssistantPayload {
  if (isBobSupportOrWhatsAppReplyText(payload.text)) return payload
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
): BobAssistantPayload {
  return enforceRequiredSectionCta(userQuestion, stripCtaIfSupportOrWhatsApp(payload))
}

async function finalizeBobPayloadNormalized(
  supabase: ServiceSupabase,
  userId: string,
  currentMessageId: string,
  userQuestion: string,
  payload: BobAssistantPayload,
): Promise<string> {
  return finalizeBobPayload(
    supabase,
    userId,
    currentMessageId,
    normalizeBobPayloadBeforeFinalize(userQuestion, payload),
  )
}

async function finalizeBobPayload(
  supabase: ServiceSupabase,
  userId: string,
  currentMessageId: string,
  payload: BobAssistantPayload,
): Promise<string> {
  const greetedText = await withBobGreetingIfNeeded(supabase, userId, currentMessageId, payload.text)
  return serializeAiMessageContentForDb(greetedText, payload.cta ?? null)
}

function shouldFallbackToAdmin(reply: string): boolean {
  const t = reply.trim()
  if (t.length === 0) return true
  return t.toLowerCase().includes("nevím")
}

/**
 * Admin handoff row: plain `content` (not Bob JSON). AI rows must use `insertAiReply` → always `serializeAiMessageContentForDb`.
 */
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

    // Intent debug (temporary)
    console.log("INTENT MATCH:", userContent.toLowerCase())

    // 1) Dynamic user-data handlers (Supabase → quick reply). No DB changes.
    const userTextLower = userContent.toLowerCase()

    if (
      userTextLower.includes("kolik mám") &&
      (userTextLower.includes("coin") || userTextLower.includes("miocoin"))
    ) {
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
    if (userTextLower.includes("vyhr")) {
      console.log("DB handler: winners")
      const { count, error: winErr } = await supabase
        .from("winners")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userMsg.user_id)

      if (winErr) {
        console.error("[ai-chat] winners lookup failed", winErr)
        const handoff = await insertAdminHandoff(supabase, userMsg.user_id)
        if (!handoff.ok) {
          return new Response(JSON.stringify({ error: handoff.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
        return jsonSuccess(handoff.id)
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

    if (userTextLower.includes("kolik mám") && userTextLower.includes("tiket")) {
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

    // 2) Knowledge-base: match approved text, then rephrase via OpenAI (facts = source only). Raw KB on API failure.
    const extendedKb = getExtendedKnowledgeReply(userContent.trim())
    if (extendedKb) {
      console.log("KB handler: extended → rephrase")
      const rephrased = shouldRephraseKnowledge(extendedKb)
        ? await rephraseKnowledgeForBob(openaiKey, extendedKb, userContent)
        : null
      const reply = rephrased ?? extendedKb

      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        bobPayloadFromRawAssistantString(reply),
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

      const finalReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        bobPayloadFromRawAssistantString(reply),
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

    // 3) GPT fallback — one SELECT for the triggering row already done above; here 4 parallel reads (contests, wallet, recent messages, profile), then OpenAI (non-streaming JSON).
    console.log("GPT fallback")
    const [
      { data: contests, error: contestsErr },
      { data: walletRaw, error: walletErr },
      { data: recent },
      { data: profileRow, error: profileErr },
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
        .from("messages")
        .select("sender, content, created_at")
        .eq("user_id", userMsg.user_id)
        .order("created_at", { ascending: false })
        .limit(OPENAI_CHAT_HISTORY_LIMIT),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userMsg.user_id)
        .maybeSingle(),
    ])

    if (contestsErr) {
      console.error("[ai-chat] contests load failed", contestsErr)
    }
    if (walletErr) {
      console.error("[ai-chat] wallet load failed", walletErr)
    }
    if (profileErr) {
      console.error("[ai-chat] profiles load failed", profileErr)
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

    const systemContext = buildBobContextSystemMessage({
      displayName,
      balanceCoins: balanceCoinsForContext,
      lastActivity,
      contestsJson,
    })

    const chronological = (recent ?? []).slice().reverse()
    const history = chronological.map((m) => ({
      role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
      content: typeof m.content === "string" ? m.content : "",
    }))

    const model = Deno.env.get("AI_CHAT_MODEL") ?? "gpt-4o-mini"
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)
    let openaiRes: Response | null = null
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
            { role: "system", content: BOB_SYSTEM_BASE },
            { role: "system", content: systemContext },
            ...history,
          ],
          max_tokens: 320,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      })
    } catch (e) {
      console.error("[ai-chat] OpenAI fetch failed", e)
    } finally {
      clearTimeout(timer)
    }

    if (!openaiRes || !openaiRes.ok) {
      if (openaiRes && !openaiRes.ok) {
        const errText = await openaiRes.text()
        console.error("[ai-chat] OpenAI error", openaiRes.status, errText)
      }
      const fallbackReply = OPENAI_FAILURE_FALLBACK_TEXT
      const finalFallbackReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        bobPayloadFromRawAssistantString(fallbackReply),
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalFallbackReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    const openaiData = (await openaiRes.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
    }
    const rawContent = openaiData?.choices?.[0]?.message?.content
    const rawAssistant = typeof rawContent === "string" ? rawContent.trim() : ""
    let payload = bobPayloadFromRawAssistantString(rawAssistant)
    payload = {
      ...payload,
      text: appendWhatsAppIfSupportHandoff(payload.text),
    }
    if (!payload.text.trim()) {
      const fallbackReply = OPENAI_FAILURE_FALLBACK_TEXT
      const finalFallbackReply = await finalizeBobPayloadNormalized(
        supabase,
        userMsg.user_id,
        messageId,
        userContent,
        bobPayloadFromRawAssistantString(fallbackReply),
      )
      const ins = await insertAiReply(supabase, userMsg.user_id, finalFallbackReply)
      if (!ins.ok) {
        return new Response(JSON.stringify({ error: ins.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(ins.id)
    }

    if (shouldFallbackToAdmin(payload.text)) {
      const handoff = await insertAdminHandoff(supabase, userMsg.user_id)
      if (!handoff.ok) {
        return new Response(JSON.stringify({ error: handoff.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      return jsonSuccess(handoff.id)
    }

    const finalReply = await finalizeBobPayloadNormalized(
      supabase,
      userMsg.user_id,
      messageId,
      userContent,
      payload,
    )

    const ins = await insertAiReply(supabase, userMsg.user_id, finalReply)
    if (!ins.ok) {
      return new Response(JSON.stringify({ error: ins.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    return jsonSuccess(ins.id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ai-chat]", msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
