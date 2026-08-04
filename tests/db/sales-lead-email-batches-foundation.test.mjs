import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  renderSalesLeadEmailHtml,
  renderSalesLeadEmailText,
} from '../../supabase/functions/_shared/salesLeadEmailRendering.ts';

const migration = fs.readFileSync('supabase/migrations/20260804165418_sales_lead_email_batches_foundation.sql', 'utf8');
const db = new PGlite();
const manager = '10000000-0000-4000-8000-000000000001';
const outsider = '10000000-0000-4000-8000-000000000002';
const template = '20000000-0000-4000-8000-000000000001';
const lead = '30000000-0000-4000-8000-000000000001';

const baseline = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth; create schema extensions;
create function extensions.digest(value bytea, algorithm text) returns bytea language sql immutable as $$
  select decode(md5(encode(value,'hex')) || md5(algorithm || encode(value,'hex')),'hex') $$;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.admin_permissions(user_id uuid references auth.users(id),permission_key text,unique(user_id,permission_key));
create table public.user_roles(user_id uuid references auth.users(id),role text);
create function public.is_superadmin(check_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=check_user_id and role='superadmin') $$;
create function public.has_admin_permission(check_key text,check_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
  select public.is_superadmin(check_user_id) or exists(select 1 from public.admin_permissions
    where user_id=check_user_id and permission_key=check_key) $$;
create table public.sales_lead_email_templates(
  id uuid primary key,name text,template_type text,subject text,body text,is_active boolean default true,
  sort_order int default 0,created_by uuid references auth.users(id),updated_by uuid references auth.users(id),
  created_at timestamptz default now(),updated_at timestamptz default now());
create table public.sales_leads(
  id uuid primary key,company_name text,ico text,contact_person text,contact_role text,city text,website text,
  contact_email text,email_source text,email_verified_by_admin boolean default false,email_verification_method text,
  email_verified_at timestamptz,status text default 'novy',do_not_contact boolean default false,
  converted_partner_id uuid,created_by uuid references auth.users(id),created_at timestamptz default now(),updated_at timestamptz default now());
create table public.partners(id uuid primary key default gen_random_uuid(),ico text);
create table public.sales_lead_email_suppression(
  id uuid primary key default gen_random_uuid(),email_pattern text,reason text,created_by uuid,created_at timestamptz default now());
create table public.sales_lead_activities(
  id uuid primary key default gen_random_uuid(),lead_id uuid references public.sales_leads(id),activity_type text,
  direction text,metadata jsonb default '{}'::jsonb,created_at timestamptz default now());
create function public.sales_lead_email_send_guard(p_lead_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('success',exists(select 1 from public.sales_leads where id=p_lead_id)) $$;
revoke all on function public.sales_lead_email_send_guard(uuid) from public,anon,authenticated;
grant execute on function public.sales_lead_email_send_guard(uuid) to service_role;
`;

const value = async (sql, params = []) => {
  const { rows } = await db.query(sql, params);
  const result = Object.values(rows[0])[0];
  return typeof result === 'string' ? JSON.parse(result) : result;
};
const asUser = async (id) => {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
};
const asOwner = async () => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
};

test.before(async () => {
  await db.exec(baseline);
  await db.exec(migration);
  await db.query('insert into auth.users(id) values($1),($2)', [manager, outsider]);
});
test.after(async () => db.close());

test('migration is passive, empty, and disabled', async () => {
  const { rows } = await db.query(`select enabled,
    (select count(*)::int from public.sales_lead_email_batches) batches,
    (select count(*)::int from public.sales_lead_email_batch_items) items
    from public.sales_lead_email_automation_settings`);
  assert.deepEqual(rows[0], { enabled: false, batches: 0, items: 0 });
});

test('outsider cannot read, write, or create a batch', async () => {
  await asUser(outsider);
  assert.equal((await db.query('select count(*)::int n from public.sales_lead_email_automation_settings')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from public.sales_lead_email_batch_skips')).rows[0].n, 0);
  await assert.rejects(db.query(`insert into public.sales_lead_email_batches
    (template_name_snapshot,created_by,scheduled_date,idempotency_key)
    values('x',$1,current_date,'outsider-key')`, [outsider]), /permission denied|row-level security/i);
  const result = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date,$3)',
    [[lead], template, 'outsider-create-key']);
  assert.equal(result.error, 'access_denied');
  await asOwner();
});

test('manager gets atomic, frozen, idempotent enrollment and audited cancellation', async () => {
  await db.query('insert into public.admin_permissions values($1,$2)', [manager, 'sales_leads.manage']);
  await db.query(`insert into public.sales_lead_email_templates
    (id,name,template_type,subject,body,created_by,updated_by)
    values($1,'První','initial','Nabídka pro {{company_name}}',
    'Dobrý den **{{contact_person}}**.\n- [Web](https://onemil.cz) 🙂',$2,$2)`, [template, manager]);
  await db.query(`insert into public.sales_leads
    (id,company_name,contact_person,contact_email,email_source,email_verified_by_admin,
     email_verification_method,email_verified_at,status,created_by)
    values($1,'Firma Alfa','Pavel','ALFA@EXAMPLE.CZ','https://example.cz/kontakt',true,
    'backend_verified_official_website',now(),'novy',$2)`, [lead, manager]);
  await asUser(manager);
  const disabled = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+1,$3)',
    [[lead], template, 'batch-idempotency-1']);
  assert.equal(disabled.error, 'automation_disabled');
  await asOwner();
  await db.exec('update public.sales_lead_email_automation_settings set enabled=true where singleton');
  await asUser(manager);
  const created = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+1,$3)',
    [[lead, lead], template, 'batch-idempotency-1']);
  assert.equal(created.scheduled_count, 1);
  const replay = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+1,$3)',
    [[lead], template, 'batch-idempotency-1']);
  assert.equal(replay.idempotent_replay, true);
  assert.equal(replay.batch_id, created.batch_id);
  const conflict = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+2,$3)',
    [[lead], template, 'batch-idempotency-1']);
  assert.equal(conflict.error, 'idempotency_key_conflict');
  const snapshot = (await db.query(`select recipient_snapshot,subject_snapshot,body_html_snapshot,company_name_snapshot
    from public.sales_lead_email_batch_items where batch_id=$1`, [created.batch_id])).rows[0];
  assert.equal(snapshot.recipient_snapshot, 'alfa@example.cz');
  assert.equal(snapshot.subject_snapshot, 'Nabídka pro Firma Alfa');
  assert.match(snapshot.body_html_snapshot, /<strong>Pavel<\/strong>/);
  assert.match(snapshot.body_html_snapshot, /noopener noreferrer nofollow/);
  await asOwner();
  await db.query("update public.sales_leads set company_name='Změněno',contact_email='new@example.cz' where id=$1", [lead]);
  await db.query("update public.sales_lead_email_templates set subject='Změněno' where id=$1", [template]);
  const frozen = (await db.query(`select recipient_snapshot,subject_snapshot,company_name_snapshot
    from public.sales_lead_email_batch_items where batch_id=$1`, [created.batch_id])).rows[0];
  assert.deepEqual(frozen, {
    recipient_snapshot: 'alfa@example.cz', subject_snapshot: 'Nabídka pro Firma Alfa', company_name_snapshot: 'Firma Alfa',
  });
  await assert.rejects(
    db.query("update public.sales_lead_email_batch_items set subject_snapshot='Přepsáno' where batch_id=$1", [created.batch_id]),
    /sales_lead_email_batch_snapshot_immutable/,
  );
  await asUser(manager);
  const duplicate = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+1,$3)',
    [[lead], template, 'batch-idempotency-2']);
  assert.equal(duplicate.ineligible[0].reason, 'already_in_active_batch');
  await asOwner();
  await db.query(`insert into public.sales_leads
    (id,company_name,contact_person,contact_email,email_source,email_verified_by_admin,
     email_verification_method,email_verified_at,status,created_by)
    values('30000000-0000-4000-8000-000000000002','Firma Beta','Eva','ALFA@example.cz',
    'https://beta.example/kontakt',true,'admin_manual',now(),'novy',$1)`, [manager]);
  await asUser(manager);
  const duplicateRecipient = await value(
    'select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+1,$3)',
    [['30000000-0000-4000-8000-000000000002'], template, 'batch-idempotency-3'],
  );
  assert.equal(duplicateRecipient.ineligible[0].reason, 'already_in_active_batch');
  const cancelled = await value('select public.sales_lead_email_batch_cancel($1::uuid,$2)',
    [created.batch_id, 'Ruční zrušení testu']);
  assert.equal(cancelled.cancelled_count, 1);
  const audit = (await db.query('select status,cancelled_by,cancel_reason from public.sales_lead_email_batches where id=$1',
    [created.batch_id])).rows[0];
  assert.deepEqual(audit, { status: 'cancelled', cancelled_by: manager, cancel_reason: 'Ruční zrušení testu' });
});

test('eligibility reports suppression, verification, source, previous send, status, and template failures', async () => {
  await asOwner();
  await db.query("update public.sales_lead_email_templates set subject='Nabídka',is_active=true where id=$1", [template]);
  const cases = [
    ['30000000-0000-4000-8000-000000000010','dnc@example.cz',true,'admin_manual',true,'novy','https://x.cz'],
    ['30000000-0000-4000-8000-000000000011','unverified@example.cz',false,null,false,'novy','https://x.cz'],
    ['30000000-0000-4000-8000-000000000012','nosource@example.cz',true,'admin_manual',false,'novy',null],
    ['30000000-0000-4000-8000-000000000013','contacted@example.cz',true,'admin_manual',false,'osloveno','https://x.cz'],
    ['30000000-0000-4000-8000-000000000014','blocked@example.cz',true,'admin_manual',false,'novy','https://x.cz'],
  ];
  for (const [id,email,verified,method,dnc,status,source] of cases) await db.query(`insert into public.sales_leads
    (id,company_name,contact_email,email_source,email_verified_by_admin,email_verification_method,email_verified_at,
     status,do_not_contact,created_by) values($1,'Fixture',$2,$3,$4,$5,case when $4 then now() end,$6,$7,$8)`,
    [id,email,source,verified,method,status,dnc,manager]);
  const partnerLead = '30000000-0000-4000-8000-000000000015';
  await db.exec("insert into public.partners(ico) values('12345678')");
  await db.query(`insert into public.sales_leads
    (id,company_name,ico,contact_email,email_source,email_verified_by_admin,email_verification_method,
     email_verified_at,status,created_by) values($1,'Partner','12345678','partner@example.cz',
     'https://partner.example/kontakt',true,'admin_manual',now(),'novy',$2)`, [partnerLead,manager]);
  cases.push([partnerLead]);
  await db.exec("insert into public.sales_lead_email_suppression(email_pattern,reason) values('blocked@example.cz','test')");
  await asUser(manager);
  const preview = await value('select public.sales_lead_email_batch_preview($1::uuid[],$2::uuid,current_date+2)',
    [cases.map((row) => row[0]), template]);
  assert.deepEqual(new Set(preview.ineligible.map((item) => item.reason)), new Set([
    'do_not_contact','email_not_verified','email_source_missing','initial_email_status_not_allowed','suppressed','existing_partner',
  ]));
  await asOwner();
  await db.query("update public.sales_leads set company_name='Firma Alfa',contact_email='alfa@example.cz' where id=$1", [lead]);
  await db.query(`insert into public.sales_lead_activities(lead_id,activity_type,direction,metadata)
    values($1,'email_sent','outbound','{"sent_by":"human","to":"alfa@example.cz"}')`, [lead]);
  await asUser(manager);
  const sent = await value('select public.sales_lead_email_batch_preview($1::uuid[],$2::uuid,current_date+2)', [[lead], template]);
  assert.equal(sent.ineligible[0].reason, 'initial_email_already_sent');
  await asOwner();
  await db.query('update public.sales_lead_email_templates set is_active=false where id=$1', [template]);
  await asUser(manager);
  const inactive = await value('select public.sales_lead_email_batch_preview($1::uuid[],$2::uuid,current_date+2)', [[lead], template]);
  assert.equal(inactive.ineligible[0].reason, 'template_inactive');
});

test('daily capacity and partial unique indexes cap active enrollment', async () => {
  await asOwner();
  await db.query("update public.sales_lead_email_templates set is_active=true,subject='Nabídka',body='Dobrý den.' where id=$1", [template]);
  const ids = [];
  for (let n=100;n<121;n+=1) {
    const id=`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`; ids.push(id);
    await db.query(`insert into public.sales_leads(id,company_name,contact_email,email_source,email_verified_by_admin,
      email_verification_method,email_verified_at,status,created_by) values($1,$2,$3,$4,true,'admin_manual',now(),'novy',$5)`,
      [id,`Bulk ${n}`,`bulk-${n}@domain-${n}.cz`,`https://domain-${n}.cz/kontakt`,manager]);
  }
  await asUser(manager);
  const result = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+3,$3)',
    [ids,template,'batch-capacity-20']);
  assert.equal(result.scheduled_count,20);
  assert.equal(result.skipped_count,1);
  assert.equal(result.ineligible[0].reason,'daily_limit_exceeded');
  await asOwner();
  const skips = (await db.query(`select requested_lead_id,company_name_snapshot,reason
    from public.sales_lead_email_batch_skips where batch_id=$1`, [result.batch_id])).rows;
  assert.equal(skips.length, result.skipped_count);
  assert.deepEqual(skips[0], {
    requested_lead_id: ids[20], company_name_snapshot: 'Bulk 120', reason: 'daily_limit_exceeded',
  });
  await db.query(`update public.sales_lead_email_batch_items
    set status=case when lead_id=any($1::uuid[]) then 'sent' else 'failed' end,
        error_code=case when lead_id=any($1::uuid[]) then null else 'provider_outcome_unknown' end
    where batch_id=$2`, [ids.slice(0, 10), result.batch_id]);
  const extra = '30000000-0000-4000-8000-000000000121';
  await db.query(`insert into public.sales_leads(id,company_name,contact_email,email_source,email_verified_by_admin,
    email_verification_method,email_verified_at,status,created_by) values($1,'Bulk 121','bulk-121@domain-121.cz',
    'https://domain-121.cz/kontakt',true,'admin_manual',now(),'novy',$2)`, [extra, manager]);
  await asUser(manager);
  const preview = await value('select public.sales_lead_email_batch_preview($1::uuid[],$2::uuid,current_date+3)',
    [[extra], template]);
  assert.equal(preview.ineligible[0].reason, 'daily_limit_exceeded');
  const blocked = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+3,$3)',
    [[extra], template, 'batch-capacity-terminal']);
  assert.equal(blocked.error, 'no_eligible_leads');
  assert.equal(blocked.ineligible[0].reason, 'daily_limit_exceeded');

  for (const [id, status, key, offset] of [
    [ids[0], 'sent', 'batch-repeat-sent', 4],
    [ids[15], 'failed', 'batch-repeat-failed', 5],
  ]) {
    const repeated = await value(
      `select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+$4::integer,$3)`,
      [[id], template, key, offset],
    );
    assert.equal(repeated.error, 'no_eligible_leads');
    assert.equal(repeated.ineligible[0].reason, 'already_in_active_batch', status);
  }
});

test('cancellation is fail-closed and atomic while an item is processing', async () => {
  await asOwner();
  const ids = ['30000000-0000-4000-8000-000000000130','30000000-0000-4000-8000-000000000131'];
  for (const [index,id] of ids.entries()) await db.query(`insert into public.sales_leads(
    id,company_name,contact_email,email_source,email_verified_by_admin,email_verification_method,
    email_verified_at,status,created_by) values($1,$2,$3,$4,true,'admin_manual',now(),'novy',$5)`,
    [id,`Cancel ${index}`,`cancel-${index}@cancel-${index}.cz`,`https://cancel-${index}.cz/kontakt`,manager]);
  await asUser(manager);
  const created = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+6,$3)',
    [ids, template, 'batch-cancel-processing']);
  await asOwner();
  await db.query("update public.sales_lead_email_batch_items set status='processing' where batch_id=$1 and lead_id=$2",
    [created.batch_id, ids[0]]);
  await asUser(manager);
  const cancelled = await value('select public.sales_lead_email_batch_cancel($1::uuid,$2)',
    [created.batch_id, 'Pokus během zpracování']);
  assert.equal(cancelled.error, 'batch_processing');
  await asOwner();
  const batch = (await db.query('select status,cancelled_at,cancelled_by,cancel_reason from public.sales_lead_email_batches where id=$1',
    [created.batch_id])).rows[0];
  assert.deepEqual(batch, { status: 'scheduled', cancelled_at: null, cancelled_by: null, cancel_reason: null });
  const states = (await db.query('select status,count(*)::int count from public.sales_lead_email_batch_items where batch_id=$1 group by status order by status',
    [created.batch_id])).rows;
  assert.deepEqual(states, [{ status: 'pending', count: 1 }, { status: 'processing', count: 1 }]);
});

test('afternoon scheduling uses the remaining Prague window without past or catch-up slots', async () => {
  await asOwner();
  const window = await value(`select public.sales_lead_email_batch_schedule_window(
    date '2026-08-04','Europe/Prague',time '08:30',time '16:30',4,
    timestamptz '2026-08-04 12:00:00+00')`);
  assert.equal(window.success, true);
  const start = new Date(window.window_start);
  const end = new Date(window.window_end);
  const now = new Date('2026-08-04T12:00:00.000Z');
  assert.equal(start.toISOString(), '2026-08-04T12:05:00.000Z');
  assert.equal(end.toISOString(), '2026-08-04T14:30:00.000Z');
  const slots = Array.from({ length: 4 }, (_, index) =>
    new Date(start.getTime() + index * (end.getTime() - start.getTime()) / 4));
  assert.ok(slots.every((slot) => slot.getTime() >= now.getTime() + 5 * 60_000));
  assert.ok(slots.every((slot) => slot.getTime() < end.getTime()));
  assert.ok(slots.slice(1).every((slot, index) => slot.getTime() > slots[index].getTime()));
  const closed = await value(`select public.sales_lead_email_batch_schedule_window(
    date '2026-08-04','Europe/Prague',time '08:30',time '16:30',2,
    timestamptz '2026-08-04 14:24:00+00')`);
  assert.equal(closed.error, 'scheduling_window_closed');
});

test('database rendering exactly matches the shared TypeScript renderer', async () => {
  await asOwner();
  const inputs = [`Dobrý den **Alfa & <Beta>** 🙂

*Kurzíva* a [HTTPS **odkaz**](https://example.cz/a?x=1&y=2).
- první položka
• druhá *položka*
1. první krok
2) [Napište nám](mailto:b2b+test@onemil.cz)

Konec "nabídky".`, 'Řádek s CRLF\r\n\r\nPoslední\r\n', ''];
  for (const input of inputs) {
    const sqlText = (await db.query('select public.sales_lead_email_batch_render_text($1) rendered', [input])).rows[0].rendered;
    const sqlHtml = (await db.query('select public.sales_lead_email_batch_render_html($1) rendered', [input])).rows[0].rendered;
    assert.equal(sqlText, renderSalesLeadEmailText(input));
    assert.equal(sqlHtml, renderSalesLeadEmailHtml(input));
  }
});
