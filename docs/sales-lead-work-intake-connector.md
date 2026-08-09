# ChatGPT Work → OneMil connector

The connector is a headless Streamable HTTP MCP server with two tools:

- `submit_intake(external_batch_id, items)` accepts 1–150 items containing only
  `website`, `public_email`, and `email_source_url`;
- `get_intake_status(intake_id)` returns status, created/skipped/rejected counts,
  and grouped rejection reasons.

The staging MCP endpoint is:

```text
https://dxmowysntemfqfnanxua.supabase.co/functions/v1/onemil-work-intake-mcp
```

## Security model

- ChatGPT authenticates to the MCP server with Supabase Auth OAuth 2.1.
- The MCP server validates the access token against Supabase Auth and checks the
  user ID against `WORK_INTAKE_CONNECTOR_ALLOWED_USER_IDS`.
- The MCP server reads `SALES_LEAD_WORK_INTAKE_SECRET` from Supabase Edge
  Function secrets and forwards it only in the server-to-server Authorization
  header to `sales-lead-work-intake`.
- The intake secret is not part of MCP tool metadata, arguments, results, source
  code, database rows, or logs.
- The connector constructs the upstream URL from `SUPABASE_URL` and a fixed
  function path. It cannot call arbitrary URLs and has no database client.
- `external_batch_id` remains the idempotency key enforced by the existing
  intake endpoint and RPC.

## ChatGPT Work connection

No additional OneMil plugin runtime is required. In ChatGPT workspace developer
mode, register the staging MCP URL as a custom connector and complete its
Supabase OAuth flow. Before that first interactive connection, enable the OAuth
2.1 server on the staging Supabase project, configure its authorization path,
and provide the corresponding consent page. The MCP endpoint intentionally
remains inaccessible until that OAuth setup is complete.

Production requires a separate approval. During that rollout, deploy the MCP
function to production, rotate `SALES_LEAD_WORK_INTAKE_SECRET` once, and let
both production Edge Functions read the same value from the production
Supabase secret vault. Never copy the value into plugin files.

## Staging OAuth consent setup

The staging frontend is intentionally local and uses the existing OneMil login:

```bash
copy .env.staging.example .env.staging
npm run dev:staging
```

Keep `http://localhost:5173` running while linking ChatGPT. In the staging
Supabase project (`dxmowysntemfqfnanxua`) configure:

1. **Authentication > URL Configuration > Site URL**:
   `http://localhost:5173`
2. **Authentication > OAuth Server > Authorization Path**:
   `/oauth/consent`
3. Enable **OAuth 2.1 Server**.
4. Enable **Dynamic Client Registration**.

The resulting consent URL is
`http://localhost:5173/oauth/consent?authorization_id=...`. The page reuses the
current Supabase session and the existing `/login?redirect=...` path. It is
compiled to operate only with the staging project and requires the current user
to have the `superadmin` role. The MCP server independently enforces the exact
server-side `WORK_INTAKE_CONNECTOR_ALLOWED_USER_IDS` allowlist.

After enabling OAuth, verify that this endpoint returns JSON instead of 404:

```text
https://dxmowysntemfqfnanxua.supabase.co/.well-known/oauth-authorization-server/auth/v1
```

Then enable ChatGPT Developer mode, add the staging MCP endpoint shown above,
and complete the Supabase login and consent flow. Dynamic registration lets
ChatGPT register its callback; do not create or store a client secret in the
frontend.
