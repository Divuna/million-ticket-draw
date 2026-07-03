import { readFileSync } from 'node:fs';

const functionSource = readFileSync('supabase/functions/generate-audit-report/index.ts', 'utf8');
const configSource = readFileSync('supabase/config.toml', 'utf8');

const authCheckIndex = functionSource.indexOf('const authFailure = await authorizeRequest(req)');
const serviceClientIndex = functionSource.indexOf("const supabase = createClient<Database>");

const checks = [
  {
    name: 'generate-audit-report has explicit JWT verification enabled',
    ok: /\[functions\.generate-audit-report]\s+verify_jwt\s*=\s*true/.test(configSource),
  },
  {
    name: 'Edge Function rejects missing Authorization header',
    ok:
      functionSource.includes("return { status: 401, error: 'missing_authorization' }") &&
      functionSource.includes("req.headers.get('authorization')"),
  },
  {
    name: 'Edge Function validates caller JWT with Supabase Auth',
    ok: functionSource.includes('supabaseAdmin.auth.getUser(jwtToken)'),
  },
  {
    name: 'Edge Function allows only admin or superadmin roles',
    ok:
      functionSource.includes(".from('user_roles')") &&
      functionSource.includes(".in('role', ['admin', 'superadmin'])") &&
      functionSource.includes("return { status: 403, error: 'access_denied_admin_only' }"),
  },
  {
    name: 'Authorization runs before service-role audit data access',
    ok: authCheckIndex >= 0 && serviceClientIndex >= 0 && authCheckIndex < serviceClientIndex,
  },
  {
    name: 'No service-role bearer fallback bypass exists',
    ok:
      !functionSource.includes('bearerToken === serviceKey') &&
      !functionSource.includes('jwtToken === serviceKey'),
  },
];

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
