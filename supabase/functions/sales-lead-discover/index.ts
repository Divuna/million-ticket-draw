import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { verifyCompanyWebsite } from "../_shared/companyWebsiteVerifier.ts";
import { findOfficialWebsiteCandidates } from "../_shared/companyWebsiteSearch.ts";
import { crawlCompanyWebsite, EMAIL_RE, normalizeCompanyWebsite } from "../_shared/companyEmailCrawler.ts";

// ============================================================================
// sales-lead-discover — automatické NAVRŽENÍ nových firemních leadů.
// Spouští výhradně člověk s oprávněním sales_leads.manage.
//
// Cíl: hledat firmy, které lze SKUTEČNĚ oslovit — s ověřeným oficiálním webem
// a pokud možno i veřejným kontaktním e-mailem.
//
// Postup na firmu:
//   1. AI navrhne názvy reálných firem dle segmentu (NENÍ zdroj pravdy pro web).
//   2. Backend aktivně DOHLEDÁ pravděpodobný oficiální web přes webové
//      vyhledávání (companyWebsiteSearch) + případné AI odhady jako kandidáty.
//   3. Každý kandidát nezávisle OVĚŘÍ (ARES + HTTP + kontrola identity firmy,
//      parked/prázdný web zamítne, sleduje redirect na oficiální doménu).
//   4. Bez ověřeného webu se firma NEUKLÁDÁ (žádné prázdné leady jen s názvem).
//   5. Na ověřeném webu dohledá veřejný e-mail (homepage + kontakt/o-nás +
//      mailto). E-mail se NIKDY nevymýšlí; když není, lead se uloží jen s webem.
//
// Nic se neodesílá; každý návrh i e-mail musí člověk ručně schválit.
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_MODEL = Deno.env.get("SALES_LEADS_AI_MODEL") ?? "gpt-4o-mini";
const AI_TIMEOUT_MS = 25000;
const MAX_PER_RUN = 10;
const DEFAULT_LIMIT = 5;

const FALLBACK_GROUP_LABELS: Record<string, string> = {
  "e-shopy": "E-shopy",
  "auto-moto": "Auto / moto",
  "luxusni-zbozi": "Luxusní zboží",
  sport: "Sport",
  cestovani: "Cestování",
  gastronomie: "Gastronomie",
  "lokalni-sluzby": "Lokální služby",
  jine: "Jiné",
};

const DISCOVER_SYSTEM_PROMPT = `Jsi rešeršní asistent OneMil. Navrhni reálné české firmy vhodné k oslovení do věrnostního programu OneMil pro zadanou skupinu.

PŘÍSNÉ ZÁKAZY:
- NIKDY NEVYMÝŠLEJ e-mail, telefon ani jméno osoby. Vracej jen název firmy, případně tip na web, IČO a město, pokud je veřejně známé; jinak vynech.
- Web je jen NÁVRH — backend si oficiální web sám dohledá a nezávisle ověří. Když web neznáš jistě, vrať website = null.
- Pokud e-mail firmy neznáš jistě z veřejného webu, vrať email = null — nehádej, backend si e-mail dohledá sám na ověřeném webu firmy.
- NETVRDÍ partnerství ani dohodu s OneMil.
- NESLIBUJ žádné ceny ani podmínky.
- NEPOUŽÍVEJ slova casino, hazard, sázka, loterie, jackpot.

Výstup: vrať POUZE validní JSON objekt {"companies": [...]}. Každá položka:
{"company_name": string, "website": string|null, "alternative_websites": string[], "website_source": string|null, "ico": string|null, "city": string|null, "industry": string|null, "lead_quality": 0|1|2|3, "rationale": string, "email": string|null}
lead_quality = odhad vhodnosti (0 neznámé … 3 vysoká). rationale = krátké interní zdůvodnění. "website"/"email" jsou jen volitelné nápovědy; backend si web i e-mail vždy ověřuje/dohledává. Vše je neověřený návrh k ruční kontrole člověkem.`;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ProposedCompany {
  company_name?: unknown;
  website?: unknown;
  ico?: unknown;
  city?: unknown;
  industry?: unknown;
  lead_quality?: unknown;
  rationale?: unknown;
  email?: unknown;
  email_source_url?: unknown;
  alternative_websites?: unknown;
  website_source?: unknown;
}

async function resolveLeadGroup(
  supabaseAdmin: ReturnType<typeof createClient>,
  leadGroup: string,
): Promise<{ valid: true; label: string } | { valid: false }> {
  if (!leadGroup) return { valid: false };

  const { data, error } = await supabaseAdmin
    .from("sales_lead_groups")
    .select("slug, label, is_active")
    .eq("slug", leadGroup)
    .eq("is_active", true)
    .maybeSingle();

  if (!error) {
    if (data?.label) return { valid: true, label: String(data.label) };
    return { valid: false };
  }

  const fallbackLabel = FALLBACK_GROUP_LABELS[leadGroup];
  if (fallbackLabel) return { valid: true, label: fallbackLabel };
  return { valid: false };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "missing_authorization_header" }, 401);
    }
    const jwtToken = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwtToken);
    const caller = userData?.user;
    if (userError || !caller) {
      return jsonResponse({ success: false, error: "invalid_authorization_token" }, 401);
    }
    const { data: canManage } = await supabaseAdmin.rpc("has_admin_permission", {
      check_key: "sales_leads.manage",
      check_user_id: caller.id,
    });
    if (canManage !== true) {
      return jsonResponse({ success: false, error: "access_denied_sales_leads_manage_only" }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ success: false, error: "invalid_json" }, 400);
    }

    const leadGroup = typeof body.lead_group === "string" ? body.lead_group.trim() : "";
    const resolvedGroup = await resolveLeadGroup(supabaseAdmin, leadGroup);
    if (!resolvedGroup.valid) {
      return jsonResponse({ success: false, error: "invalid_lead_group" }, 400);
    }

    let limit = typeof body.limit === "number" ? Math.floor(body.limit) : DEFAULT_LIMIT;
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_PER_RUN) limit = MAX_PER_RUN;

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return jsonResponse({ success: false, error: "ai_not_configured" }, 503);
    }

    const userPrompt = `Skupina: ${resolvedGroup.label} (${leadGroup})\nPočet návrhů: ${limit}\n\nNavrhni ${limit} reálných českých firem pro tuto skupinu dle pravidel. Vrať JSON {"companies":[...]}.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    let raw = "";
    try {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: AI_MODEL,
          temperature: 0.5,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: DISCOVER_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!aiRes.ok) return jsonResponse({ success: false, error: "ai_request_failed" }, 502);
      const aiJson = await aiRes.json();
      raw = (aiJson?.choices?.[0]?.message?.content ?? "").trim();
    } catch {
      return jsonResponse({ success: false, error: "ai_request_failed" }, 502);
    } finally {
      clearTimeout(timer);
    }

    let companies: ProposedCompany[] = [];
    try {
      const parsed = JSON.parse(raw) as { companies?: unknown };
      companies = Array.isArray(parsed.companies) ? (parsed.companies as ProposedCompany[]) : [];
    } catch {
      return jsonResponse({ success: false, error: "ai_invalid_format" }, 502);
    }
    companies = companies.slice(0, limit);

    let candidatesChecked = 0;
    let created = 0;
    let createdWithEmail = 0;
    let createdWithoutEmail = 0;
    let skipped = 0;
    let errored = 0;
    let websitesVerified = 0;
    let websitesRejected = 0;
    const details: { company: string; outcome: string; reason?: string; has_email?: boolean }[] = [];

    for (const c of companies) {
      const name = typeof c.company_name === "string" ? c.company_name.trim() : "";
      if (!name) { errored++; continue; }
      candidatesChecked++;

      const city = typeof c.city === "string" ? c.city : null;
      const icoHint = typeof c.ico === "string" ? c.ico : null;

      // ── 1. Aktivně dohledej pravděpodobný oficiální web přes webové vyhledávání.
      const searchCandidates = await findOfficialWebsiteCandidates({
        companyName: name,
        city,
        ico: icoHint,
        openaiKey,
      });

      // ── 2. Přidej AI odhady webu jako doplňkové kandidáty (verifier je stejně ověří).
      const websiteRaw = typeof c.website === "string" ? c.website.trim() : "";
      const alternatives = Array.isArray(c.alternative_websites)
        ? c.alternative_websites.filter((v): v is string => typeof v === "string") : [];
      const aiCandidates = [websiteRaw, ...alternatives].filter(Boolean).map((url, index) => ({
        url,
        source: index === 0 && typeof c.website_source === "string" ? c.website_source : "AI candidate",
      }));

      // Vyhledané weby jdou první (spolehlivější než odhad), pak AI odhady.
      const candidates = [...searchCandidates, ...aiCandidates];

      // ── 3. Nezávislé ověření identity — AI ani vyhledávač nejsou důkaz.
      const verification = await verifyCompanyWebsite({ companyName: name, ico: icoHint, candidates });
      const website = verification.status === "verified" ? verification.website : null;

      // ── 4. Bez ověřeného webu firmu NEUKLÁDÁME (žádné prázdné leady jen s názvem).
      if (!website) {
        websitesRejected++;
        details.push({ company: name, outcome: "skipped", reason: "unverified_website" });
        continue;
      }
      websitesVerified++;

      // ── 5. Na ověřeném webu dohledej veřejný e-mail (AI odhad je jen nápověda).
      const aiEmailRaw = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";
      const aiHintEmail = EMAIL_RE.test(aiEmailRaw) ? aiEmailRaw : "";
      const aiSourceUrlRaw = typeof c.email_source_url === "string" ? c.email_source_url.trim() : "";
      const aiSourceUrl = aiSourceUrlRaw ? (normalizeCompanyWebsite(aiSourceUrlRaw) ?? "") : "";
      const crawl = await crawlCompanyWebsite(website, aiHintEmail, aiSourceUrl);

      const qualityRaw = typeof c.lead_quality === "number" ? Math.floor(c.lead_quality) : 0;
      const quality = Math.min(3, Math.max(0, qualityRaw));
      const discoveryMeta = {
        model: AI_MODEL,
        rationale: typeof c.rationale === "string" ? c.rationale : null,
        run_at: new Date().toISOString(),
        run_by: caller.id,
        lead_group_label: resolvedGroup.label,
        website_verification: verification,
      };

      if (crawl.found) {
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("sales_lead_propose_with_contact", {
          p_created_by: caller.id,
          p_company_name: name,
          p_lead_group: leadGroup,
          p_discovery_source: "ai_navrh",
          p_email: crawl.email,
          p_email_source_url: crawl.sourceUrl,
          p_discovery_meta: discoveryMeta,
          p_website: website,
          p_ico: verification.ico,
          p_city: city,
          p_industry: typeof c.industry === "string" ? c.industry : null,
          p_lead_quality: quality,
          p_proposed_by: "ai",
        });

        if (rpcErr) { errored++; details.push({ company: name, outcome: "error", reason: "rpc_failed" }); continue; }
        const res = (rpcData ?? {}) as { outcome?: string; reason?: string };

        if (res.outcome === "created") {
          created++;
          createdWithEmail++;
          const leadId = (rpcData as { lead_id?: string } | null)?.lead_id;
          if (leadId) await supabaseAdmin.from("sales_leads").update({
            contact_data_provenance: { email: { source: crawl.sourceUrl, confidence: 95, verified_at: new Date().toISOString() } },
          }).eq("id", leadId);
          details.push({ company: name, outcome: "created", has_email: true });
        } else if (res.outcome === "skipped") {
          skipped++;
          details.push({ company: name, outcome: "skipped", reason: res.reason });
        } else {
          errored++;
          details.push({ company: name, outcome: "error", reason: res.reason });
        }
      } else {
        const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("sales_lead_propose", {
          p_created_by: caller.id,
          p_company_name: name,
          p_lead_group: leadGroup,
          p_discovery_source: "ai_navrh",
          p_lead_quality: quality,
          p_discovery_meta: discoveryMeta,
          p_website: website,
          p_ico: verification.ico,
          p_city: city,
          p_industry: typeof c.industry === "string" ? c.industry : null,
        });

        if (rpcErr) { errored++; details.push({ company: name, outcome: "error", reason: "rpc_failed" }); continue; }
        const res = (rpcData ?? {}) as { outcome?: string; reason?: string };

        if (res.outcome === "created") {
          created++;
          createdWithoutEmail++;
          details.push({ company: name, outcome: "created", has_email: false });
        } else if (res.outcome === "skipped") {
          skipped++;
          details.push({ company: name, outcome: "skipped", reason: res.reason });
        } else {
          errored++;
          details.push({ company: name, outcome: "error", reason: res.reason });
        }
      }
    }

    return jsonResponse({
      success: true,
      lead_group: leadGroup,
      lead_group_label: resolvedGroup.label,
      requested: limit,
      proposed_by_ai: companies.length,
      candidates_checked: candidatesChecked,
      created,
      created_with_email: createdWithEmail,
      created_without_email: createdWithoutEmail,
      websites_verified: websitesVerified,
      websites_rejected: websitesRejected,
      skipped,
      errored,
      details,
    });
  } catch (_err) {
    return jsonResponse({ success: false, error: "internal_error" }, 500);
  }
});
