/**
 * Push pipeline diagnostics — zjištění stavu push_log, user_devices, notifications
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/diagnose-push.mjs
 *
 * Nebo přidej SUPABASE_SERVICE_ROLE_KEY do .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const f of [".env", ".env.local", ".env.development"]) {
  const p = join(__dirname, "..", f);
  if (existsSync(p)) {
    const content = readFileSync(p, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*["']?([^"'\s#]+)/);
      if (m) {
        const [_, key, val] = m;
        const v = val.trim();
        if (key === "SUPABASE_SERVICE_ROLE_KEY" && !process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = v;
        else if ((key === "SUPABASE_URL" || key === "VITE_SUPABASE_URL") && !process.env.SUPABASE_URL) process.env.SUPABASE_URL = v;
      }
    }
  }
}

const SB_URL = process.env.SUPABASE_URL || "https://xkzhjldrojjlrkezorey.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("\nERROR: SUPABASE_SERVICE_ROLE_KEY je potřeba.");
  console.error("  Získej ho v Supabase Dashboard → Project Settings → API → service_role");
  console.error("  Použití: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/diagnose-push.mjs\n");
  process.exit(1);
}

const supabase = createClient(SB_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log("\n=== Push pipeline diagnostika ===\n");

  // 1. push_log
  const { count: pushLogCount, error: e1 } = await supabase.from("push_log").select("*", { count: "exact", head: true });
  if (e1) {
    console.log("push_log: CHYBA –", e1.message);
  } else {
    console.log("push_log: počet řádků =", pushLogCount ?? 0);
  }

  // 2. user_devices s platným player_id
  const { data: devices, count: devicesCount, error: e2 } = await supabase
    .from("user_devices")
    .select("player_id", { count: "exact" })
    .not("player_id", "is", null)
    .neq("player_id", "");
  if (e2) {
    console.log("user_devices (player_id): CHYBA –", e2.message);
  } else {
    const valid = (devices || []).filter((d) => d.player_id && String(d.player_id).trim());
    console.log("user_devices: počet s platným player_id =", valid.length, "(celkem řádků:", devicesCount ?? "?", ")");
  }

  // 3. notifications
  const { count: notifCount, error: e3 } = await supabase.from("notifications").select("*", { count: "exact", head: true });
  if (e3) {
    console.log("notifications: CHYBA –", e3.message);
  } else {
    console.log("notifications: počet řádků =", notifCount ?? 0);
  }

  // 4. poslední 3 push_log (pro debug)
  const { data: recent } = await supabase.from("push_log").select("id, status, sent_at, response, user_id").order("id", { ascending: false }).limit(3);
  if (recent && recent.length > 0) {
    console.log("\nPoslední push_log (max 3):");
    recent.forEach((r) => console.log("  ", JSON.stringify(r)));
  }

  console.log("\n=== Konec ===\n");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
