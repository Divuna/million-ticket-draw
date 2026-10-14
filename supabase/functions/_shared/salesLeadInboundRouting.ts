export type RoutingMethod = "in_reply_to" | "references" | "provider_thread";

export type RoutingDecision =
  | { leadId: string; method: RoutingMethod; ambiguous: false }
  | { leadId: null; method: RoutingMethod | null; ambiguous: boolean };

export function normalizeMessageId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("<") && trimmed.endsWith(">")
    ? trimmed
    : `<${trimmed.replace(/^<|>$/g, "")}>`;
}

export function extractMessageIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const bracketed = value.match(/<[^<>\s]+>/g) ?? [];
  const candidates = bracketed.length > 0 ? bracketed : value.split(/\s+/);
  return [...new Set(candidates.map(normalizeMessageId).filter((id): id is string => Boolean(id)))];
}

export function headerValue(headers: unknown, name: string): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const item of headers) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const key = String(row.name ?? row.key ?? "").toLowerCase();
      if (key === target && typeof row.value === "string") return row.value;
    }
    return null;
  }
  if (typeof headers === "object") {
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      if (key.toLowerCase() === target && typeof value === "string") return value;
    }
  }
  return null;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

/**
 * Applies the required evidence order. Ambiguity at a stronger level is final:
 * the message must not fall through to a weaker identifier.
 */
export function decideInboundRoute(input: {
  inReplyToLeadIds?: string[];
  referenceLeadIds?: string[];
  providerThreadLeadIds?: string[];
}): RoutingDecision {
  const levels: Array<[RoutingMethod, string[]]> = [
    ["in_reply_to", unique(input.inReplyToLeadIds ?? [])],
    ["references", unique(input.referenceLeadIds ?? [])],
    ["provider_thread", unique(input.providerThreadLeadIds ?? [])],
  ];
  for (const [method, ids] of levels) {
    if (ids.length === 1) return { leadId: ids[0], method, ambiguous: false };
    if (ids.length > 1) return { leadId: null, method, ambiguous: true };
  }
  return { leadId: null, method: null, ambiguous: false };
}
