import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWorkIntakeConnectorClient, type WorkIntakeItem } from "../../supabase/functions/_shared/workIntakeConnector";

const items: WorkIntakeItem[] = [{
  website: "https://shop.example.cz",
  public_email: "INFO@SHOP.EXAMPLE.CZ",
  email_source_url: "https://shop.example.cz/kontakt",
}];

test("submit_intake calls only the fixed intake endpoint and preserves idempotency key", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let count = 0;
  const client = createWorkIntakeConnectorClient({
    supabaseUrl: "https://staging.example.supabase.co",
    intakeSecret: "s".repeat(64),
    fetcher: async (input, init) => {
      calls.push({ url: String(input), init });
      count += 1;
      return new Response(JSON.stringify({ accepted: true, replayed: count > 1 }), {
        status: 202, headers: { "Content-Type": "application/json" },
      });
    },
  });

  const first = await client.submitIntake("work-test-batch-001", items);
  const replay = await client.submitIntake("work-test-batch-001", items);

  expect(first).toMatchObject({ intake_id: "work-test-batch-001", accepted: true, replayed: false });
  expect(replay).toMatchObject({ intake_id: "work-test-batch-001", accepted: true, replayed: true });
  expect(calls).toHaveLength(2);
  expect(calls.every((call) => call.url === "https://staging.example.supabase.co/functions/v1/sales-lead-work-intake")).toBe(true);
  expect(calls[0].init?.body).toBe(calls[1].init?.body);
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({
    schema_version: 1,
    external_batch_id: "work-test-batch-001",
    items: [{ ...items[0], public_email: "info@shop.example.cz" }],
  });
});

test("submit_intake rejects batches above 150 before making a request", async () => {
  let called = false;
  const client = createWorkIntakeConnectorClient({
    supabaseUrl: "https://staging.example.supabase.co",
    intakeSecret: "s".repeat(64),
    fetcher: async () => { called = true; return new Response("{}"); },
  });
  await expect(client.submitIntake("work-test-batch-002", Array.from({ length: 151 }, () => items[0]))).rejects.toThrow("invalid_items_count");
  expect(called).toBe(false);
});

test("get_intake_status groups rejection reasons without mislabeling skips", async () => {
  const client = createWorkIntakeConnectorClient({
    supabaseUrl: "https://staging.example.supabase.co",
    intakeSecret: "s".repeat(64),
    fetcher: async () => new Response(JSON.stringify({
      run: { status: "done", created_count: 1, skipped_count: 1, rejected_count: 2 },
      items: [
        { status: "created", reason: "created" },
        { status: "skipped", reason: "duplicate_domain" },
        { status: "rejected", reason: "email_not_found" },
        { status: "rejected", reason: "email_not_found" },
      ],
    }), { headers: { "Content-Type": "application/json" } }),
  });
  await expect(client.getIntakeStatus("work-test-batch-003")).resolves.toEqual({
    intake_id: "work-test-batch-003",
    status: "done",
    created_count: 1,
    skipped_count: 1,
    rejected_count: 2,
    rejection_reasons: [
      { reason: "email_not_found", count: 2 },
    ],
  });
});

test("MCP wrapper keeps credentials server-side and exposes only two tools", () => {
  const root = process.cwd();
  const source = readFileSync(join(root, "supabase/functions/onemil-work-intake-mcp/index.ts"), "utf8");
  expect(source).toContain('"submit_intake"');
  expect(source).toContain('"get_intake_status"');
  expect(source).toContain('Deno.env.get("SALES_LEAD_WORK_INTAKE_SECRET")');
  expect(source).toContain("WORK_INTAKE_CONNECTOR_ALLOWED_USER_IDS");
  expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  expect(source).not.toContain("createClient(");
  expect(source).not.toContain("OPENAI_API_KEY");
  expect(source).not.toContain("ARES");
  expect(source).not.toContain("send-sales-lead-email");
  expect(source).not.toContain("sales_lead_email_batches");
  expect(source).toContain("`${environment().supabaseUrl}/functions/v1/${FUNCTION_NAME}`");
  expect(source).not.toContain("url.origin");
});
