import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const dialog = read('src/components/admin/sales-leads/SalesLeadEmailBatchDialog.tsx');
const migration = read('supabase/migrations/20260809170000_sales_lead_prepare_paused_when_automation_on.sql');

test.describe('Příprava dávky při zapnuté automatice', () => {
  test('1) frontend neblokuje přípravu podle automation_enabled', () => {
    expect(dialog).toContain('const canPrepare = Boolean(preview?.success) && eligibleCount > 0;');
    expect(dialog).not.toContain('automationSafelyDisabled');
    expect(dialog).not.toContain("salesLeadEmailBatchReasonMessage('automation_must_be_disabled')");
  });

  test('2) UI zobrazuje skutečný stav automatiky z preview', () => {
    expect(dialog).toContain("preview?.automation_enabled === true ? 'Automatické odesílání je zapnuté'");
    expect(dialog).toContain('Připravená dávka se i tak uloží jako pozastavená.');
  });

  test('3) frontend používá jen safe prepare_paused RPC', () => {
    expect(dialog).toContain("rpc('sales_lead_email_batch_prepare_paused'");
    expect(dialog).not.toContain("rpc('sales_lead_email_batch_create'");
  });

  test('4) klient uzná za úspěch pouze paused dávku', () => {
    expect(dialog).toContain("if (result.batch_status !== 'paused')");
    expect(dialog).toContain('Odesílání začne až po samostatném kliknutí na „Spustit dávku“.');
  });

  test('5) safe wrapper už nevyžaduje vypnutou automatiku', () => {
    expect(migration).not.toContain("error', 'automation_must_be_disabled'");
    expect(migration).toContain('WHERE singleton\n  FOR UPDATE;');
  });

  test('6) při automation on se scheduled řádek před commitem převede na paused', () => {
    expect(migration).toContain("IF v_batch_status = 'scheduled' THEN");
    expect(migration).toContain("SET status = 'paused'");
    expect(migration).toContain("WHERE id = v_batch_id AND status = 'scheduled'");
  });

  test('7) replay je povolen jen pro už paused dávku', () => {
    expect(migration).toContain("IF v_batch_status IS DISTINCT FROM 'paused' THEN");
    expect(migration).toContain('sales_lead_email_batch_prepare_paused_replay_not_paused');
  });

  test('8) přímý klientský batch_create je odebrán', () => {
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text)\n  FROM authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text)\n  TO service_role;');
  });

  test('9) změna sama neodesílá e-mail ani nezapíná automatiku', () => {
    const executable = migration
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .toLowerCase();
    expect(executable).not.toContain('resend');
    expect(executable).not.toContain('net.http');
    expect(executable).not.toContain('email_queue');
    expect(executable).not.toContain('set enabled = true');
  });
});
