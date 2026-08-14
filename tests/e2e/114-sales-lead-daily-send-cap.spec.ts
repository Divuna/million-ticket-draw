import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Denní strop prvních obchodních e-mailů napříč VŠEMI dávkami.
// Kontrakt je ověřován nad zdrojem migrace, protože jediné místo, kde e-mail
// reálně odchází, je `sales_lead_email_batch_claim_next`.

const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260809140000_sales_lead_daily_cap_batch_only.sql');
const claimFn = migration
  .split('CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_claim_next()')[1]
  ?.split('REVOKE ALL ON FUNCTION')[0] ?? '';

/** Blok, který spočítá dnešní spotřebu limitu. */
const budgetBlock = claimFn.split('INTO v_used_today')[1]?.split('IF v_used_today')[0] ?? '';
/** Vyhodnocení stropu. */
const capBlock = claimFn.split('IF v_used_today >= v_settings.daily_limit THEN')[1]?.split('END IF;')[0] ?? '';

test.describe('Denní strop — výpočet', () => {
  test('strop se čte z nastavení a porovnává se skutečnou spotřebou', () => {
    expect(claimFn).toContain('v_used_today integer');
    expect(claimFn).toContain('IF v_used_today >= v_settings.daily_limit THEN');
  });

  test('1+2+3) pod limitem se pokračuje, na limitu se claim zastaví', () => {
    // Porovnání je >=, takže 0..19 projde a 20. spotřebovaná položka claim zastaví.
    expect(claimFn).toMatch(/IF v_used_today >= v_settings\.daily_limit THEN/);
    expect(capBlock).toContain("'action', 'noop'");
    expect(capBlock).toContain("'reason', 'daily_limit_reached'");
    // Vrací i čísla, aby bylo z logu vidět proč.
    expect(capBlock).toContain("'daily_limit', v_settings.daily_limit");
    expect(capBlock).toContain("'used_today', v_used_today");
  });

  test('4) počítá napříč dávkami — ne v rámci jedné dávky', () => {
    // Vazba je na kalendářní den, nikoli na batch_id.
    expect(budgetBlock).toContain('b.scheduled_date = v_today');
    expect(budgetBlock).not.toContain('i.batch_id = v_item.batch_id');
    expect(budgetBlock).not.toContain('b.id = v_item.batch_id');
  });

  test('5) souběh dvou workerů: počítá se pod zámkem settings a processing se započítá', () => {
    // Zámek je první příkaz funkce a drží se celou transakci včetně UPDATE na processing.
    const beforeBudget = claimFn.split('Denní strop')[0] ?? '';
    expect(beforeBudget).toContain('FROM public.sales_lead_email_automation_settings WHERE singleton FOR UPDATE');
    // Zabraná (dosud nedokončená) položka spotřebovává limit — tím se uzavře okno
    // mezi claimem a vznikem delivery.
    expect(budgetBlock).toContain("i.status = 'processing'");
  });

  test('6+7+8) provider_accepted, uncertain i committed spotřebují limit', () => {
    expect(budgetBlock).toContain("'sending', 'provider_accepted', 'committed', 'uncertain'");
  });

  test('9) prepared a provider_rejected se nepočítají — poskytovatel nic nepřijal', () => {
    const consumed = "'sending', 'provider_accepted', 'committed', 'uncertain'";
    expect(budgetBlock).toContain(consumed);
    expect(budgetBlock).not.toContain("'prepared'");
    expect(budgetBlock).not.toContain("'provider_rejected'");
  });

  test('ruční první e-maily se do denního stropu NEzapočítávají a nemají limit', () => {
    // Strop je jen pro dávkový tok; manual_initial nesmí snižovat automatickou kapacitu.
    expect(budgetBlock).not.toContain("manual_initial");
    expect(budgetBlock).not.toContain("d.mode <> 'batch_initial'");
    expect(budgetBlock).toContain("d.mode = 'batch_initial'");
    // Počítá se výhradně přes položky dávek, ne přes samostatné delivery.
    expect(budgetBlock).toContain('FROM public.sales_lead_email_batch_items i');
  });

  test('10) den se určuje v Europe/Prague, takže půlnoc limit resetuje', () => {
    expect(claimFn).toContain("v_today := (v_now AT TIME ZONE 'Europe/Prague')::date;");
    expect(claimFn).toContain("b.scheduled_date = v_today");
  });
});

test.describe('Denní strop — pořadí kontrol a bezpečnost', () => {
  test('11) kill-switch se vyhodnocuje PŘED denním stropem i před claimem', () => {
    // Pozor: `v_used_today` je i v DECLARE, proto se měří až místo výpočtu.
    const automationIdx = claimFn.indexOf('automation_disabled');
    const budgetIdx = claimFn.indexOf('INTO v_used_today');
    const claimIdx = claimFn.indexOf("SET status = 'processing'");
    expect(automationIdx).toBeGreaterThan(-1);
    expect(budgetIdx).toBeGreaterThan(-1);
    expect(automationIdx).toBeLessThan(budgetIdx);
    expect(budgetIdx).toBeLessThan(claimIdx);
  });

  test('strop se vyhodnotí PŘED zabráním položky, ne po něm', () => {
    const capIdx = claimFn.indexOf("'daily_limit_reached'");
    const claimIdx = claimFn.indexOf("SET status = 'processing'");
    expect(capIdx).toBeLessThan(claimIdx);
  });

  test('commit_only větev zůstává před stropem — už odeslaný e-mail se musí dokončit', () => {
    const commitIdx = claimFn.indexOf("'commit_only'");
    const budgetIdx = claimFn.indexOf('INTO v_used_today');
    expect(commitIdx).toBeGreaterThan(-1);
    expect(commitIdx).toBeLessThan(budgetIdx);
  });

  test('při dosažení stropu se nic nezabere ani neoznačí', () => {
    expect(capBlock).not.toContain('UPDATE');
    expect(capBlock).not.toContain("'send'");
    expect(capBlock).not.toContain('skip_reason');
  });

  test('žádná existující pojistka leadu nezmizela', () => {
    for (const guard of [
      'initial_email_status_not_allowed', 'do_not_contact', 'existing_partner',
      'contact_email_changed', 'email_not_verified', 'suppressed',
      'initial_email_already_sent', 'initial_email_already_claimed',
      'already_in_active_batch', 'duplicate_guard_failed', 'scheduled_window_missed',
    ]) {
      expect(claimFn).toContain(guard);
    }
  });

  test('12) migrace nesahá na dávky, položky, leady ani na kill-switch', () => {
    const executable = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/UPDATE public\.sales_lead_email_automation_settings/);
    expect(executable).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE/i);
    expect(executable).not.toMatch(/INSERT INTO public\.sales_lead_email_batches/);
    // Jediné UPDATE jsou uvnitř těla funkce na claimovanou položku.
    expect(executable).not.toMatch(/UPDATE public\.sales_leads/);
  });

  test('migrace nemění follow-upy, discovery, OpenAI, Resend ani secrets', () => {
    const executable = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/follow_up|discovery|openai|resend|vault|secret|api[_-]?key/i);
  });

  test('oprávnění zůstávají service-role only', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.sales_lead_email_batch_claim_next\(\) FROM PUBLIC, anon, authenticated;/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.sales_lead_email_batch_claim_next\(\) TO service_role;/);
    expect(claimFn).toContain('SECURITY DEFINER');
    expect(claimFn).toContain("SET search_path = ''");
  });

  test('migrace je transakční', () => {
    expect(migration.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true);
  });
});
