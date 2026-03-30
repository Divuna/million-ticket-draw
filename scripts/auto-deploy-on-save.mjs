import { spawn } from "node:child_process";

const PROJECT_REF = "xkzhjldrojjlrkezorey";

// Minimal, explicit workflow: run once when started.
// This is intentionally not a watcher.
console.log("AUTO DEPLOY RUN");

const child = spawn(
  "supabase",
  ["functions", "deploy", "ai-chat", "--project-ref", PROJECT_REF],
  { shell: true, stdio: "inherit" },
);

child.on("exit", (code) => {
  if (code === 0) process.exit(0);
  process.exit(typeof code === "number" ? code : 1);
});

