import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Trychtýřová diagnostika discovery jobu + oprava tichých propadů kandidátů.
// Kontrakt nad zdrojem workeru a migrace — worker je Deno EF se `serve()`,
// takže se stejně jako u spec 69 ověřuje zdrojově.

const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const worker = read('supabase/functions/sales-lead-discover/index.ts');
const migration = read('supabase/migrations/20260810100000_sales_lead_discovery_funnel.sql');
const overloadFix = read('supabase/migrations/20260810110000_sales_lead_propose_drop_legacy_overload.sql');
const loop = worker.split('const url = pool[cursor];')[1] ?? '';

test.describe('Migrace — sloupec funnel', () => {
  test('přidává jsonb objekt s prázdným výchozím stavem', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS funnel jsonb');
    expect(migration).toContain("NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).toContain("jsonb_typeof(funnel) = 'object'");
    expect(migration.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  test('je aditivní a neobsahuje secrets', () => {
    const sql = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(sql).not.toMatch(/DROP|TRUNCATE|DELETE FROM|UPDATE public\./i);
    expect(sql).not.toMatch(/vault|api[_-]?key|token|resend/i);
  });
});

test.describe('Žádný kandidát nesmí zmizet bez důvodu', () => {
  test('nerelevantní klasifikace se počítá', () => {
    expect(loop).toContain('if (!cls.relevant) { bump("classified_irrelevant"); continue; }');
  });

  test('technické selhání klasifikátoru je vlastní bucket, ne tichý propad', () => {
    expect(worker).toContain('failed: true');
    expect(loop).toContain('if (cls.failed) { bump("classifier_failed"); continue; }');
  });

  test('chyba RPC se počítá', () => {
    expect(loop).toContain('bump("rpc_error")');
    // Ukládá se jen kód chyby, ne text (mohl by nést data firmy).
    expect(loop).toContain('bumpReason("rpc_error_code", rpcErr.code || "unknown")');
  });

  test('jiný než created výsledek RPC se počítá i s důvodem', () => {
    expect(loop).toContain('bumpReason("rpc_rejected", res.reason || res.outcome || "unknown")');
  });

  test('každá continue větev ve smyčce něco započítá', () => {
    const branches = loop.split('continue;').slice(0, -1);
    for (const branch of branches) {
      const tail = branch.slice(-400);
      expect(tail).toMatch(/bump\(|bumpReason\(|counters\./);
    }
  });
});

test.describe('Rozpad důvodů vyřazení', () => {
  test('odmítnutí webu nese konkrétní důvod z verifieru', () => {
    expect(loop).toContain('bumpReason("site_rejected", site.reason || "site_unverified")');
    expect(loop).toContain('bump("no_company_name")');
    expect(loop).toContain('bumpReason("official_rejected"');
  });

  test('duplicity, kategorie a e-mail mají vlastní počty', () => {
    expect(loop).toContain('bump("duplicates")');
    expect(loop).toContain('bump("wrong_category")');
    expect(loop).toContain('bump(verifiedContact ? "email_found" : "email_missing")');
    expect(loop).toContain('bump("created")');
  });

  test('počet kandidátů z vyhledávání i zkontrolovaných se eviduje', () => {
    expect(worker).toContain('bump("candidates_from_search", added.length)');
    expect(loop).toContain('bump("checked")');
  });

  test('funnel se ukládá k jobu a přežívá napříč cron ticky', () => {
    expect(worker).toContain('job.funnel');
    const update = worker.split('.from("sales_lead_discovery_jobs").update(')[2] ?? '';
    expect(update).toContain('funnel,');
  });

  test('do funnelu jdou jen počty a krátké kódy, ne URL ani e-maily', () => {
    const helpers = worker.split('const bump =')[1]?.split('const deadline')[0] ?? '';
    expect(helpers).not.toMatch(/url|email|recipient|website/i);
    expect(helpers).toContain('.slice(0, 60)');
  });
});

test.describe('Skutečná příčina: uložený lead se nepočítal jako vytvořený', () => {
  test('každý reálně uložený lead se počítá do created_count', () => {
    // Dřív se lead uložený do jiného (platného) oboru počítal jako wrong_category,
    // takže job hlásil 0 vytvořených, přestože firmy do DB uložil.
    expect(loop).not.toContain('if (isTargetSegment) counters.created_count++; else counters.wrong_category++;');
    const created = loop.split('res.outcome !== "created"')[1] ?? '';
    expect(created).toContain('counters.created_count++;');
  });

  test('cílový a necílový obor jsou rozlišené jen v diagnostice', () => {
    expect(loop).toContain('bump(isTargetSegment ? "created_in_target_group" : "created_in_other_group")');
  });

  test('wrong_category zůstává jen pro skutečné odmítnutí před uložením', () => {
    const rejections = loop.split('counters.wrong_category++').length - 1;
    expect(rejections).toBe(1);
  });
});

test.describe('Kategorie jine místo zahození ověřené firmy', () => {
  test('neurčená kategorie spadne do jine a započítá se', () => {
    expect(loop).toContain('if (!targetGroup && ico && validSlugs.has("jine"))');
    expect(loop).toContain('targetGroup = "jine"');
    expect(loop).toContain('bump("classified_fallback_other")');
  });

  test('fallback platí jen pro firmu s IČO z ARES — katalog se tudy neprotáhne', () => {
    // Bez registrované identity zůstává kandidát odmítnutý a je to vidět v diagnostice.
    expect(loop).toContain('if (!targetGroup && !ico) bump("fallback_blocked_no_ico")');
  });

  test('wrong_category zůstává pro případ, že jine neexistuje', () => {
    expect(loop).toContain('if (!targetGroup) { counters.wrong_category++; bump("wrong_category"); continue; }');
  });
});

test.describe('Bezpečnostní kontroly zůstávají', () => {
  test('ověření webu, ARES i přísný verifier jsou beze změny', () => {
    expect(worker).toContain('verifyDiscoveredCompanySite');
    expect(worker).toContain('aresByIco');
    expect(worker).toContain('aresByName');
    expect(worker).toContain('verifyCompanyWebsite');
  });

  test('deduplikace podle domény, IČO i názvu zůstává', () => {
    expect(loop).toContain('website_domain.eq.');
    expect(loop).toContain('company_name.ilike.');
    expect(loop).toContain('orParts.push(`ico.eq.${ico}`)');
  });

  test('e-mail se ukládá jen po druhém ověření na oficiálním webu', () => {
    expect(worker).toContain('verifyEmailOnOfficialSourcePage');
    expect(worker).toContain('backend_verified_official_website');
    expect(worker).toContain('verifiedContact ? "sales_lead_propose_with_contact" : "sales_lead_propose"');
  });

  test('firma bez e-mailu smí vzniknout jako návrh', () => {
    expect(worker).toContain('const rpcName = verifiedContact');
    expect(loop).not.toContain('if (!verifiedContact) continue;');
  });

  test('discovery nic neodesílá', () => {
    expect(worker).not.toMatch(/resend|email_queue|send-sales-lead/i);
  });
});

test.describe('Nejednoznačné přetížení sales_lead_propose', () => {
  test('maže se jen zastaralá 10argumentová verze, a jen když existuje nová', () => {
    expect(overloadFix).toContain('p.pronargs = 11');
    expect(overloadFix).toContain('p.pronargs = 10');
    const dropped = overloadFix.split('DROP FUNCTION public.sales_lead_propose(')[1].split(')')[0];
    // Mazaná signatura má 10 argumentů; přísnější verze s p_contact_email zůstává.
    expect(dropped.split(',').length).toBe(10);
    expect(dropped).not.toContain('smallint, jsonb, text, text, text, text, text');
  });

  test('po migraci smí zůstat právě jedno přetížení', () => {
    expect(overloadFix).toContain('musi mit prave jedno pretizeni');
    expect(overloadFix).toContain('RAISE EXCEPTION');
  });

  test('oprávnění zůstávají service-role only', () => {
    expect(overloadFix).toContain('FROM PUBLIC, anon, authenticated;');
    expect(overloadFix).toContain('TO service_role;');
  });

  test('migrace je transakční a nesahá na data leadů', () => {
    expect(overloadFix.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(overloadFix.trimEnd().endsWith('COMMIT;')).toBe(true);
    const sql = overloadFix
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(sql).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE|UPDATE public\./i);
  });
});
