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
    expect(schedulerFn).toContain("r.role::text = 'superadmin'");
  });
});
