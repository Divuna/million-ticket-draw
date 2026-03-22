/**
 * apply-e2e-migration.mjs
 *
 * Applies the ticket_count constraint migration via Supabase Management API.
 * Allows test contests with ticket_count >= 100 for E2E testing.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/apply-e2e-migration.mjs
 *
 * Note: Management API may require Supabase PAT (sbp_...). If it fails,
 * run scripts/run-e2e-migration.sql manually in Supabase SQL Editor.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env if present (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN)
const __dirname = dirname(fileURLToPath(import.meta.url));
for (const f of [".env", ".env.local", ".env.development"]) {
  const p = join(__dirname, "..", f);
  if (existsSync(p)) {
    const content = readFileSync(p, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN)\s*=\s*["']?([^"'\s#]+)/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

const PROJECT_REF = "xkzhjldrojjlrkezorey";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ACCESS_TOKEN;

if (!SERVICE_KEY) {
  console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY required.");
  console.error("  Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/apply-e2e-migration.mjs\n");
  process.exit(1);
}

const MIGRATION_SQL = `
ALTER TABLE public.contests DROP CONSTRAINT IF EXISTS contests_ticket_count_check;

DO $$
BEGIN
  ALTER TABLE public.contests
  ADD CONSTRAINT contests_ticket_count_check
  CHECK (ticket_count >= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

async function applyViaManagementApi() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    }
  );

  if (res.ok) {
    return { success: true };
  }
  const err = await res.text();
  return { success: false, status: res.status, error: err };
}

async function main() {
  console.log("Applying ticket_count constraint migration...\n");

  const result = await applyViaManagementApi();

  if (result.success) {
    console.log("✓ Migration applied successfully.");
    console.log("  Constraint now allows ticket_count >= 100.\n");
    process.exit(0);
  }

  console.error(`✗ Management API failed (${result.status}): ${result.error}\n`);
  console.error("→ Run scripts/run-e2e-migration.sql manually in Supabase SQL Editor:");
  console.error("  Dashboard → SQL Editor → paste and run.\n");
  process.exit(1);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
