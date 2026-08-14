const STAGING_PROJECT_REF = "dxmowysntemfqfnanxua";
const projectRef = process.env.WORK_INTAKE_STAGING_PROJECT_REF;
const intakeSecret = process.env.WORK_INTAKE_TEST_SECRET;

if (projectRef !== STAGING_PROJECT_REF) {
  throw new Error("This test is hard-gated to the OneMil staging project.");
}
if (!intakeSecret || intakeSecret.length < 32) {
  throw new Error("WORK_INTAKE_TEST_SECRET is required.");
}

const { createWorkIntakeConnectorClient } = await import(
  "../supabase/functions/_shared/workIntakeConnector.ts"
);

const client = createWorkIntakeConnectorClient({
  supabaseUrl: `https://${projectRef}.supabase.co`,
  intakeSecret,
});
const externalBatchId = `work-connector-staging-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
const items = [
  {
    website: "https://navilo.cz/",
    public_email: "info@navilo.cz",
    email_source_url: "https://navilo.cz/doprava-a-platba/",
  },
  {
    website: "https://www.inweek.cz/",
    public_email: "info@inweek.cz",
    email_source_url: "https://www.inweek.cz/doprava-a-platba",
  },
];

const first = await client.submitIntake(externalBatchId, items);
let status;
for (let attempt = 0; attempt < 30; attempt += 1) {
  status = await client.getIntakeStatus(externalBatchId);
  if (status.status === "done" || status.status === "failed") break;
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
if (!status || (status.status !== "done" && status.status !== "failed")) {
  throw new Error("Staging intake did not reach a terminal state.");
}

const replay = await client.submitIntake(externalBatchId, items);
if (!first.accepted || first.replayed || !replay.accepted || !replay.replayed) {
  throw new Error("Idempotency verification failed.");
}

console.log(JSON.stringify({
  intake_id: externalBatchId,
  submitted_items: items.length,
  first_replayed: first.replayed,
  replay_replayed: replay.replayed,
  status,
}));
