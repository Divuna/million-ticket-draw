import { readFileSync } from 'node:fs';

const functionSource = readFileSync('supabase/functions/process-email-queue/index.ts', 'utf8');
const configSource = readFileSync('supabase/config.toml', 'utf8');
const migrationSource = readFileSync(
  'supabase/migrations/20260702224336_process_email_queue_internal_auth.sql',
  'utf8',
);

const checks = [
  {
    name: 'Edge Function allows x-internal-token through CORS',
    ok: functionSource.includes('x-internal-token'),
  },
  {
    name: 'Edge Function reads INTERNAL_FUNCTION_TOKEN',
    ok: functionSource.includes('Deno.env.get("INTERNAL_FUNCTION_TOKEN")'),
  },
  {
    name: 'Edge Function allows admin/superadmin JWT fallback without browser secret',
    ok:
      functionSource.includes('.in("role", ["admin", "superadmin"])') &&
      functionSource.includes('adminClient.auth.getUser(bearerToken)'),
  },
  {
    name: 'Edge Function allows service-role bearer fallback for backend/manual runs',
    ok: functionSource.includes('bearerToken === serviceKey'),
  },
  {
    name: 'Edge Function keeps JWT verification disabled for cron dispatch',
    ok: /\[functions\.process-email-queue]\s+verify_jwt\s*=\s*false/.test(configSource),
  },
  {
    name: 'Edge Function rejects unauthorized requests before processing queue',
    ok:
      functionSource.indexOf('const authFailure = await authorizeRequest(req)') <
      functionSource.indexOf('let requestedEmailId'),
  },
  {
    name: 'Cron dispatcher reads token from Vault',
    ok:
      migrationSource.includes("from vault.decrypted_secrets") &&
      migrationSource.includes("where name = 'internal_function_token'"),
  },
  {
    name: 'Cron dispatcher fails closed when internal token is missing',
    ok:
      migrationSource.includes("if v_token is null or v_token = '' then") &&
      migrationSource.includes("'internal_function_token_missing'") &&
      migrationSource.indexOf("'internal_function_token_missing'") <
        migrationSource.indexOf('select net.http_post('),
  },
  {
    name: 'Cron dispatcher fails closed when edge functions URL is missing',
    ok:
      migrationSource.includes("if v_base_url is null or v_base_url = '' then") &&
      migrationSource.includes("'edge_functions_url_missing'") &&
      migrationSource.indexOf("'edge_functions_url_missing'") <
        migrationSource.indexOf('select net.http_post('),
  },
  {
    name: 'Cron dispatcher sends x-internal-token header',
    ok: migrationSource.includes("'x-internal-token', v_token"),
  },
  {
    name: 'Migration only reschedules an existing process-email-queue cron job',
    ok:
      migrationSource.includes("where jobname = 'process_email_queue_every_10_min'") &&
      migrationSource.includes('perform cron.unschedule(v_job.jobid)') &&
      migrationSource.includes("cron.schedule(\n      'process_email_queue_every_10_min'"),
  },
];

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
