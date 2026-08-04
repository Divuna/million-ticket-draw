import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync('supabase/migrations/20260804165418_sales_lead_email_batches_foundation.sql', 'utf8');
const db = new PGlite();
const manager = '10000000-0000-4000-8000-000000000001';
const outsider = '10000000-0000-4000-8000-000000000002';
const template = '20000000-0000-4000-8000-000000000001';
const lead = '30000000-0000-4000-8000-000000000001';

const baseline = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
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
});
