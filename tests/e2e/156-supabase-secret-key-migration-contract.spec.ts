/**
 * Spec 156 — Edge Functions už nesmí číst legacy SUPABASE_SERVICE_ROLE_KEY
 *
 * Statický contract test (bez DB, bez secretů — běží v každém CI).
 *
 * OneMil přešel z `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` na nový secret
 * `SUPABASE_SECRET_KEYS` (JSON slovník, klíč "default"), čtený výhradně přes
 * `supabase/functions/_shared/supabaseSecretKey.ts`. Tento test hlídá:
 *
 *  1. ŽÁDNÁ Edge Function (celý `supabase/functions/`, ne jen dnešní seznam)
 *     už `SUPABASE_SERVICE_ROLE_KEY` nečte — ochrana i proti budoucí regresi,
 *     kdyby někdo novou funkci omylem napsal podle staré šablony.
 *  2. Sdílený helper existuje, čte `SUPABASE_SECRET_KEYS`, parsuje JSON,
 *     používá klíč "default" a při chybějícím/neplatném vstupu VYHAZUJE
 *     chybu (nikdy nevrací undefined/prázdný řetězec, nikdy neloguje
 *     hodnotu klíče) — a nikde v sobě nemá fallback na starý secret.
 *  3. Funkce, které dřív klíč používaly, ho teď čtou přes sdílený helper,
 *     ne přes vlastní kopii parsovací logiky.
 *  4. Frontend (`src/`) nemá k `SUPABASE_SECRET_KEYS` ani k helperu žádný
 *     odkaz — secret nikdy neopouští server.
 */
import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const repoPath = (path: string) => resolve(process.cwd(), path);

const HELPER_PATH = 'supabase/functions/_shared/supabaseSecretKey.ts';

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

function listFiles(root: string): string[] {
  const absoluteRoot = repoPath(root);
  const result: string[] = [];
  for (const entry of readdirSync(absoluteRoot)) {
    const absolute = join(absoluteRoot, entry);
    const relative = absolute.slice(process.cwd().length + 1).replaceAll('\\', '/');
    if (
      relative.includes('/node_modules/')
      || relative.startsWith('node_modules/')
      || relative.startsWith('dist/')
      || relative.startsWith('.git/')
      || relative.startsWith('playwright-report/')
      || relative.startsWith('test-results/')
    ) {
      continue;
    }
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      result.push(...listFiles(relative));
    } else if (/\.ts$/.test(relative)) {
      result.push(relative);
    }
  }
  return result;
}

/** Every `supabase/functions/<name>/index.ts`, discovered fresh each run. */
function listEdgeFunctionEntrypoints(): string[] {
  return listFiles('supabase/functions').filter(
    (f) => /^supabase\/functions\/[^/]+\/index\.ts$/.test(f)
  );
}

test.describe('SUPABASE_SECRET_KEYS migration — kontrakt', () => {
  test('žádná Edge Function nečte legacy SUPABASE_SERVICE_ROLE_KEY', () => {
    const entrypoints = listEdgeFunctionEntrypoints();
    expect(entrypoints.length, 'sanity: musí existovat aspoň desítky Edge Functions').toBeGreaterThan(50);

    const offenders = entrypoints.filter((f) => read(f).includes('SUPABASE_SERVICE_ROLE_KEY'));
    expect(offenders, 'tyto Edge Functions stále čtou starý secret').toEqual([]);
  });

  test('žádný jiný soubor v supabase/functions/ (mimo dokumentaci helperu) legacy secret nečte', () => {
    const allTsFiles = listFiles('supabase/functions');
    const offenders = allTsFiles.filter((f) => {
      if (f === HELPER_PATH) return false; // dokumentační zmínky ve vlastních komentářích jsou OK
      return read(f).includes('SUPABASE_SERVICE_ROLE_KEY');
    });
    expect(offenders).toEqual([]);
  });

  test('sdílený helper: SUPABASE_SECRET_KEYS, klíč "default", žádný fallback, žádné logování', () => {
    const src = read(HELPER_PATH);
    const code = stripComments(src);

    // Čte nový secret a přesně tento klíč.
    expect(code).toContain('SUPABASE_SECRET_KEYS');
    expect(code).toContain('Deno.env.get(SECRET_KEYS_ENV_VAR)');
    expect(code).toMatch(/SECRET_KEYS_ENV_VAR\s*=\s*"SUPABASE_SECRET_KEYS"/);
    expect(code).toMatch(/DEFAULT_SECRET_KEY_NAME\s*=\s*"default"/);

    // JSON slovník, ne plain string.
    expect(code).toContain('JSON.parse(raw)');

    // Fail-closed: throw na chybějící env var / neplatný JSON / chybějící
    // objekt / chybějící neprázdný řetězec pod daným klíčem. Nikdy `return`
    // s prázdným/undefined fallbackem.
    const throwCount = (code.match(/throw new MissingSupabaseSecretKeyError/g) ?? []).length;
    expect(throwCount, 'musí existovat samostatný throw pro každý druh chyby').toBeGreaterThanOrEqual(4);
    expect(code).not.toMatch(/return\s+(undefined|null|"")\s*;/);
    expect(code).not.toMatch(/\?\?\s*(undefined|null|"")/);

    // KRITICKÉ: žádný fallback na starý secret, nikde v samotném kódu
    // (na rozdíl od dokumentačních komentářů, které legacy jméno smí zmínit).
    expect(code, 'helper nesmí nikde spadnout zpět na SUPABASE_SERVICE_ROLE_KEY').not.toContain(
      'SUPABASE_SERVICE_ROLE_KEY'
    );

    // Secret se nikdy neloguje — žádné console.* volání v celém souboru.
    expect(src, 'helper nesmí nikdy logovat hodnotu secretu').not.toMatch(/console\.(log|error|warn|info|debug)/);

    // Veřejné API zůstává stabilní pro volající kód.
    expect(code).toContain('export function getSupabaseSecretKey');
    expect(code).toContain('export function getSupabaseServiceRoleKey');
  });

  test('funkce, které klíč potřebují, ho čtou přes sdílený helper (žádná duplicitní parsovací logika)', () => {
    const entrypoints = listEdgeFunctionEntrypoints();
    const usingHelperFn = entrypoints.filter((f) => {
      const code = stripComments(read(f));
      return code.includes('getSupabaseSecretKey(');
    });

    // Musí to být desítky funkcí, ne jednotky — jinak se logika zase
    // rozešla do jednotlivých souborů místo sdíleného helperu.
    expect(usingHelperFn.length).toBeGreaterThanOrEqual(65);

    for (const f of usingHelperFn) {
      const code = stripComments(read(f));
      // Import musí mířit na sdílený modul, ne na lokální kopii.
      expect(code, `${f} musí importovat sdílený helper`).toMatch(
        /from\s+["']\.\.\/_shared\/supabaseSecretKey\.ts["']/
      );
      // Žádná funkce si nesmí sama parsovat SUPABASE_SECRET_KEYS znovu —
      // to by přesně duplikovalo logiku, kterou má centralizovat helper.
      expect(code, `${f} nesmí duplikovat JSON.parse(SUPABASE_SECRET_KEYS) mimo helper`).not.toMatch(
        /Deno\.env\.get\(["']SUPABASE_SECRET_KEYS["']\)/
      );
    }
  });

  test('frontend nikdy nečte SUPABASE_SECRET_KEYS ani neimportuje service-role helper', () => {
    const frontendFiles = listFiles('src');
    const offenders = frontendFiles.filter((f) => {
      const content = read(f);
      return content.includes('SUPABASE_SECRET_KEYS') || content.includes('supabaseSecretKey');
    });
    expect(offenders, 'secret ani helper k němu nesmí opustit server').toEqual([]);
  });

  test('.env.example dokumentuje nový secret, ne starý', () => {
    const example = read('.env.example');
    expect(example).toContain('SUPABASE_SECRET_KEYS');
    expect(example).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
