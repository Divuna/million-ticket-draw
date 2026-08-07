import { expect, test } from '@playwright/test';
import fs from 'node:fs';

// Normalizace CRLF — git na Windows soubory vytahuje s CRLF.
const read = (path: string) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const migration = read('supabase/migrations/20260807120000_sales_lead_discovery_scheduler.sql');
const sql = migration.replace(/--.*$/gm, '');
const discoverEf = read('supabase/functions/sales-lead-discover/index.ts');
const workerFnMigration = read('supabase/migrations/20260712130000_sales_lead_discovery_worker_cron.sql');

/** Tělo plánovače — bez komentářů, pro asserce na skutečný kód. */
const schedulerFn = sql.slice(
  sql.indexOf('CREATE OR REPLACE FUNCTION public.run_sales_lead_discovery_scheduler'),
  sql.indexOf('REVOKE ALL ON FUNCTION public.run_sales_lead_discovery_scheduler'),
);
/** Tělo propose RPC (deduplikace). */
const proposeFn = sql.slice(
  sql.indexOf('CREATE OR REPLACE FUNCTION public.sales_lead_propose('),
  sql.indexOf('CREATE OR REPLACE FUNCTION public.sales_lead_propose_with_contact'),
);
const rotationFn = sql.slice(
  sql.indexOf('CREATE OR REPLACE FUNCTION public.sales_lead_pick_next_discovery_group'),
  sql.indexOf('REVOKE ALL ON FUNCTION public.sales_lead_pick_next_discovery_group'),
);
/** Tělo výběru vlastníka automatického jobu. */
const ownerFn = sql.slice(
  sql.indexOf('CREATE OR REPLACE FUNCTION public.sales_lead_pick_discovery_owner'),
  sql.indexOf('REVOKE ALL ON FUNCTION public.sales_lead_pick_discovery_owner'),
);

test.describe('109 — automatické zakládání discovery jobů', () => {
  test('1) žádný aktivní job → plánovač založí právě 1 job', () => {
    // Jediný INSERT v celé funkci, a to do fronty jobů.
    expect(schedulerFn.match(/INSERT INTO/gi) ?? []).toHaveLength(1);
    expect(schedulerFn).toContain('INSERT INTO public.sales_lead_discovery_jobs');
    expect(schedulerFn).toMatch(/VALUES \(v_group, 5, 80, 'queued', v_created_by, true\)/);
    expect(schedulerFn).toContain("'created', true");
  });

  test('2) queued job existuje → nevytvoří nic', () => {
    expect(schedulerFn).toMatch(
      /IF EXISTS \(\s*SELECT 1 FROM public\.sales_lead_discovery_jobs\s*WHERE status IN \('queued', 'running'\)\s*\) THEN\s*RETURN jsonb_build_object\([^)]*'created', false, 'reason', 'job_already_active'/,
    );
  });

  test('3) running job existuje → nevytvoří nic', () => {
    // Stejný guard pokrývá oba stavy.
    expect(schedulerFn).toContain("WHERE status IN ('queued', 'running')");
    // A guard je PŘED insertem.
    expect(schedulerFn.indexOf('job_already_active'))
      .toBeLessThan(schedulerFn.indexOf('INSERT INTO public.sales_lead_discovery_jobs'));
  });

  test('4) opakované spuštění nevytvoří duplicitu', () => {
    // Advisory lock proti souběhu + stavový guard proti opakování.
    expect(schedulerFn).toContain("pg_try_advisory_xact_lock(hashtextextended('sales_lead_discovery_scheduler', 0))");
    expect(schedulerFn).toContain("'scheduler_busy'");
    // Cron běží 1× denně, ne každou minutu.
    expect(sql).toContain("'sales_lead_discovery_scheduler_daily'");
    expect(sql).toContain("'20 4 * * *'");
    // Přeplánování je idempotentní.
    expect(sql).toContain("SELECT cron.unschedule('sales_lead_discovery_scheduler_daily')");
  });

  test('5) kategorie se rotují podle skutečného číselníku', () => {
    // LRU: nejdéle nepoužitá aktivní skupina, nikdy nepoužitá má přednost.
    expect(rotationFn).toContain('FROM public.sales_lead_groups g');
    expect(rotationFn).toContain('MAX(j.created_at) AS last_used'.replace('MAX', 'max'));
    expect(rotationFn).toContain('ORDER BY u.last_used ASC NULLS FIRST');
    expect(rotationFn).toContain('WHERE g.is_active');
    // Catch-all kategorie se aktivně nevyhledává.
    expect(rotationFn).toContain("g.slug <> 'jine'");
    // Nevymýšlí nové názvy kategorií — čte je z tabulky.
    expect(rotationFn).not.toMatch(/'e-shopy'|'sport'|'auto-moto'/);
  });

  test('6) stejná doména se znovu neuloží', () => {
    expect(proposeFn).toMatch(/WHERE website_domain = v_domain[\s\S]{0,120}'duplicate_domain'/);
  });

  test('7) stejné IČO se znovu neuloží', () => {
    expect(proposeFn).toMatch(/WHERE ico = v_ico[\s\S]{0,120}'duplicate_ico'/);
  });

  test('8) stejný contact_email se znovu neuloží', () => {
    expect(proposeFn).toContain('p_contact_email text DEFAULT NULL');
    expect(proposeFn).toMatch(/lower\(btrim\(contact_email\)\) = v_email[\s\S]{0,120}'duplicate_email'/);
    // `_with_contact` e-mail do dedupu skutečně předává.
    expect(sql).toMatch(/v_result := public\.sales_lead_propose\([\s\S]{0,320}v_email\s*\);/);
  });

  test('9) lead s do_not_contact se znovu nezaloží', () => {
    expect(proposeFn).toMatch(
      /WHERE do_not_contact IS TRUE[\s\S]{0,400}'do_not_contact'/,
    );
    // Kontroluje se podle domény, IČO i e-mailu.
    const dnc = proposeFn.slice(proposeFn.indexOf('WHERE do_not_contact IS TRUE'));
    expect(dnc).toContain('website_domain = v_domain');
    expect(dnc).toContain('ico = v_ico');
    expect(dnc).toContain('lower(btrim(contact_email)) = v_email');
  });

  test('10) suppression podle přesného e-mailu blokuje', () => {
    expect(proposeFn).toMatch(/lower\(btrim\(email_pattern\)\) = v_email[\s\S]{0,200}'suppressed_email'/);
  });

  test('11) doménová suppression blokuje', () => {
    expect(proposeFn).toMatch(/email_pattern = '@' \|\| v_domain[\s\S]{0,120}'suppressed_domain'/);
  });

  test('12) partner se stejným IČO blokuje', () => {
    expect(proposeFn).toMatch(/FROM public\.partners WHERE ico = v_ico[\s\S]{0,120}'already_partner'/);
  });

  test('13+14) dříve oslovený/odpovědělý i archivovaný podnik blokuje', () => {
    // Klíčová oprava: archivované leady už nejsou z dedupu vyjmuté, takže
    // blokuje jakýkoli existující lead bez ohledu na stav (osloveno, odpovedel,
    // archivovan…).
    expect(proposeFn).not.toContain("status <> 'archivovan'");
    expect(proposeFn).toContain('SELECT 1 FROM public.sales_leads WHERE ico = v_ico');
    expect(proposeFn).toContain('SELECT 1 FROM public.sales_leads WHERE website_domain = v_domain');
  });

  test('15) plánovač nevytváří batch ani e-mail', () => {
    expect(schedulerFn).not.toMatch(
      /Resend|emails\.send|email_queue|net\.http|sales_lead_email_batch|automation_settings|mark_emailed/i,
    );
    // Nemění obchodní stavy leadů.
    expect(schedulerFn).not.toMatch(/UPDATE public\.sales_leads/i);
    expect(schedulerFn).not.toContain("'osloveno'");
    // Nové firmy končí výhradně v Návrzích.
    expect(proposeFn).toContain("'navrzeny'");
    expect(proposeFn).not.toContain("'osloveno'");
  });

  test('bezpečnost: žádný secret v SQL, správné grants', () => {
    // Cron příkaz neobsahuje token ani URL — ty čte až worker z Vaultu.
    expect(sql).toContain('$cron$SELECT public.run_sales_lead_discovery_scheduler();$cron$');
    expect(sql).not.toMatch(/decrypted_secret|x-internal-token|Bearer /i);
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    for (const fn of [
      'public.run_sales_lead_discovery_scheduler()',
      'public.sales_lead_pick_next_discovery_group()',
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${fn}\n  FROM PUBLIC, anon, authenticated`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${fn}\n  TO service_role`);
    }
  });

  test('architektura workeru zůstává beze změny', () => {
    // Plánovač jen plní frontu; worker i EF se nemění.
    expect(workerFnMigration).toContain('run_sales_lead_discovery_worker');
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.run_sales_lead_discovery_worker');
    expect(sql).not.toContain('sales-lead-discover');
    // EF stále nic neodesílá.
    for (const p of ['Resend', 'emails.send', 'email_queue', 'sales_lead_email_batch']) {
      expect(discoverEf).not.toContain(p);
    }
  });

  test('audit: automatický job je rozlišitelný a nese metriky', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false');
    expect(sql).toContain('COMMENT ON COLUMN public.sales_lead_discovery_jobs.auto_created');
    // Ostatní auditní data už tabulka má — nový dashboard nevzniká.
    expect(sql).not.toMatch(/CREATE TABLE|CREATE VIEW|CREATE MATERIALIZED VIEW/i);
  });

  test('parametry vycházejí z historických jobů (5 firem / 80 kandidátů)', () => {
    expect(schedulerFn).toContain('v_group, 5, 80');
    // created_by je povinné — bez vlastníka se job vědomě nezaloží.
    expect(schedulerFn).toContain("'no_owner_available'");
  });
});

// ── Validace vlastníka automatického jobu ────────────────────────────────────
// `sales_lead_discovery_jobs` nemá FK, takže jeho `created_by` může „viset" na
// smazaného uživatele. `sales_leads.created_by` FK má (ON DELETE RESTRICT),
// takže neplatný vlastník by shodil KAŽDÝ insert leadu.
test.describe('109b — created_by automatického discovery jobu', () => {
  test('O1) vlastník se vybírá jen z existujících adminů se sales oprávněním', () => {
    expect(ownerFn).toContain('FROM auth.users u');
    expect(ownerFn).toContain('JOIN public.user_roles r ON r.user_id = u.id');
    expect(ownerFn).toContain("r.role::text IN ('admin', 'superadmin')");
    expect(ownerFn).toContain("public.has_admin_permission('sales_leads.manage', u.id)");
  });

  test('O2) autor posledního jobu se použije JEN když je stále vhodný', () => {
    // Poslední vlastník je pouhé řazení NAD množinou vhodných uživatelů,
    // takže nevhodné UUID se do výběru vůbec nedostane.
    expect(ownerFn).toContain('SELECT e.id\n  FROM eligible e');
    expect(ownerFn).toContain('(e.id = (SELECT id FROM last_owner)) DESC');
    // Není zde žádná větev, která by last_owner vzala bez ověření.
    expect(ownerFn).not.toMatch(/SELECT j\.created_by INTO/);
  });

  test('O3) neexistující ani demotovaný uživatel se nepoužije', () => {
    // Ověřeno read-only proti produkčním datům (scénáře B a C):
    //   neexistující UUID  → fallback na superadmina
    //   uživatel bez role  → fallback na superadmina
    // Strukturálně to zajišťuje ORDER BY nad `eligible`, ne WHERE na last_owner.
    const eligibleBlock = ownerFn.slice(ownerFn.indexOf('WITH eligible AS'), ownerFn.indexOf('last_owner AS'));
    expect(eligibleBlock).toContain('FROM auth.users u');
    expect(eligibleBlock).toContain('has_admin_permission');
    // last_owner sám o sobě nefiltruje — jen upřednostňuje.
    const lastOwnerBlock = ownerFn.slice(ownerFn.indexOf('last_owner AS'), ownerFn.indexOf('SELECT e.id'));
    expect(lastOwnerBlock).not.toContain('auth.users');
  });

  test('O4) fallback je deterministický (superadmin, pak nejstarší admin)', () => {
    expect(ownerFn).toContain('e.is_superadmin DESC');
    expect(ownerFn).toContain('e.created_at ASC');
    expect(ownerFn).toContain('e.id ASC');
    expect(ownerFn).toContain('LIMIT 1');
  });

  test('O5) žádný vhodný admin → no_owner_available, 0 jobů, bez výjimky', () => {
    // Prázdná množina `eligible` → SELECT ... LIMIT 1 vrátí NULL (ne chybu).
    expect(schedulerFn).toContain('v_created_by := public.sales_lead_pick_discovery_owner();');
    expect(schedulerFn).toMatch(
      /IF v_created_by IS NULL THEN[\s\S]{0,400}'created', false, 'reason', 'no_owner_available'/,
    );
    // Guard je PŘED insertem → žádný částečný zápis.
    expect(schedulerFn.indexOf('no_owner_available'))
      .toBeLessThan(schedulerFn.indexOf('INSERT INTO public.sales_lead_discovery_jobs'));
    expect(ownerFn).not.toMatch(/RAISE\s+EXCEPTION/i);
  });

  test('O6) job nikdy nevznikne s neplatným created_by', () => {
    // Jediný zdroj created_by je validovaná funkce.
    expect(schedulerFn).not.toMatch(/created_by\s+INTO\s+v_created_by/i);
    expect(schedulerFn.match(/v_created_by :=/g) ?? []).toHaveLength(1);
    // A i kdyby se FK přesto porušilo, propose vrátí čitelný důvod místo výjimky.
    expect(proposeFn).toContain('WHEN foreign_key_violation THEN');
    expect(proposeFn).toContain("'invalid_owner'");
  });

  test('O7) nezakládá systémový účet ani nemění role', () => {
    for (const fn of [ownerFn, schedulerFn]) {
      expect(fn).not.toMatch(/INSERT INTO auth\.users|UPDATE auth\.users|DELETE FROM auth\.users/i);
      expect(fn).not.toMatch(/INSERT INTO public\.user_roles|UPDATE public\.user_roles/i);
      expect(fn).not.toMatch(/INSERT INTO public\.admin_permissions/i);
    }
    // Výběr je jen pro čtení.
    expect(ownerFn).toContain('LANGUAGE sql');
    expect(ownerFn).toContain('STABLE');
  });

  test('O8) výběr vlastníka má správná oprávnění a search_path', () => {
    expect(ownerFn).toContain('SECURITY DEFINER');
    expect(ownerFn).toContain("SET search_path = ''");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.sales_lead_pick_discovery_owner()\n  FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.sales_lead_pick_discovery_owner()\n  TO service_role');
  });

  test('O9) vlastník je dohledatelný v návratové hodnotě', () => {
    expect(schedulerFn).toContain("'created_by', v_created_by");
  });
});
