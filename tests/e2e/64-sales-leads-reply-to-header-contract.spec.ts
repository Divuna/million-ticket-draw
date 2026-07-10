import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Kontraktní test (statická kontrola zdroje) — Reply-To hlavička u odchozích
 * e-mailů v modulu Obchod / Leady.
 *
 * Příčina opravovaného incidentu (lead ICONIC POINT): `send-sales-lead-reply`
 * běží na `resend@6.17.2`, kde `emails.send()` očekává `replyTo` (camelCase).
 * Původní kód předával `reply_to` (snake_case), které v6 SDK tiše ignoruje →
 * odchozí odpověď neměla Reply-To hlavičku → další odpověď zákazníka nešla na
 * `reply+<lead>@ulduuzoul.resend.app`, ale na `from` (b2b@onemil.cz) → Resend
 * inbound ji nikdy neviděl a `reply_received` nevznikla.
 *
 * Tento test hlídá, aby OBĚ odchozí cesty (první oslovení i každá odpověď)
 * nastavily per-lead Reply-To přes parametr správný pro svou verzi SDK.
 * Neposílá žádný e-mail — čte jen zdroj.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const initialSender = read('supabase/functions/send-sales-lead-email/index.ts');
const replySender = read('supabase/functions/send-sales-lead-reply/index.ts');
const inbound = read('supabase/functions/sales-lead-inbound/index.ts');

const REPLY_DOMAIN = 'ulduuzoul.resend.app';

test.describe('64 — sales leads Reply-To header contract', () => {
  test('reply sender pins resend v6 and passes replyTo (camelCase), never reply_to', () => {
    expect(replySender).toContain('npm:resend@6.17.2');
    // Per-lead Reply-To adresa se skládá z lead_id.
    expect(replySender).toContain(`reply+\${leadId}@${REPLY_DOMAIN}`);
    // v6 SDK: emails.send() čte `replyTo`. Musí být předán do send objektu.
    expect(replySender).toMatch(/emails\.send\(\{[\s\S]*replyTo[\s\S]*\}\)/);
    // Pojistka proti regresi: send objekt NESMÍ znovu použít snake_case reply_to,
    // které v6 ignoruje. (V metadatech aktivity `reply_to` být smí — to není
    // parametr Resendu.)
    expect(replySender).not.toMatch(/emails\.send\(\{[^}]*\breply_to:/);
  });

  test('reply sender records reply_to in the email_sent activity metadata', () => {
    expect(replySender).toMatch(/metadata:\s*\{[^}]*reply_to:\s*replyTo/);
  });

  test('initial sender (resend v2) sets the per-lead reply_to address', () => {
    expect(initialSender).toContain('npm:resend@2.0.0');
    expect(initialSender).toContain(REPLY_DOMAIN);
    // v2 SDK: parametr je snake_case `reply_to` — pro tuto verzi správně.
    expect(initialSender).toMatch(/reply_to:\s*replyTo/);
    // Reply-To se zaznamená i do metadat.
    expect(initialSender).toMatch(/metadata:\s*\{[^}]*reply_to:\s*replyTo/);
  });

  test('inbound saves reply_received regardless of lead status', () => {
    // Příchozí odpověď se ukládá bezpodmínečně — žádná kontrola stavu leadu
    // (`jednani`/`odpovedel`) nesmí insert `reply_received` blokovat.
    expect(inbound).toContain('activity_type: "reply_received"');
    // Posun stavu řeší RPC až po zápisu; inbound sám na stav nesahá jako podmínku
    // zápisu (nesmí existovat guard typu `if (lead.status ...) return` před insertem).
    expect(inbound).not.toMatch(/status[\s\S]{0,40}return[\s\S]{0,80}reply_received/);
  });
});
