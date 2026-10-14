export const DISCOVERY_COST_CAPS = {
  maxCandidates: 20,
  maxSearchRounds: 2,
  maxClassificationCalls: 20,
  maxDirectOpenAiCalls: 24,
  zeroCreatedCandidates: 10,
} as const;

export type SafeProviderError =
  | `http_${number}`
  | "timeout"
  | "network_error"
  | "parse_error"
  | "not_called"
  | "unknown";

export type DiscoveryCostTelemetry = {
  search_api_calls: number;
  classification_api_calls: number;
  provider_errors: number;
  last_provider_error: SafeProviderError | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export type DiscoveryCostStopReason =
  | "provider_error"
  | "empty_search_round"
  | "max_search_rounds_reached"
  | "max_classification_calls_reached"
  | "max_direct_openai_calls_reached"
  | "zero_created_after_10_candidates";

export function emptyDiscoveryCostTelemetry(): DiscoveryCostTelemetry {
  return {
    search_api_calls: 0,
    classification_api_calls: 0,
    provider_errors: 0,
    last_provider_error: null,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  };
}

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export function readDiscoveryCostTelemetry(value: unknown): DiscoveryCostTelemetry {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const last = source.last_provider_error;
  return {
    search_api_calls: nonNegativeInt(source.search_api_calls),
    classification_api_calls: nonNegativeInt(source.classification_api_calls),
    provider_errors: nonNegativeInt(source.provider_errors),
    last_provider_error: typeof last === "string" ? last as SafeProviderError : null,
    input_tokens: nonNegativeInt(source.input_tokens),
    output_tokens: nonNegativeInt(source.output_tokens),
    total_tokens: nonNegativeInt(source.total_tokens),
  };
}

export function effectiveMaxCandidates(configured: unknown): number {
  const parsed = nonNegativeInt(configured);
  return Math.min(Math.max(parsed || DISCOVERY_COST_CAPS.maxCandidates, 1), DISCOVERY_COST_CAPS.maxCandidates);
}

export function directOpenAiCalls(telemetry: DiscoveryCostTelemetry): number {
  return telemetry.search_api_calls + telemetry.classification_api_calls;
}

export function providerErrorCode(input: {
  httpStatus: number | null;
  errorType: string;
}): SafeProviderError | null {
  if (typeof input.httpStatus === "number" && input.httpStatus >= 300) {
    return `http_${input.httpStatus}`;
  }
  if (input.errorType === "timeout" || input.errorType === "network_error" || input.errorType === "parse_error") {
    return input.errorType;
  }
  if (input.errorType === "not_called") return "not_called";
  return null;
}

export function canStartSearchRound(input: {
  searchRounds: number;
  telemetry: DiscoveryCostTelemetry;
}): DiscoveryCostStopReason | null {
  if (input.searchRounds >= DISCOVERY_COST_CAPS.maxSearchRounds) return "max_search_rounds_reached";
  if (directOpenAiCalls(input.telemetry) >= DISCOVERY_COST_CAPS.maxDirectOpenAiCalls) return "max_direct_openai_calls_reached";
  return null;
}

export function canStartClassification(telemetry: DiscoveryCostTelemetry): DiscoveryCostStopReason | null {
  if (telemetry.classification_api_calls >= DISCOVERY_COST_CAPS.maxClassificationCalls) {
    return "max_classification_calls_reached";
  }
  if (directOpenAiCalls(telemetry) >= DISCOVERY_COST_CAPS.maxDirectOpenAiCalls) {
    return "max_direct_openai_calls_reached";
  }
  return null;
}

export function stopAfterSearchRound(input: {
  providerError: SafeProviderError | null;
  usableCandidates: number;
}): DiscoveryCostStopReason | null {
  if (input.providerError) return "provider_error";
  if (input.usableCandidates === 0) return "empty_search_round";
  return null;
}

export function stopAfterCandidate(input: {
  candidatesChecked: number;
  createdCount: number;
}): DiscoveryCostStopReason | null {
  if (input.candidatesChecked >= DISCOVERY_COST_CAPS.zeroCreatedCandidates && input.createdCount === 0) {
    return "zero_created_after_10_candidates";
  }
  return null;
}

export function addUsage(
  telemetry: DiscoveryCostTelemetry,
  usage: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  } | null | undefined,
): void {
  if (!usage) return;
  telemetry.input_tokens += nonNegativeInt(usage.input_tokens ?? usage.prompt_tokens);
  telemetry.output_tokens += nonNegativeInt(usage.output_tokens ?? usage.completion_tokens);
  telemetry.total_tokens += nonNegativeInt(usage.total_tokens);
}
