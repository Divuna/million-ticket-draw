export interface WorkIntakeSearchCandidate {
  website: string;
  public_email: string;
  email_source_url: string;
}

export type BatchSearchErrorType =
  | "none"
  | "http_error"
  | "timeout"
  | "network_error"
  | "parse_error";

export interface BatchSearchDiagnostics {
  model: string;
  response_id: string | null;
  http_status: number | null;
  error_type: BatchSearchErrorType;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  web_search_call_count: number;
  candidate_count: number;
  estimated_cost_usd: number | null;
}

export interface BatchSearchResult {
  candidates: WorkIntakeSearchCandidate[];
  diagnostics: BatchSearchDiagnostics;
}

const DEFAULT_MODEL = "gpt-5.4-nano";
const OPENAI_TIMEOUT_MS = 90_000;
const MAX_BATCH_SIZE = 30;
const EMAIL_RE = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

interface OpenAiResponse {
  id?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

function outputText(response: OpenAiResponse): string {
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");
}

function normalizedHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".localhost")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseCandidates(text: string, limit: number): WorkIntakeSearchCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const rows = parsed && typeof parsed === "object" && Array.isArray((parsed as { candidates?: unknown }).candidates)
    ? (parsed as { candidates: unknown[] }).candidates
    : [];
  const seenDomains = new Set<string>();
  const candidates: WorkIntakeSearchCandidate[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const website = normalizedHttpUrl(value.website);
    const sourceUrl = normalizedHttpUrl(value.email_source_url);
    const email = typeof value.public_email === "string" ? value.public_email.trim().toLowerCase() : "";
    if (!website || !sourceUrl || !EMAIL_RE.test(email) || email.length > 320) continue;
    const domain = new URL(website).hostname.toLowerCase().replace(/^www\./, "");
    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);
    candidates.push({ website, public_email: email, email_source_url: sourceUrl });
    if (candidates.length >= limit) break;
  }
  return candidates;
}

function errorType(error: unknown): "timeout" | "network_error" {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  return name === "AbortError" || /abort|timed?\s*out/i.test(message) ? "timeout" : "network_error";
}

/**
 * Current public pricing for gpt-5.4-nano and Responses web_search (USD):
 * input $0.20/M, output $1.25/M, $0.01 per web-search tool call.
 * Unknown model overrides deliberately return null instead of a misleading value.
 */
export function estimateBatchSearchCostUsd(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
}): number | null {
  if (input.model !== "gpt-5.4-nano") return null;
  const amount = input.inputTokens * 0.20 / 1_000_000
    + input.outputTokens * 1.25 / 1_000_000
    + input.webSearchCalls * 0.01;
  return Math.round(amount * 1_000_000) / 1_000_000;
}

export async function searchCzechEshopContacts(input: {
  openaiKey: string;
  requestedCount: number;
  excludedDomains?: string[];
  model?: string;
}): Promise<BatchSearchResult> {
  const requestedCount = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(input.requestedCount)));
  const model = input.model?.trim() || DEFAULT_MODEL;
  const excluded = (input.excludedDomains ?? []).slice(-300).join(", ") || "žádné";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  const emptyDiagnostics = (httpStatus: number | null, type: BatchSearchErrorType): BatchSearchDiagnostics => ({
    model, response_id: null, http_status: httpStatus, error_type: type,
    input_tokens: 0, output_tokens: 0, total_tokens: 0,
    web_search_call_count: 0, candidate_count: 0, estimated_cost_usd: null,
  });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.openaiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        tools: [{ type: "web_search", search_context_size: "low" }],
        tool_choice: "required",
        max_tool_calls: 4,
        max_output_tokens: 8_000,
        text: {
          format: {
            type: "json_schema",
            name: "czech_eshop_contacts",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                candidates: {
                  type: "array",
                  maxItems: requestedCount,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      website: { type: "string" },
                      public_email: { type: "string" },
                      email_source_url: { type: "string" },
                    },
                    required: ["website", "public_email", "email_source_url"],
                  },
                },
              },
              required: ["candidates"],
            },
          },
        },
        input: [
          `Najdi nejvýše ${requestedCount} skutečných českých e-shopů.`,
          "U každého vrať pouze oficiální website, veřejný firemní public_email a přesnou email_source_url na stejném oficiálním webu, kde je e-mail skutečně vidět.",
          "Nevracej katalogy, marketplace, sociální sítě, zpravodajské články, agregátory, odhadnuté ani vymyšlené e-maily.",
          `Nevracej tyto již zkontrolované domény: ${excluded}.`,
          "Výsledek musí odpovídat zadanému JSON schématu.",
        ].join("\n"),
      }),
    });
    if (!response.ok) return { candidates: [], diagnostics: emptyDiagnostics(response.status, "http_error") };

    let json: OpenAiResponse;
    try {
      json = await response.json() as OpenAiResponse;
    } catch {
      return { candidates: [], diagnostics: emptyDiagnostics(response.status, "parse_error") };
    }
    const candidates = parseCandidates(outputText(json), requestedCount);
    const inputTokens = json.usage?.input_tokens ?? 0;
    const outputTokens = json.usage?.output_tokens ?? 0;
    const totalTokens = json.usage?.total_tokens ?? inputTokens + outputTokens;
    const webSearchCalls = (json.output ?? []).filter((item) => item.type === "web_search_call").length;
    return {
      candidates,
      diagnostics: {
        model,
        response_id: json.id ?? null,
        http_status: response.status,
        error_type: candidates.length > 0 ? "none" : "parse_error",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        web_search_call_count: webSearchCalls,
        candidate_count: candidates.length,
        estimated_cost_usd: estimateBatchSearchCostUsd({ model, inputTokens, outputTokens, webSearchCalls }),
      },
    };
  } catch (error) {
    return { candidates: [], diagnostics: emptyDiagnostics(null, errorType(error)) };
  } finally {
    clearTimeout(timer);
  }
}
