const RECEIVING_DOMAIN = "ulduuzoul.resend.app";

function normalizeMessageId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("<") && trimmed.endsWith(">")
    ? trimmed
    : `<${trimmed.replace(/^<|>$/g, "")}>`;
}

export function createOutboundCapture(): { id: string; address: string } {
  const id = crypto.randomUUID();
  return { id, address: outboundCaptureAddress(id) };
}

export function outboundCaptureAddress(id: string): string {
  return `sales-lead-capture-${id}@${RECEIVING_DOMAIN}`;
}

export function extractOutboundCaptureId(addresses: string[]): string | null {
  for (const address of addresses) {
    const match = address.match(/sales-lead-capture-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@ulduuzoul\.resend\.app/i);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

export function referencesFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const value = (metadata as Record<string, unknown>).references;
  const candidates = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string" ? value.split(/\s+/) : [];
  return [...new Set(candidates.map(normalizeMessageId).filter((id): id is string => Boolean(id)))];
}

export function buildReplyHeaders(
  parentMessageId?: string | null,
  previousReferences: string[] = [],
): Record<string, string> {
  const parent = normalizeMessageId(parentMessageId);
  if (!parent) return {};

  const references = [...new Set([
    ...previousReferences.map(normalizeMessageId).filter((id): id is string => Boolean(id)),
    parent,
  ])];
  return {
    "In-Reply-To": parent,
    "References": references.join(" "),
  };
}
