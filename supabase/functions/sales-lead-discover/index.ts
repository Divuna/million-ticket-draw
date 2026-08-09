import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { verifyCompanyWebsite, verifyDiscoveredCompanySite } from "../_shared/companyWebsiteVerifier.ts";
import {
  appendDiagnosticsEntry,
  buildDiagnosticsEntry,
  generateCandidateUrlsWithDiagnostics,
  type CandidateSearchDiagnosticsEntry,
} from "../_shared/companyCandidateSearch.ts";
import { aresByIco, aresByName, type RegistryRecord } from "../_shared/companyRegistryEnrich.ts";
import {
  crawlCompanyWebsite,
  verifyEmailOnOfficialSourcePage,
  type VerifiedSourceEmailResult,
} from "../_shared/companyEmailCrawler.ts";

// ============================================================================
// sales-lead-discover — WORKER Discovery Jobu (dávkové zpracování).
// Poháněný pg_cronem (interní token). Zpracuje 1 aktivní job po dávce a uloží
// průběh; cron ho volá znovu, dokud nedodá requested_count ULOŽENÝCH firem s
// ověřeným webem, nedojdou kandidáti, nebo se nedosáhne max_candidates.
//
// PRINCIP: kandidáti z AKTIVNÍHO web search (companyCandidateSearch) — AI
// nevymýšlí seznam firem. Web se přísně ověří (verifyDiscoveredCompanySite),
// IČO/DIČ/adresa z ARES (autoritativně), AI JEN klasifikuje obor/relevanci.
// Veřejný e-mail hledá backendový crawler až na ověřeném oficiálním webu.
// Přesný nález a URL se ještě jednou ověří sdíleným verifierem; bez důkazu
// vznikne lead bez e-mailu a bez návrhu. Nic se neposílá.
// ============================================================================

const AI_MODEL = Deno.env.get("SALES_LEADS_AI_MODEL") ?? "gpt-4o-mini";
const BATCH_MAX = 12;
const TIME_BUDGET_MS = 90_000;
const MAX_EMPTY_ROUNDS = 3;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function dbg(stage: string, data: Record<string, unknown>): void {
  try { console.log(`[discover-worker] ${stage} ${JSON.stringify(data)}`); } catch { /* never throw */ }
}

function registrableDomain(host: string): string {
  const l = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  return l.length <= 2 ? l.join(".") : l.slice(-2).join(".");
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}

function normName(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

interface Classification { slug: string | null; relevant: boolean; summary: string; failed?: boolean }

type VerifiedDiscoveryContact = Extract<VerifiedSourceEmailResult, { verified: true }>;

async function findVerifiedDiscoveryContact(
  website: string,
  companyName: string,
): Promise<VerifiedDiscoveryContact | null> {
  // Crawler je zdroj kandidáta, nikoli důkaz. Důkaz vznikne až druhým stažením
  // přesné stránky přes stejný verifier jako v sales-lead-enrich-contact.
  const candidate = await crawlCompanyWebsite(website, companyName, "", "");
  if (!candidate.found) return null;
  const verified = await verifyEmailOnOfficialSourcePage({
    officialWebsite: website,
    candidateEmail: candidate.email,
    sourceUrl: candidate.sourceUrl,
  });
  return verified.verified ? verified : null;
}

async function classify(
  name: string, snippet: string, groups: { slug: string; label: string }[], openaiKey: string,
): Promise<Classification> {
  const list = groups.map((g) => `${g.slug} = ${g.label}`).join("; ");
  const sys = `Jsi klasifikátor firem pro B2B akvizici OneMil. Zařaď firmu do JEDNÉ kategorie z číselníku a posuď, zda je to reálná firma vhodná k oslovení. Nevymýšlej fakta; klasifikuj jen podle názvu a útržku webu. Vrať POUZE JSON {"slug": <slug z číselníku nebo null>, "relevant": true|false, "summary": "<max 160 znaků>"}.`;
  const user = `Číselník kategorií: ${list}.\nNázev firmy: ${name}\nÚtržek webu: ${snippet.slice(0, 400)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: AI_MODEL, temperature: 0, response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) return { slug: null, relevant: false, summary: "", failed: true };
    const j = await res.json();
    const parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
    return {
      slug: typeof parsed.slug === "string" ? parsed.slug : null,
      relevant: parsed.relevant === true,
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 200) : "",
    };
  } catch {
    return { slug: null, relevant: false, summary: "", failed: true };
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");
  // Auth: jen interní token (cron). Ne uživatelské volání.
  const token = req.headers.get("x-internal-token") ?? "";
  const expected = Deno.env.get("SALES_LEADS_WORKER_TOKEN") ?? Deno.env.get("INTERNAL_FUNCTION_TOKEN") ?? "";
  if (!expected || token !== expected) return jsonResponse({ success: false, error: "unauthorized" }, 401);

  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return jsonResponse({ success: false, error: "ai_not_configured" }, 503);

  // ── Vezmi 1 aktivní job ──────────────────────────────────────────────────
  const { data: jobRow } = await supabaseAdmin
    .from("sales_lead_discovery_jobs")
    .select("*").in("status", ["queued", "running"]).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!jobRow) return jsonResponse({ success: true, no_job: true });
  const job = jobRow as Record<string, unknown>;
  const jobId = job.id as string;
  const leadGroup = job.lead_group as string;

  await supabaseAdmin.from("sales_lead_discovery_jobs").update({
    status: "running", started_at: job.started_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  const { data: groupRows } = await supabaseAdmin.from("sales_lead_groups").select("slug, label").eq("is_active", true);
  const groups = (groupRows ?? []) as { slug: string; label: string }[];
  const validSlugs = new Set(groups.map((g) => g.slug));

  // Stav jobu
  let pool = Array.isArray(job.candidate_pool) ? (job.candidate_pool as string[]) : [];
  let cursor = job.cursor as number;
  let searchRounds = job.search_rounds as number;
  let searchExhausted = job.search_exhausted as boolean;
  // Historie diagnostiky přežívá napříč cron ticky — načti a jen připisuj.
  let searchDiagnostics: CandidateSearchDiagnosticsEntry[] =
    Array.isArray(job.search_diagnostics) ? (job.search_diagnostics as CandidateSearchDiagnosticsEntry[]) : [];
  const requested = job.requested_count as number;
  const maxCandidates = job.max_candidates as number;
  const counters = {
    candidates_checked: job.candidates_checked as number,
    created_count: job.created_count as number,
    duplicates: job.duplicates as number,
    websites_rejected: job.websites_rejected as number,
    wrong_category: job.wrong_category as number,
    with_ico: job.with_ico as number,
    with_dic: job.with_dic as number,
    with_address: job.with_address as number,
    with_phone: job.with_phone as number,
  };

  // Trychtyrova diagnostika: pocty po fazich a duvodech. Jen cisla a kody.
  const funnel: Record<string, unknown> =
    (job.funnel && typeof job.funnel === "object" && !Array.isArray(job.funnel))
      ? { ...(job.funnel as Record<string, unknown>) }
      : {};
  const bump = (key: string, by = 1) => {
    funnel[key] = (typeof funnel[key] === "number" ? funnel[key] as number : 0) + by;
  };
  const bumpReason = (bucket: string, reason: string) => {
    const current = (funnel[bucket] && typeof funnel[bucket] === "object" && !Array.isArray(funnel[bucket]))
      ? { ...(funnel[bucket] as Record<string, number>) } : {};
    const key = (reason || "unknown").slice(0, 60);
    current[key] = (current[key] ?? 0) + 1;
    funnel[bucket] = current;
  };

  const deadline = Date.now() + TIME_BUDGET_MS;
  let processed = 0;
  let emptyRounds = 0;

  while (
    Date.now() < deadline && processed < BATCH_MAX &&
    counters.created_count < requested && counters.candidates_checked < maxCandidates
  ) {
    // Doplň frontu kandidátů, když dojde.
    if (cursor >= pool.length) {
      if (searchExhausted) break;
      const { urls: fresh, diagnostics } = await generateCandidateUrlsWithDiagnostics({
        leadGroup,
        round: searchRounds,
        openaiKey,
      });
      const added = fresh.filter((u) => !pool.includes(u));
      searchDiagnostics = appendDiagnosticsEntry(
        searchDiagnostics,
        buildDiagnosticsEntry({ round: searchRounds, diagnostics, addedToPool: added.length }),
      );
      searchRounds++;
      if (added.length === 0) {
        emptyRounds++;
        if (emptyRounds >= MAX_EMPTY_ROUNDS) { searchExhausted = true; break; }
        continue;
      }
      emptyRounds = 0;
      bump("candidates_from_search", added.length);
      pool = [...pool, ...added];
    }

    const url = pool[cursor];
    cursor++;
    processed++;
    counters.candidates_checked++;

    const site = await verifyDiscoveredCompanySite(url);
    bump("checked");
    if (!site.verified || !site.website) {
      counters.websites_rejected++;
      bumpReason("site_rejected", site.reason || "site_unverified");
      continue;
    }

    // Autoritativní registr (ARES): podle IČO na webu, jinak podle názvu.
    let reg: RegistryRecord | null = null;
    if (site.icoOnPage) reg = await aresByIco(site.icoOnPage);
    if (!reg && site.companyName) reg = await aresByName(site.companyName);
    const name = reg?.legalName ?? site.companyName;
    if (!name) { counters.websites_rejected++; bump("no_company_name"); continue; }

    const ico = reg?.ico ?? site.icoOnPage ?? null;
    const official = await verifyCompanyWebsite({
      companyName: name,
      ico,
      candidates: [{ url: site.website, source: "discovery_candidate" }],
    });
    if (official.status !== "verified" || !official.website) {
      counters.websites_rejected++;
      bumpReason("official_rejected", official.alternatives?.[0]?.reason || "company_identity_not_confirmed");
      continue;
    }

    // Dedup proti existujícím leadům (doména / IČO / název).
    const domain = registrableDomain(hostOf(official.website));
    let dupQuery = supabaseAdmin.from("sales_leads").select("id").limit(1);
    const orParts = [`website_domain.eq.${domain}`, `company_name.ilike.${name.replace(/[,%]/g, " ")}`];
    if (ico) orParts.push(`ico.eq.${ico}`);
    dupQuery = dupQuery.or(orParts.join(","));
    const { data: dupRows } = await dupQuery;
    if (dupRows && dupRows.length > 0) { counters.duplicates++; bump("duplicates"); continue; }

    // AI klasifikace oboru (jen klasifikace/relevance/shrnutí).
    const cls = await classify(name, site.snippet, groups, openaiKey);
    if (cls.failed) { bump("classifier_failed"); continue; }
    if (!cls.relevant) { bump("classified_irrelevant"); continue; }
    // Firma prosla overenim webu i ARES. Kdyz klasifikator nezvladne urcit
    // kategorii, je spravne ji zaradit do existujici kategorie "jine", ne
    // zahodit. Kategorie neni bezpecnostni kontrola.
    let targetGroup = cls.slug === leadGroup ? leadGroup : (cls.slug && validSlugs.has(cls.slug) ? cls.slug : null);
    if (!targetGroup && validSlugs.has("jine")) {
      targetGroup = "jine";
      bump("classified_fallback_other");
    }
    if (!targetGroup) { counters.wrong_category++; bump("wrong_category"); continue; }
    const isTargetSegment = targetGroup === leadGroup;

    // E-mail je volitelný bonus. Nedoložený výsledek se nikam neukládá a
    // nebrání vytvoření jinak platného leadu.
    const verifiedContact = await findVerifiedDiscoveryContact(official.website, name);
    bump(verifiedContact ? "email_found" : "email_missing");
    bump(verifiedContact ? "email_found" : "email_missing");

    const nowIso = new Date().toISOString();
    const discoveryMeta = {
      model: AI_MODEL, run_at: nowIso, job_id: jobId, lead_group_label: groups.find((g) => g.slug === targetGroup)?.label ?? null,
      classification: { slug: cls.slug, summary: cls.summary },
      website_verification: {
        status: official.status, confidence: official.confidence, source: official.source,
        verifiedAt: official.verifiedAt, evidence: official.evidence, alternatives: official.alternatives,
      },
    };

    const baseRpcArgs = {
      p_created_by: job.created_by,
      p_company_name: name,
      p_lead_group: targetGroup,
      p_discovery_source: "ai_navrh",
      p_lead_quality: site.icoOnPage ? 3 : 2,
      p_discovery_meta: discoveryMeta,
      p_website: official.website,
      p_ico: ico,
      p_city: reg?.city ?? null,
      p_industry: groups.find((g) => g.slug === targetGroup)?.label ?? null,
    };
    const rpcName = verifiedContact ? "sales_lead_propose_with_contact" : "sales_lead_propose";
    const rpcArgs = verifiedContact
      ? {
        ...baseRpcArgs,
        p_email: verifiedContact.email,
        p_email_source_url: verifiedContact.sourceUrl,
        p_proposed_by: "backend_verified_official_website",
      }
      : baseRpcArgs;
    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc(rpcName, rpcArgs);
    if (rpcErr) { dbg("rpc_error", { url, error: rpcErr.message }); bump("rpc_error"); continue; }
    const res = (rpcData ?? {}) as {
      outcome?: string;
      reason?: string;
      lead_id?: string;
      contact_stored?: boolean;
      verified_at?: string;
    };

    if (res.outcome !== "created") {
      if (res.outcome === "skipped") counters.duplicates++;
      bumpReason("rpc_rejected", res.reason || res.outcome || "unknown");
      continue;
    }

    // Enrichment bez hádání — jen doložitelné údaje (do jsonb, netriggeruje web).
    const provenance: Record<string, unknown> = {
      website: { value: official.website, source: "web_search+strict_verify", verified_at: official.verifiedAt, confidence: official.confidence },
    };
    if (ico) provenance.ico = { value: ico, source: reg?.ico ? "ARES" : "web", verified_at: nowIso };
    if (reg?.dic) provenance.dic = { value: reg.dic, source: "ARES", verified_at: nowIso };
    if (reg?.address) provenance.address = { value: reg.address, source: "ARES", verified_at: nowIso };
    if (reg?.city) provenance.city = { value: reg.city, source: "ARES", verified_at: nowIso };
    if (site.phone) provenance.phone = { value: site.phone, source: "website", verified_at: nowIso };
    if (site.contactFormUrl) provenance.contact_form = { value: site.contactFormUrl, source: "website", verified_at: nowIso };
    if (verifiedContact && res.contact_stored === true) {
      provenance.email = {
        value: verifiedContact.email,
        source_url: verifiedContact.sourceUrl,
        method: "backend_verified_official_website",
        verified_at: res.verified_at,
      };
    }

    const leadId = res.lead_id;
    if (leadId) {
      await supabaseAdmin.from("sales_leads").update({
        dic: reg?.dic ?? null,
        contact_phone: site.phone ?? null,
        ai_research_summary: cls.summary || null,
        contact_data_provenance: provenance,
      }).eq("id", leadId);
    }

    // Lead skutecne vznikl v DB. Zapocitej ho jako vytvoreny i kdyz klasifikator
    // urcil jiny (ale platny a aktivni) obor — jinak job hlasi 0 vytvorenych,
    // prestoze firmy ulozil, a spotrebuje cely rozpocet kandidatu.
    counters.created_count++;
    bump("created");
    bump(isTargetSegment ? "created_in_target_group" : "created_in_other_group");
    if (ico) counters.with_ico++;
    if (reg?.dic) counters.with_dic++;
    if (reg?.address) counters.with_address++;
    if (site.phone) counters.with_phone++;
    dbg("saved", {
      company: name,
      website: official.website,
      group: targetGroup,
      target: isTargetSegment,
      email_verified: res.contact_stored === true,
    });
  }

  // ── Rozhodni finish stav ───────────────────────────────────────────────────
  let status = "running";
  let finishReason: string | null = null;
  if (counters.created_count >= requested) { status = "done"; finishReason = "target_reached"; }
  else if (counters.candidates_checked >= maxCandidates) { status = "done"; finishReason = "max_candidates_reached"; }
  else if (searchExhausted && cursor >= pool.length) { status = "done"; finishReason = "candidates_exhausted"; }

  await supabaseAdmin.from("sales_lead_discovery_jobs").update({
    ...counters,
    candidate_pool: pool, cursor, search_rounds: searchRounds, search_exhausted: searchExhausted,
    funnel,
    search_diagnostics: searchDiagnostics,
    status, finish_reason: finishReason,
    finished_at: status === "done" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  return jsonResponse({ success: true, job_id: jobId, status, finish_reason: finishReason, ...counters, processed });
});
