export type WorkIntakeItem = {
  website: string;
  public_email: string;
  email_source_url: string;
};

export type IntakeStatus = {
  intake_id: string;
  status: string;
  created_count: number;
  skipped_count: number;
  rejected_count: number;
  rejection_reasons: Array<{ reason: string; count: number }>;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type ConnectorConfig = {
  supabaseUrl: string;
  intakeSecret: string;
  fetcher?: FetchLike;
};

function requireText(value: string, name: string, min: number, max: number): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`invalid_${name}`);
  }
  return normalized;
}

function validateItems(items: WorkIntakeItem[]): WorkIntakeItem[] {
  if (!Array.isArray(items) || items.length < 1 || items.length > 150) {
    throw new Error("invalid_items_count");
  }
  return items.map((item) => ({
    website: requireText(item.website, "website", 4, 2048),
    public_email: requireText(item.public_email, "public_email", 3, 320).toLowerCase(),
    email_source_url: requireText(item.email_source_url, "email_source_url", 4, 2048),
  }));
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("intake_invalid_response");
  }
  if (!response.ok) {
    const error = typeof body.error === "string" ? body.error : "intake_request_failed";
    throw new Error(error);
  }
  return body as Record<string, unknown>;
}

export function createWorkIntakeConnectorClient(config: ConnectorConfig) {
  const baseUrl = requireText(config.supabaseUrl, "supabase_url", 8, 2048).replace(/\/$/, "");
  const secret = requireText(config.intakeSecret, "intake_secret", 32, 512);
  const fetcher = config.fetcher ?? fetch;
  const endpoint = `${baseUrl}/functions/v1/sales-lead-work-intake`;
  const headers = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };

  return {
    async submitIntake(externalBatchId: string, items: WorkIntakeItem[]) {
      const intakeId = requireText(externalBatchId, "external_batch_id", 8, 200);
      const response = await fetcher(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ schema_version: 1, external_batch_id: intakeId, items: validateItems(items) }),
      });
      const body = await readJson(response);
      return {
        intake_id: intakeId,
        accepted: body.accepted === true,
        replayed: body.replayed === true,
        status: body.accepted === true ? "accepted" : "unknown",
      };
    },

    async getIntakeStatus(intakeIdInput: string): Promise<IntakeStatus> {
      const intakeId = requireText(intakeIdInput, "intake_id", 8, 200);
      const response = await fetcher(`${endpoint}?batch_id=${encodeURIComponent(intakeId)}`, {
        method: "GET",
        headers,
      });
      const body = await readJson(response);
      const run = body.run as Record<string, unknown> | undefined;
      const items = Array.isArray(body.items) ? body.items as Array<Record<string, unknown>> : [];
      if (!run || typeof run.status !== "string") throw new Error("intake_invalid_response");

      const reasons = new Map<string, number>();
      for (const item of items) {
        if (item.status !== "rejected") continue;
        const reason = typeof item.reason === "string" && item.reason ? item.reason : "unspecified";
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      }

      return {
        intake_id: intakeId,
        status: run.status,
        created_count: Number(run.created_count ?? 0),
        skipped_count: Number(run.skipped_count ?? 0),
        rejected_count: Number(run.rejected_count ?? 0),
        rejection_reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })),
      };
    },
  };
}
