import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Ovládání kill-switche automatického odesílání přímo z administrace.
// Zápis jde přes existující superadmin-only RPC; frontend nemá service-role klíč
// a žádná paralelní cesta nevzniká.

const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const sheet = read('src/components/admin/sales-leads/SalesLeadEmailBatchesSheet.tsx');
const copy = read('src/components/admin/sales-leads/salesLeadEmailBatches.ts');
const toggleFn = sheet.split('const setAutomation = async')[1]?.split('const cancel = async')[0] ?? '';

test.describe('Přepínač automatiky — backend a oprávnění', () => {
  test('1+2) zápis jde výhradně přes existující superadmin-only RPC', () => {
    expect(toggleFn).toContain("rpc('sales_lead_email_automation_set_enabled'");
    // Žádný přímý zápis do tabulky nastavení z frontendu.
    expect(sheet).not.toContain("from('sales_lead_email_automation_settings').update");
    expect(sheet).not.toContain("from('sales_lead_email_automation_settings').upsert");
  });

  test('3+4) ovládání se zobrazí jen superadminovi', () => {
    expect(sheet).toContain("import { useUserRole } from '@/hooks/useUserRole';");
    expect(sheet).toContain('const { isSuperAdmin } = useUserRole();');
    expect(sheet).toContain('{isSuperAdmin && automationEnabled !== null && (');
    expect(sheet).toContain('data-testid="automation-toggle"');
  });

  test('ve frontendu není service-role klíč', () => {
    const frontend = [sheet, copy, read('src/integrations/supabase/client.ts')].join('\n');
    expect(frontend).not.toMatch(/service_role|SERVICE_ROLE_KEY|serviceRoleKey/);
  });
});

test.describe('Přepínač automatiky — chování UI', () => {
  test('6+7) stav se čte z DB, takže je správný i po reloadu', () => {
    expect(sheet).toContain("from('sales_lead_email_automation_settings')");
    expect(sheet).toContain(".select('enabled')");
    // Načtení je součástí load(), které běží při otevření i při refreshKey.
    expect(sheet).toContain('const load = useCallback(async () => {');
    expect(sheet).toContain('if (open) void load();');
  });

  test('po přepnutí se stav znovu načte z DB, ne jen z lokálního stavu', () => {
    expect(toggleFn).toContain('await load();');
    expect(toggleFn).not.toContain('setAutomationEnabled(next)');
  });

  test('5) opakované kliknutí je bezpečné — běh je uzamčený', () => {
    expect(toggleFn).toContain('if (automationBusy) return;');
    expect(sheet).toContain('disabled={automationBusy}');
    expect(sheet).toContain("automationBusy" + '\n' + "                  ? 'Ukládám…'");
  });

  test('oba stavy mají jasný popis i tlačítko', () => {
    expect(sheet).toContain("'Automatika zapnutá'");
    expect(sheet).toContain("'Automatika vypnutá'");
    expect(sheet).toContain("'Zapnout automatiku'");
    expect(sheet).toContain("'Vypnout automatiku'");
    expect(sheet).toContain('data-testid="automation-status"');
  });

  test('zapnutí vyžaduje potvrzení a říká, co se stane', () => {
    expect(sheet).toContain('data-testid="automation-confirm-dialog"');
    expect(sheet).toContain("'Zapnout automatické odesílání?'");
    expect(sheet).toContain('nejvýše 20 e-mailů za den');
    expect(sheet).toContain('Pozastavené dávky se nespustí.');
  });

  test('chyba má srozumitelnou hlášku', () => {
    expect(toggleFn).toContain('salesLeadEmailBatchReasonMessage(result.error)');
    expect(copy).toContain('access_denied_superadmin_only:');
    expect(copy).toContain('enabled_required:');
  });

  test('vypnutí jasně říká, že se nic dalšího neodešle', () => {
    expect(toggleFn).toContain('Nic dalšího se neodešle');
  });
});

test.describe('Přepínač automatiky — co se nemění', () => {
  test('11+12) přepínač nevytváří ani neaktivuje žádnou dávku', () => {
    expect(toggleFn).not.toContain('batch_activate');
    expect(toggleFn).not.toContain('batch_create');
    expect(toggleFn).not.toContain('prepare_paused');
    expect(toggleFn).not.toMatch(/insert|update\(/i);
  });

  test('8+9+10) přepínač nesahá na worker, denní limit ani ruční odesílání', () => {
    expect(toggleFn).not.toContain('claim_next');
    expect(toggleFn).not.toContain('daily_limit');
    expect(toggleFn).not.toContain('send-sales-lead-email');
    expect(toggleFn).not.toContain('functions.invoke');
  });

  test('změna je čistě frontendová — žádná nová migrace není potřeba', () => {
    // RPC i RLS pro čtení stavu už existují; tento spec hlídá, že se na ně jen napojujeme.
    expect(sheet).toContain("rpc('sales_lead_email_automation_set_enabled'");
    expect(sheet).toContain("from('sales_lead_email_automation_settings')");
  });
});
