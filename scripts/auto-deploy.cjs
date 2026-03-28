/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const WATCH_DIR = path.join(ROOT, "supabase", "functions", "ai-chat");
const DEBOUNCE_MS = 2000;

let timer = null;
let deployInProgress = false;
let deployQueued = false;

function runDeploy() {
  if (deployInProgress) {
    deployQueued = true;
    return;
  }

  deployInProgress = true;
  deployQueued = false;

  console.log("Deploying ai-chat...");

  const child = spawn("supabase", ["functions", "deploy", "ai-chat"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code) => {
    deployInProgress = false;

    if (code === 0) {
      console.log("Deploy done");
    } else {
      console.log(`Deploy failed (exit ${code ?? "unknown"})`);
    }

    if (deployQueued) {
      runDeploy();
    }
  });
}

function scheduleDeploy() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(runDeploy, DEBOUNCE_MS);
}

function startWatching() {
  if (!fs.existsSync(WATCH_DIR)) {
    console.error(`Watch directory not found: ${WATCH_DIR}`);
    process.exit(1);
  }

  console.log(`Watching: ${WATCH_DIR}`);
  console.log(`Debounce: ${DEBOUNCE_MS}ms`);

  // Works well on Windows/macOS. (Linux recursive support varies.)
  fs.watch(WATCH_DIR, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;

    const name = String(filename);
    // Ignore obvious temp/lock artifacts.
    if (name.endsWith("~") || name.endsWith(".swp") || name.endsWith(".tmp")) return;

    scheduleDeploy();
  });
}

startWatching();

