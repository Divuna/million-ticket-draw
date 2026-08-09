import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { McpServer } from "npm:@modelcontextprotocol/sdk@1.30.0/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.30.0/server/webStandardStreamableHttp.js";
import { z } from "npm:zod@3.25.76";
import { createWorkIntakeConnectorClient } from "../_shared/workIntakeConnector.ts";

const FUNCTION_NAME = "onemil-work-intake-mcp";

function json(body: Record<string, unknown>, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

function environment() {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const intakeSecret = Deno.env.get("SALES_LEAD_WORK_INTAKE_SECRET") ?? "";
  const allowedUserIds = new Set(
    (Deno.env.get("WORK_INTAKE_CONNECTOR_ALLOWED_USER_IDS") ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean),
  );
  if (!supabaseUrl || !anonKey || intakeSecret.length < 32 || allowedUserIds.size === 0) {
    throw new Error("server_configuration");
  }
  return { supabaseUrl, anonKey, intakeSecret, allowedUserIds };
}

function resourceUrl(): string {
  return `${environment().supabaseUrl}/functions/v1/${FUNCTION_NAME}`;
}

function challenge(request: Request, error = "invalid_token"): string {
  return `Bearer resource_metadata="${resourceUrl()}/oauth-protected-resource", error="${error}", error_description="Authentication is required"`;
}

async function authenticate(request: Request): Promise<{ userId: string } | null> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const env = environment();
  const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.anonKey },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null) as { id?: unknown } | null;
  if (!user || typeof user.id !== "string" || !env.allowedUserIds.has(user.id)) return null;
  return { userId: user.id };
}

function protectedResourceMetadata(request: Request): Response {
  const env = environment();
  return json({
    resource: resourceUrl(),
    authorization_servers: [`${env.supabaseUrl}/auth/v1`],
    scopes_supported: ["openid", "email", "offline_access"],
    resource_documentation: "https://github.com/Divuna/million-ticket-draw/blob/main/docs/sales-lead-work-intake-connector.md",
  });
}

function createServer() {
  const env = environment();
  const client = createWorkIntakeConnectorClient({
    supabaseUrl: env.supabaseUrl,
    intakeSecret: env.intakeSecret,
  });
  const server = new McpServer(
    { name: "onemil-work-intake", version: "1.0.0" },
    { instructions: "Submit only user-approved Czech e-shop batches, then poll their intake status. Never invent an email or source URL." },
  );

  server.registerTool(
    "submit_intake",
    {
      title: "Submit OneMil intake",
      description: "Submit 1–150 Czech e-shop candidates to OneMil for deterministic backend verification.",
      inputSchema: {
        external_batch_id: z.string().min(8).max(200),
        items: z.array(z.object({
          website: z.string().min(4).max(2048),
          public_email: z.string().min(3).max(320),
          email_source_url: z.string().min(4).max(2048),
        }).strict()).min(1).max(150),
      },
      outputSchema: {
        intake_id: z.string(), accepted: z.boolean(), replayed: z.boolean(), status: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      securitySchemes: [{ type: "oauth2", scopes: ["openid", "email"] }],
    },
    async ({ external_batch_id, items }) => {
      try {
        const result = await client.submitIntake(external_batch_id, items);
        return { structuredContent: result, content: [{ type: "text", text: `Intake ${result.intake_id} was accepted.` }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `Intake submission failed: ${error instanceof Error ? error.message : "unknown_error"}` }] };
      }
    },
  );

  server.registerTool(
    "get_intake_status",
    {
      title: "Get OneMil intake status",
      description: "Read processing counts and rejection reasons for a previously submitted intake batch.",
      inputSchema: { intake_id: z.string().min(8).max(200) },
      outputSchema: {
        intake_id: z.string(), status: z.string(), created_count: z.number(), skipped_count: z.number(),
        rejected_count: z.number(), rejection_reasons: z.array(z.object({ reason: z.string(), count: z.number() })),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["openid", "email"] }],
    },
    async ({ intake_id }) => {
      try {
        const result = await client.getIntakeStatus(intake_id);
        return { structuredContent: result, content: [{ type: "text", text: `Intake ${result.intake_id} is ${result.status}.` }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: `Status lookup failed: ${error instanceof Error ? error.message : "unknown_error"}` }] };
      }
    },
  );
  return server;
}

export async function handleWorkIntakeMcp(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path.endsWith("/oauth-protected-resource")) {
    try { return protectedResourceMetadata(request); } catch { return json({ error: "server_configuration" }, 500); }
  }

  let identity: { userId: string } | null = null;
  try { identity = await authenticate(request); } catch { return json({ error: "server_configuration" }, 500); }
  if (!identity) {
    return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": challenge(request) });
  }

  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return await transport.handleRequest(request, {
    authInfo: { token: "redacted", clientId: identity.userId, scopes: ["openid", "email"] },
  });
}

serve(handleWorkIntakeMcp);
