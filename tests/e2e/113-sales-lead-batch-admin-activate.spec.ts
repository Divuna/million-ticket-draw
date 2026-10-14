import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Kontrakt admin cesty pro spuštění připravené e-mailové dávky.
// Aktivace pouze přepne paused → scheduled. Neodesílá e-mail, nevolá
// poskytovatele a nezapíná kill-switch `sales_lead_email_automation_settings`.

const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260808160000_sales_lead_email_batch_activate_admin.sql');
const sheet = read('src/components/admin/sales-leads/SalesLeadEmailBatchesSheet.tsx');
const copy = read('src/components/admin/sales-leads/salesLeadEmailBatches.ts');

const activateFn = migration
  .split('CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_activate(p_batch_id uuid)')[1]
  ?.split('CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_activate_admin')[0] ?? '';
const adminFn = migration
  .split('CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_activate_admin(p_batch_id uuid)')[1] ?? '';

test.describe('Aktivace dávky — serverové pojistky', () => {
  test('1) paused dávka se přepne na scheduled podmíněným UPDATE', () => {
    expect(activateFn).toContain("SET status = 'scheduled'");
    expect(activateFn).toContain("WHERE id = p_batch_id AND status = 'paused'");
    expect(activateFn).toContain("'batch_status', 'scheduled'");
  });

  test('2) dvojité kliknutí nezdvojí aktivaci — zámek + podmíněný UPDATE', () => {
    expect(activateFn).toContain('FOR UPDATE');
    // Druhý běh už řádek ve stavu paused nenajde a vrátí chybu, ne druhou aktivaci.
    expect(activateFn).toMatch(/IF NOT FOUND THEN\s+RETURN jsonb_build_object\('success', false, 'error', 'batch_not_activatable'\)/);
  });

  test('3) completed/cancelled/scheduled dávka je odmítnuta', () => {
    expect(activateFn).toContain("IF v_batch.status <> 'paused' THEN");
    expect(activateFn).toContain("'batch_not_activatable', 'batch_status', v_batch.status");
  });

  test('4+5) admin obálka vyžaduje přihlášení i oprávnění sales_leads.manage', () => {
    expect(adminFn).toContain('v_caller uuid := auth.uid()');
    expect(adminFn).toContain("has_admin_permission('sales_leads.manage', v_caller)");
    expect(adminFn).toContain("'error', 'access_denied'");
    expect(adminFn).toContain('IF v_caller IS NULL OR NOT');
  });

  test('obálka jen deleguje — nevzniká druhý paralelní systém', () => {
    expect(adminFn).toContain('RETURN public.sales_lead_email_batch_activate(p_batch_id);');
    expect(adminFn).not.toContain('UPDATE public.sales_lead_email_batches');
  });

  test('ostatní pojistky zůstaly: processing, okno, čekající položky', () => {
    expect(activateFn).toContain("'batch_processing'");
    expect(activateFn).toContain("'scheduled_window_missed'");
    expect(activateFn).toContain("'no_pending_items'");
    expect(activateFn).toContain("'batch_not_found'");
  });

  test('7) aktivace neodesílá e-mail ani nevolá poskytovatele', () => {
    const executable = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/resend|net\.http|pg_net|email_queue|provider|send/i);
    expect(activateFn).not.toContain('sales_lead_email_deliveries');
    expect(activateFn).not.toContain('sales_lead_initial_email_claim');
  });

  test('8) aktivace nezapíná email automation', () => {
    // Kill-switch se nesmí ani číst pro zápis, ani měnit.
    expect(activateFn).not.toContain('UPDATE public.sales_lead_email_automation_settings');
    expect(adminFn).not.toContain('sales_lead_email_automation_settings');
    expect(migration).not.toContain("SET enabled = true");
    expect(migration).not.toContain('sales_lead_email_automation_set_enabled');
  });

  test('kill-switch zůstává jedinou branou odeslání (claim_next), aktivace ji neobchází', () => {
    // Odeslání hlídá claim_next, ne aktivace — proto v aktivaci enabled gate není.
    expect(activateFn).not.toContain('automation_must_be_enabled');
    expect(migration).toContain('sales_lead_email_batch_claim_next');
  });

  test('oprávnění: základní funkce service-role only, obálka pro authenticated bez anon', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.sales_lead_email_batch_activate\(uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.sales_lead_email_batch_activate\(uuid\) TO service_role;/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.sales_lead_email_batch_activate_admin\(uuid\) FROM PUBLIC, anon;/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.sales_lead_email_batch_activate_admin\(uuid\) TO authenticated, service_role;/);
    expect(adminFn).toContain('SECURITY DEFINER');
    expect(adminFn).toContain("SET search_path = ''");
  });

  test('9) migrace nesahá na existující dávky ani jejich položky', () => {
    const executable = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    // Jediný UPDATE je podmíněný přepis stavu uvnitř těla funkce.
    expect(executable).not.toMatch(/UPDATE public\.sales_lead_email_batch_items/);
    expect(executable).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE/i);
    expect(executable).not.toMatch(/UPDATE public\.sales_lead_email_batches\s+SET status = 'scheduled'\s+WHERE id <> /);
  });
});

test.describe('Aktivace dávky — administrace', () => {
  test('tlačítko Spustit dávku je jen u pozastavené dávky', () => {
    expect(sheet).toContain("batch.status === 'paused' && (");
    expect(sheet).toContain('Spustit dávku');
    expect(sheet).toContain('data-testid="batch-activate-button"');
  });

  test('UI volá admin-gated RPC, nikdy základní funkci ani service-role klíč', () => {
    expect(sheet).toContain("rpc('sales_lead_email_batch_activate_admin'");
    expect(sheet).not.toContain("rpc('sales_lead_email_batch_activate'");
    expect(sheet).not.toMatch(/service_role|SERVICE_ROLE|serviceRole/);
  });

  test('6) ve frontend kódu není service-role klíč', () => {
    const frontend = [
      sheet,
      copy,
      read('src/components/admin/sales-leads/SalesLeadEmailBatchDialog.tsx'),
      read('src/integrations/supabase/client.ts'),
    ].join('\n');
    expect(frontend).not.toMatch(/service_role|SERVICE_ROLE_KEY|serviceRoleKey/);
  });

  test('dvojí kliknutí je blokované i v UI', () => {
    expect(sheet).toContain('const [activatingId, setActivatingId] = useState<string | null>(null);');
    expect(sheet).toContain('if (activatingId) return;');
    expect(sheet).toContain('disabled={activatingId !== null}');
    expect(sheet).toContain("activatingId === batch.id ? 'Spouštím…' : 'Spustit dávku'");
  });

  test('úspěch jasně říká, že je dávka naplánovaná a nic se neodeslalo', () => {
    expect(sheet).toContain("toast.success('Dávka je naplánovaná.'");
    expect(sheet).toContain('Zatím se nic neodeslalo');
    expect(sheet).toContain('await load();');
  });

  test('chyby mají srozumitelný český překlad', () => {
    expect(sheet).toContain('salesLeadEmailBatchReasonMessage(result.error)');
    expect(copy).toContain('batch_not_activatable:');
    expect(copy).toContain('no_pending_items:');
    expect(copy).toContain('scheduled_window_missed:');
    expect(copy).toContain('access_denied:');
  });
});
