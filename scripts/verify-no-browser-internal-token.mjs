import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', 'playwright-report', 'test-results'].includes(entry)) continue;
      files.push(...listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function rel(file) {
  return relative(ROOT, file).split(sep).join('/');
}

function read(file) {
  return readFileSync(file, 'utf8');
}

const srcFiles = listFiles(join(ROOT, 'src'));
const testFiles = listFiles(join(ROOT, 'tests'));
const scriptFiles = listFiles(join(ROOT, 'scripts'));
const edgeFiles = listFiles(join(ROOT, 'supabase', 'functions'));
const workflowFiles = listFiles(join(ROOT, '.github', 'workflows'));
const docsFiles = listFiles(join(ROOT, 'docs'));

const checks = [];

checks.push({
  name: 'No frontend source reads VITE_INTERNAL_FUNCTION_TOKEN',
  failures: srcFiles
    .filter((file) => read(file).includes('VITE_INTERNAL_FUNCTION_TOKEN'))
    .map(rel),
});

checks.push({
  name: 'No frontend source sends x-internal-token',
  failures: srcFiles
    .filter((file) => read(file).includes('x-internal-token'))
    .map(rel),
});

checks.push({
  name: 'No frontend helper for browser internal token remains',
  failures: srcFiles
    .filter((file) => read(file).includes('withEdgeInternalToken'))
    .map(rel),
});

checks.push({
  name: 'Vite env type does not expose VITE_INTERNAL_FUNCTION_TOKEN',
  failures: ['src/vite-env.d.ts']
    .filter((file) => existsSync(file) && read(file).includes('VITE_INTERNAL_FUNCTION_TOKEN')),
});

checks.push({
  name: 'Example env files do not define a VITE internal token',
  failures: ['.env.example', '.env.staging.example']
    .filter((file) => existsSync(file) && /^VITE_INTERNAL_FUNCTION_TOKEN\s*=/m.test(read(file))),
});

checks.push({
  name: 'Workflow exposes internal token only as non-VITE runtime env',
  failures: workflowFiles
    .filter((file) => /VITE_INTERNAL_FUNCTION_TOKEN\s*:/.test(read(file)))
    .map(rel),
});

checks.push({
  name: 'Server, Edge, API-only tests, and docs are the only remaining internal-token contexts',
  failures: [...srcFiles]
    .filter((file) => /INTERNAL_FUNCTION_TOKEN|internal_function_token|x-internal-token/.test(read(file)))
    .map(rel),
});

const allowedContextFiles = [
  ...edgeFiles,
  ...scriptFiles,
  ...testFiles,
  ...workflowFiles,
  ...docsFiles,
  join(ROOT, '.env.example'),
  join(ROOT, '.env.staging.example'),
  ...listFiles(join(ROOT, 'supabase', 'migrations')),
].map(rel);

const allRepoFiles = [
  ...srcFiles,
  ...edgeFiles,
  ...scriptFiles,
  ...testFiles,
  ...workflowFiles,
  ...docsFiles,
  ...listFiles(join(ROOT, 'supabase', 'migrations')),
  join(ROOT, '.env.example'),
  join(ROOT, '.env.staging.example'),
].filter(existsSync);

const remainingInternalTokenFiles = allRepoFiles
  .filter((file) => /VITE_INTERNAL_FUNCTION_TOKEN|INTERNAL_FUNCTION_TOKEN|internal_function_token|x-internal-token/.test(read(file)))
  .map(rel);

const unexpectedRemaining = remainingInternalTokenFiles.filter(
  (file) => !allowedContextFiles.includes(file),
);

checks.push({
  name: 'Remaining token references are in explicitly allowed server/test/docs contexts',
  failures: unexpectedRemaining,
});

let failed = false;
for (const check of checks) {
  const ok = check.failures.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${check.name}`);
  if (!ok) {
    failed = true;
    for (const file of check.failures) {
      console.log(`  - ${file}`);
    }
  }
}

console.log('');
console.log('Allowed remaining contexts: Supabase Edge Functions, migrations, scripts, API-only tests, GitHub Actions runtime env, env examples, and docs.');

if (failed) {
  process.exitCode = 1;
}
