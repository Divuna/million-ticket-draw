import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  renderSalesLeadEmailHtml,
  renderSalesLeadEmailText,
} from '../../supabase/functions/_shared/salesLeadEmailRendering.ts';

const migration = fs.readFileSync('supabase/migrations/20260804165418_sales_lead_email_batches_foundation.sql', 'utf8');
const adminPlanningMigration = fs.readFileSync('supabase/migrations/20260805160406_sales_lead_email_batch_admin_planning.sql', 'utf8');
const deliveryMigration = fs.readFileSync('supabase/migrations/20260805140658_sales_lead_initial_email_delivery.sql', 'utf8');
const workerMigration = fs.readFileSync('supabase/migrations/20260806090000_sales_lead_email_batch_worker.sql', 'utf8');
const db = new PGlite();
const manager = '10000000-0000-4000-8000-000000000001';
const outsider = '10000000-0000-4000-8000-000000000002';
const template = '20000000-0000-4000-8000-000000000001';
const lead = '30000000-0000-4000-8000-000000000001';

const baseline = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth; create schema extensions;
create schema cron;
create table cron.job(id bigint primary key, jobname text, command text);
create table public.email_queue(id uuid primary key default gen_random_uuid());
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
  direction text,subject text,body_snapshot text,email_message_id text,performed_by uuid references auth.users(id),
  metadata jsonb default '{}'::jsonb,created_at timestamptz default now());
create table public.sales_lead_status_history(
  id uuid primary key default gen_random_uuid(),lead_id uuid references public.sales_leads(id),old_status text,
  new_status text,changed_by uuid references auth.users(id),reason text,created_at timestamptz default now());
create table public.test_sales_lead_duplicate_guard_blocks(lead_id uuid primary key);
create function public.sales_lead_email_send_guard(p_lead_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select case
    when exists(select 1 from public.test_sales_lead_duplicate_guard_blocks where lead_id=p_lead_id)
      then jsonb_build_object('success',false,'error','duplicate_override_required')
    else jsonb_build_object('success',exists(select 1 from public.sales_leads where id=p_lead_id))
  end $$;
revoke all on function public.sales_lead_email_send_guard(uuid) from public,anon,authenticated;
grant execute on function public.sales_lead_email_send_guard(uuid) to service_role;
create function public.sales_lead_mark_emailed(p_lead_id uuid,p_performed_by uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare old_status text;
begin
  select status into old_status from public.sales_leads where id=p_lead_id for update;
  if old_status in ('novy','priprava','schvaleni_ceka') then
    update public.sales_leads set status='osloveno' where id=p_lead_id;
    insert into public.sales_lead_status_history(lead_id,old_status,new_status,changed_by,reason)
      values(p_lead_id,old_status,'osloveno',p_performed_by,'test');
    insert into public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
      values(p_lead_id,'status_changed','internal',p_performed_by,jsonb_build_object('from',old_status,'to','osloveno'));
    return jsonb_build_object('success',true,'status_changed',true,'new_status','osloveno');
  end if;
  if old_status in ('osloveno','follow_up','odpovedel','jednani','konvertovan') then
    return jsonb_build_object('success',true,'status_changed',false,'current_status',old_status);
  end if;
  return jsonb_build_object('success',false,'error','initial_email_status_not_allowed');
end $$;
revoke all on function public.sales_lead_mark_emailed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sales_lead_mark_emailed(uuid,uuid) to service_role;
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
  await db.exec(adminPlanningMigration);
  await db.exec(deliveryMigration);
  await db.exec(workerMigration);
  await db.query('insert into auth.users(id) values($1),($2)', [manager, outsider]);
});
test.after(async () => db.close());

test('migrations are passive, empty, disabled, and do not touch sending infrastructure', async () => {
  const { rows } = await db.query(`select enabled,
    (select count(*)::int from public.sales_lead_email_batches) batches,
    (select count(*)::int from public.sales_lead_email_batch_items) items,
    (select count(*)::int from public.sales_lead_activities where activity_type='email_sent') email_sent,
    (select count(*)::int from public.email_queue) email_queue,
    (select count(*)::int from cron.job) cron_jobs
    from public.sales_lead_email_automation_settings`);
  assert.deepEqual(rows[0], { enabled: false, batches: 0, items: 0, email_sent: 0, email_queue: 0, cron_jobs: 0 });
});

test('admin prepare-paused wrapper is authenticated-only and never anon', async () => {
  await asOwner();
  const signature = 'public.sales_lead_email_batch_prepare_paused(uuid[],uuid,date,text)';
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed', ['anon', signature, 'execute'])).rows[0].allowed, false);
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed', ['authenticated', signature, 'execute'])).rows[0].allowed, true);
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
    [[lead], template, 'batch-paused-idempotency-1']);
  assert.equal(disabled.success, true);
  assert.equal(disabled.batch_status, 'paused');
  assert.equal(disabled.automation_enabled, false);
  assert.equal(disabled.scheduled_count, 1);
  assert.equal(disabled.skipped_count, 0);
  assert.deepEqual(disabled.ineligible, []);
  const pausedReplay = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+1,$3)',
    [[lead], template, 'batch-paused-idempotency-1']);
  assert.equal(pausedReplay.idempotent_replay, true);
  assert.equal(pausedReplay.batch_id, disabled.batch_id);
  assert.equal(pausedReplay.batch_status, 'paused');
  assert.equal(pausedReplay.automation_enabled, false);
  const pausedState = (await db.query(`select b.status,array_agg(i.status order by i.id) item_states
    from public.sales_lead_email_batches b join public.sales_lead_email_batch_items i on i.batch_id=b.id
    where b.id=$1 group by b.status`, [disabled.batch_id])).rows[0];
  assert.deepEqual(pausedState, { status: 'paused', item_states: ['pending'] });
  const pausedConflict = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+2,$3)',
    [[lead], template, 'batch-paused-idempotency-1']);
  assert.equal(pausedConflict.error, 'idempotency_key_conflict');
  const pausedCancelled = await value('select public.sales_lead_email_batch_cancel($1::uuid,$2)',
    [disabled.batch_id, 'Uvolnění kapacity před scheduled testem']);
  assert.equal(pausedCancelled.cancelled_count, 1);
  await asOwner();
  await db.exec('update public.sales_lead_email_automation_settings set enabled=true where singleton');
  await asUser(manager);
  const created = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+1,$3)',
    [[lead, lead], template, 'batch-idempotency-1']);
  assert.equal(created.scheduled_count, 1);
  assert.equal(created.batch_status, 'scheduled');
  assert.equal(created.automation_enabled, true);
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

test('admin prepare-paused wrapper only ever stores a paused batch', async () => {
  await asOwner();
  await db.exec('update public.sales_lead_email_automation_settings set enabled=false where singleton');
  const ids = ['34000000-0000-4000-8000-000000000001', '34000000-0000-4000-8000-000000000002'];
  for (const [index, id] of ids.entries()) {
    await db.query(`insert into public.sales_leads
      (id,company_name,contact_person,contact_email,email_source,email_verified_by_admin,email_verification_method,
       email_verified_at,status,created_by)
      values($1,$2,'Pavel',$3,$4,true,'admin_manual',now(),'novy',$5)`,
    [id, `Wrapper ${index + 1}`, `wrapper-${index + 1}@example.cz`, `https://example.cz/wrapper-${index + 1}`, manager]);
  }
  const call = (leadIds, key, offset) => value(
    'select public.sales_lead_email_batch_prepare_paused($1::uuid[],$2::uuid,current_date+$4::integer,$3)',
    [leadIds, template, key, offset],
  );

  await asUser(outsider);
  assert.equal((await call([ids[0]], 'wrapper-outsider-key', 20)).error, 'access_denied');

  await asUser(manager);
  const prepared = await call([ids[0]], 'wrapper-paused-key', 20);
  assert.equal(prepared.success, true);
  assert.equal(prepared.batch_status, 'paused');
  assert.equal(prepared.automation_enabled, false);
  assert.equal(prepared.scheduled_count, 1);
  const stored = (await db.query(`select b.status,array_agg(i.status order by i.id) item_states
    from public.sales_lead_email_batches b join public.sales_lead_email_batch_items i on i.batch_id=b.id
    where b.id=$1 group by b.status`, [prepared.batch_id])).rows[0];
  assert.deepEqual(stored, { status: 'paused', item_states: ['pending'] });

  const replay = await call([ids[0]], 'wrapper-paused-key', 20);
  assert.equal(replay.batch_id, prepared.batch_id);
  assert.equal(replay.batch_status, 'paused');
  assert.equal(replay.idempotent_replay, true);
  assert.equal((await db.query(`select count(*)::int n from public.sales_lead_email_batches
    where idempotency_key='wrapper-paused-key'`)).rows[0].n, 1);
  assert.equal((await call([ids[1]], 'wrapper-paused-key', 21)).error, 'idempotency_key_conflict');

  await asOwner();
  const before = (await db.query(`select
    (select count(*)::int from public.sales_lead_email_batches) batches,
    (select count(*)::int from public.sales_lead_email_batch_items) items,
    (select count(*)::int from public.sales_lead_email_batch_skips) skips`)).rows[0];
  await db.exec('update public.sales_lead_email_automation_settings set enabled=true where singleton');
  await asUser(manager);
  const blocked = await call([ids[1]], 'wrapper-enabled-key', 22);
  assert.equal(blocked.success, false);
  assert.equal(blocked.error, 'automation_must_be_disabled');
  await asOwner();
  assert.deepEqual((await db.query(`select
    (select count(*)::int from public.sales_lead_email_batches) batches,
    (select count(*)::int from public.sales_lead_email_batch_items) items,
    (select count(*)::int from public.sales_lead_email_batch_skips) skips`)).rows[0], before);
  assert.equal((await db.query(`select count(*)::int n from public.sales_lead_email_batches
    where idempotency_key='wrapper-enabled-key'`)).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int n from public.sales_lead_email_batches
    where status='scheduled' and created_by=$1 and scheduled_date>=current_date+20`, [manager])).rows[0].n, 0);

  await db.exec('update public.sales_lead_email_automation_settings set enabled=false where singleton');
  await asUser(manager);
  const cancelled = await value('select public.sales_lead_email_batch_cancel($1::uuid,$2)',
    [prepared.batch_id, 'Úklid po testu bezpečného wrapperu']);
  assert.equal(cancelled.cancelled_count, 1);
  await asOwner();
});

test('paused batches consume daily capacity and cancellation releases it', async () => {
  await asOwner();
  await db.exec('update public.sales_lead_email_automation_settings set enabled=false where singleton');
  const ids = Array.from({ length: 21 }, (_, index) => `31000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
  for (const [index, id] of ids.entries()) {
    await db.query(`insert into public.sales_leads
      (id,company_name,contact_person,contact_email,email_source,email_verified_by_admin,email_verification_method,
       email_verified_at,status,created_by)
      values($1,$2,'Pavel',$3,$4,true,'admin_manual',now(),'novy',$5)`,
    [id, `Paused ${index + 1}`, `paused-${index + 1}@example.cz`, `https://example.cz/paused-${index + 1}`, manager]);
  }
  await asUser(manager);
  const created = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+10,$3)',
    [ids.slice(0, 20), template, 'paused-capacity-20']);
  assert.equal(created.batch_status, 'paused');
  assert.equal(created.scheduled_count, 20);
  const blockedPreview = await value('select public.sales_lead_email_batch_preview($1::uuid[],$2::uuid,current_date+10)',
    [[ids[20]], template]);
  assert.equal(blockedPreview.ineligible[0].reason, 'daily_limit_exceeded');
  const cancelled = await value('select public.sales_lead_email_batch_cancel($1::uuid,$2)',
    [created.batch_id, 'Test uvolnění denní kapacity']);
  assert.equal(cancelled.cancelled_count, 20);
  const afterCancel = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+10,$3)',
    [[ids[20]], template, 'paused-capacity-after-cancel']);
  assert.equal(afterCancel.batch_status, 'paused');
  assert.equal(afterCancel.scheduled_count, 1);
});

test('same concurrent idempotent request creates one paused batch', async () => {
  await asOwner();
  await db.exec('update public.sales_lead_email_automation_settings set enabled=false where singleton');
  const concurrentLead = '32000000-0000-4000-8000-000000000001';
  await db.query(`insert into public.sales_leads
    (id,company_name,contact_person,contact_email,email_source,email_verified_by_admin,email_verification_method,
     email_verified_at,status,created_by)
    values($1,'Concurrent','Pavel','concurrent@example.cz','https://example.cz/concurrent',true,
    'admin_manual',now(),'novy',$2)`, [concurrentLead, manager]);
  await asUser(manager);
  const call = () => value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+11,$3)',
    [[concurrentLead], template, 'same-concurrent-paused-key']);
  const [first, second] = await Promise.all([call(), call()]);
  assert.equal(first.batch_id, second.batch_id);
  assert.equal([first.idempotent_replay, second.idempotent_replay].filter(Boolean).length, 1);
  assert.equal((await db.query(`select count(*)::int n from public.sales_lead_email_batches
    where idempotency_key='same-concurrent-paused-key'`)).rows[0].n, 1);
});

test('preview writes nothing and create rechecks changes made after preview', async () => {
  await asOwner();
  await db.exec('update public.sales_lead_email_automation_settings set enabled=false where singleton');
  const ids = Array.from({ length: 4 }, (_, index) => `33000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
  for (const [index, id] of ids.entries()) {
    await db.query(`insert into public.sales_leads
      (id,company_name,contact_person,contact_email,email_source,email_verified_by_admin,email_verification_method,
       email_verified_at,status,created_by)
      values($1,$2,'Pavel',$3,$4,true,'admin_manual',now(),'novy',$5)`,
    [id, `Recheck ${index + 1}`, `recheck-${index + 1}@example.cz`, `https://example.cz/recheck-${index + 1}`, manager]);
  }
  const before = (await db.query(`select
    (select count(*)::int from public.sales_lead_email_batches) batches,
    (select count(*)::int from public.sales_lead_email_batch_items) items,
    (select count(*)::int from public.sales_lead_email_batch_skips) skips`)).rows[0];
  await asUser(manager);
  const preview = await value('select public.sales_lead_email_batch_preview($1::uuid[],$2::uuid,current_date+12)',
    [ids, template]);
  assert.equal(preview.eligible_count, 4);
  const afterPreview = (await db.query(`select
    (select count(*)::int from public.sales_lead_email_batches) batches,
    (select count(*)::int from public.sales_lead_email_batch_items) items,
    (select count(*)::int from public.sales_lead_email_batch_skips) skips`)).rows[0];
  assert.deepEqual(afterPreview, before);
  await asOwner();
  await db.query('update public.sales_leads set do_not_contact=true where id=$1', [ids[0]]);
  await db.query(`insert into public.sales_lead_email_suppression(email_pattern,reason)
    values('recheck-2@example.cz','created after preview')`);
  await db.query(`update public.sales_leads set contact_email='changed-after-preview@example.cz',
    email_verified_by_admin=false,email_verified_at=null where id=$1`, [ids[2]]);
  await db.query(`insert into public.sales_lead_activities(lead_id,activity_type,direction,metadata)
    values($1,'email_sent','outbound','{"sent_by":"human","to":"recheck-4@example.cz"}')`, [ids[3]]);
  await asUser(manager);
  const created = await value('select public.sales_lead_email_batch_create($1::uuid[],$2::uuid,current_date+12,$3)',
    [ids, template, 'recheck-after-preview-key']);
  assert.equal(created.error, 'no_eligible_leads');
  assert.deepEqual(new Set(created.ineligible.map((item) => item.reason)), new Set([
    'do_not_contact', 'suppressed', 'email_not_verified', 'initial_email_already_sent',
  ]));
  assert.equal((await db.query(`select count(*)::int n from public.sales_lead_email_batches
    where idempotency_key='recheck-after-preview-key'`)).rows[0].n, 0);
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
  await db.exec('update public.sales_lead_email_automation_settings set enabled=true where singleton');
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

test('delivery migration is passive and internal RPC grants are service-role only', async () => {
  await asOwner();
  assert.equal((await db.query('select count(*)::int n from public.sales_lead_email_deliveries')).rows[0].n, 0);
  const signature = `public.sales_lead_initial_email_commit(uuid)`;
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed', [role, signature, 'execute'])).rows[0].allowed, false);
  }
  assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed', ['service_role', signature, 'execute'])).rows[0].allowed, true);
});

test('claim, provider acceptance, and commit create one delivery, email activity, and forward-only status change', async () => {
  await asOwner();
  const deliveryLead = '30000000-0000-4000-8000-000000000201';
  await db.query(`insert into public.sales_leads(id,company_name,contact_email,email_source,email_verified_by_admin,
    email_verification_method,email_verified_at,status,created_by) values($1,'Delivery','delivery@example.cz',
    'https://example.cz/kontakt',true,'admin_manual',now(),'novy',$2)`, [deliveryLead, manager]);
  const args = ['a'.repeat(64), 'b'.repeat(64), deliveryLead, 'manual_initial', null, 'delivery@example.cz',
    'NabĂ­dka', 'DobrĂ˝ den.', 'DobrĂ˝ den.', '<p>DobrĂ˝ den.</p>', [], manager,
    '40000000-0000-4000-8000-000000000201'];
  const claim = await value(`select public.sales_lead_initial_email_claim(
    $1,$2,$3::uuid,$4,$5::uuid,$6,$7,$8,$9,$10,$11::jsonb,$12::uuid,$13::uuid)`, args);
  assert.equal(claim.action, 'call_provider');
  const accepted = await value(`select public.sales_lead_initial_email_record_provider_result($1::uuid,'accepted','resend-db-1',null)`, [claim.delivery_id]);
  assert.equal(accepted.success, true);
  const committed = await value('select public.sales_lead_initial_email_commit($1::uuid)', [claim.delivery_id]);
  assert.equal(committed.success, true);
  const replay = await value('select public.sales_lead_initial_email_commit($1::uuid)', [claim.delivery_id]);
  assert.equal(replay.already_committed, true);
  assert.equal((await db.query(`select count(*)::int n from public.sales_lead_activities
    where email_delivery_id=$1 and activity_type='email_sent'`, [claim.delivery_id])).rows[0].n, 1);
  assert.equal((await db.query('select status from public.sales_leads where id=$1', [deliveryLead])).rows[0].status, 'osloveno');
  assert.equal((await db.query(`select count(*)::int n from public.sales_lead_status_history
    where lead_id=$1 and new_status='osloveno'`, [deliveryLead])).rows[0].n, 1);
});

test('uncertain outcome blocks replay while explicit rejection leaves no sent history', async () => {
  await asOwner();
  for (const [suffix, email] of [['202','uncertain@example.cz'], ['203','rejected@example.cz']]) {
    await db.query(`insert into public.sales_leads(id,company_name,contact_email,email_source,email_verified_by_admin,
      email_verification_method,email_verified_at,status,created_by) values($1,'Outcome',$2,'https://example.cz/kontakt',
      true,'admin_manual',now(),'novy',$3)`, [`30000000-0000-4000-8000-000000000${suffix}`, email, manager]);
  }
  const claimFor = async (suffix, key, email) => value(`select public.sales_lead_initial_email_claim(
    $1,$2,$3::uuid,'manual_initial',null,$4,'NabĂ­dka','Text','Text','<p>Text</p>','[]'::jsonb,$5::uuid,$6::uuid)`,
    [key.repeat(64), 'd'.repeat(64), `30000000-0000-4000-8000-000000000${suffix}`, email, manager,
      `40000000-0000-4000-8000-000000000${suffix}`]);
  const uncertain = await claimFor('202', 'c', 'uncertain@example.cz');
  await value(`select public.sales_lead_initial_email_record_provider_result($1::uuid,'uncertain',null,'timeout')`, [uncertain.delivery_id]);
  const blocked = await claimFor('202', 'c', 'uncertain@example.cz');
  assert.equal(blocked.error, 'email_delivery_outcome_uncertain');
  const rejected = await claimFor('203', 'e', 'rejected@example.cz');
  await value(`select public.sales_lead_initial_email_record_provider_result($1::uuid,'rejected',null,'validation_error')`, [rejected.delivery_id]);
  assert.equal((await db.query(`select count(*)::int n from public.sales_lead_activities where lead_id=$1 and activity_type='email_sent'`,
    ['30000000-0000-4000-8000-000000000203'])).rows[0].n, 0);
  assert.equal((await db.query('select status from public.sales_leads where id=$1', ['30000000-0000-4000-8000-000000000203'])).rows[0].status, 'novy');
});

const initialDeliveryFixture = async (suffix) => {
  const padded = String(suffix).padStart(3, '0');
  const leadId = `30000000-0000-4000-8000-000000000${padded}`;
  const captureId = `40000000-0000-4000-8000-000000000${padded}`;
  const email = `retry-${padded}@retry-${padded}.example.cz`;
  const deliveryKey = Number(suffix).toString(16).padStart(64, '0');
  const fingerprint = (Number(suffix) + 4096).toString(16).padStart(64, '0');
  await db.query(`insert into public.sales_leads(id,company_name,contact_email,email_source,email_verified_by_admin,
    email_verification_method,email_verified_at,status,created_by) values($1,$2,$3,'https://example.cz/kontakt',
    true,'admin_manual',now(),'novy',$4)`, [leadId, `Retry ${padded}`, email, manager]);
  const claim = async ({ subject = 'Nabídka', body = 'Text' } = {}) => value(`select public.sales_lead_initial_email_claim(
    $1,$2,$3::uuid,'manual_initial',null,$4,$5,$6,$6,$7,'[]'::jsonb,$8::uuid,$9::uuid)`,
    [deliveryKey, fingerprint, leadId, email, subject, body, `<p>${body}</p>`, manager, captureId]);
  const first = await claim();
  assert.equal(first.action, 'call_provider');
  return { leadId, email, deliveryId: first.delivery_id, claim };
};

const rejectedDeliveryFixture = async (suffix) => {
  const fixture = await initialDeliveryFixture(suffix);
  await value(`select public.sales_lead_initial_email_record_provider_result($1::uuid,'rejected',null,'validation_error')`,
    [fixture.deliveryId]);
  return fixture;
};

const assertRejectedRetryBlocked = async (fixture, expectedError, claimOptions) => {
  const retry = await fixture.claim(claimOptions);
  assert.equal(retry.action, undefined);
  assert.equal(retry.error, expectedError);
  const delivery = (await db.query(`select status,attempt_count,last_error_code
    from public.sales_lead_email_deliveries where id=$1`, [fixture.deliveryId])).rows[0];
  assert.deepEqual(delivery, { status: 'provider_rejected', attempt_count: 1, last_error_code: 'validation_error' });
};

test('provider rejection retry rechecks do_not_contact before another provider call', async () => {
  await asOwner();
  const fixture = await rejectedDeliveryFixture(301);
  await db.query('update public.sales_leads set do_not_contact=true where id=$1', [fixture.leadId]);
  await assertRejectedRetryBlocked(fixture, 'do_not_contact');
});

test('provider rejection retry rechecks exact-email suppression before another provider call', async () => {
  await asOwner();
  const fixture = await rejectedDeliveryFixture(302);
  await db.query('insert into public.sales_lead_email_suppression(email_pattern,reason) values($1,$2)', [fixture.email, 'test']);
  await assertRejectedRetryBlocked(fixture, 'suppressed');
});

test('provider rejection retry rechecks domain suppression before another provider call', async () => {
  await asOwner();
  const fixture = await rejectedDeliveryFixture(303);
  await db.query('insert into public.sales_lead_email_suppression(email_pattern,reason) values($1,$2)',
    [`@${fixture.email.split('@')[1]}`, 'test']);
  await assertRejectedRetryBlocked(fixture, 'suppressed');
});

test('provider rejection retry rechecks current lead status before another provider call', async () => {
  await asOwner();
  const fixture = await rejectedDeliveryFixture(304);
  await db.query("update public.sales_leads set status='archiv' where id=$1", [fixture.leadId]);
  await assertRejectedRetryBlocked(fixture, 'initial_email_status_not_allowed');
});

test('provider rejection retry rejects a changed current contact before another provider call', async () => {
  await asOwner();
  const fixture = await rejectedDeliveryFixture(305);
  await db.query("update public.sales_leads set contact_email='changed@example.cz' where id=$1", [fixture.leadId]);
  await assertRejectedRetryBlocked(fixture, 'missing_contact_email');
});

test('provider rejection retry rejects revoked contact verification before another provider call', async () => {
  await asOwner();
  const fixture = await rejectedDeliveryFixture(306);
  await db.query('update public.sales_leads set email_verified_by_admin=false where id=$1', [fixture.leadId]);
  await assertRejectedRetryBlocked(fixture, 'missing_contact_email');
});

test('provider rejection retry rechecks newly recorded initial email before another provider call', async () => {
  await asOwner();
  const fixture = await rejectedDeliveryFixture(307);
  await db.query(`insert into public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
    values($1,'email_sent','outbound',$2,'{"sent_by":"human"}'::jsonb)`, [fixture.leadId, manager]);
  await assertRejectedRetryBlocked(fixture, 'initial_email_already_sent');
});

test('provider rejection retry rechecks duplicate guard before another provider call', async () => {
  await asOwner();
  const fixture = await rejectedDeliveryFixture(308);
  await db.query('insert into public.test_sales_lead_duplicate_guard_blocks(lead_id) values($1)', [fixture.leadId]);
  await assertRejectedRetryBlocked(fixture, 'duplicate_override_required');
});

test('ordinary provider rejection retries only after every current barrier passes', async () => {
  await asOwner();
  const fixture = await rejectedDeliveryFixture(309);
  const retry = await fixture.claim();
  assert.equal(retry.action, 'call_provider');
  assert.equal(retry.delivery_id, fixture.deliveryId);
  const delivery = (await db.query('select status,attempt_count,last_error_code from public.sales_lead_email_deliveries where id=$1',
    [fixture.deliveryId])).rows[0];
  assert.deepEqual(delivery, { status: 'sending', attempt_count: 2, last_error_code: null });
});

test('provider rejection retry rechecks unresolved content before another provider call', async () => {
  await asOwner();
  const fixture = await rejectedDeliveryFixture(312);
  await assertRejectedRetryBlocked(fixture, 'unresolved_template_variables', { subject: 'Nabídka pro {{firma}}' });
});

test('provider rejection retry rechecks another blocking delivery before another provider call', async () => {
  await asOwner();
  const fixture = await rejectedDeliveryFixture(313);
  await db.query(`insert into public.sales_lead_email_deliveries(
    delivery_key,request_fingerprint,lead_id,mode,status,recipient_snapshot,subject_snapshot,
    body_source_snapshot,body_text_snapshot,body_html_snapshot,performed_by,outbound_capture_id,attempt_count,last_error_code)
    values($1,$2,$3,'manual_initial','uncertain',$4,'Other','Other','Other','<p>Other</p>',$5,$6,1,'provider_outcome_unknown')`,
    ['f'.repeat(64), 'e'.repeat(64), fixture.leadId, fixture.email, manager, '40000000-0000-4000-8000-000000000999']);
  await assertRejectedRetryBlocked(fixture, 'initial_email_already_claimed');
});

for (const [suffix, providerCode, deliveryError] of [
  [310, 'invalid_idempotent_request', 'email_delivery_idempotency_conflict'],
  [311, 'concurrent_idempotent_requests', 'email_delivery_concurrent_idempotency_request'],
]) {
  test(`${providerCode} audit remains uncertain and blocks every later provider claim`, async () => {
    await asOwner();
    const fixture = await initialDeliveryFixture(suffix);
    await value(`select public.sales_lead_initial_email_record_provider_result($1::uuid,'uncertain',null,$2)`,
      [fixture.deliveryId, deliveryError]);
    const replay = await fixture.claim();
    assert.equal(replay.error, 'email_delivery_outcome_uncertain');
    assert.equal(replay.retry_blocked, true);
    const delivery = (await db.query('select status,attempt_count,last_error_code from public.sales_lead_email_deliveries where id=$1',
      [fixture.deliveryId])).rows[0];
    assert.deepEqual(delivery, { status: 'uncertain', attempt_count: 1, last_error_code: deliveryError });
  });
}

// ---------------------------------------------------------------------------
// PR 4 — internal batch worker
// ---------------------------------------------------------------------------

const workerBatchIds = [];

// A window that provably contains "now" in Europe/Prague, so due-item tests are
// deterministic regardless of when the suite runs.
const insertWorkerBatch = async ({ dayOffset = 0, status = 'scheduled' } = {}) => {
  const batchId = `60000000-0000-4000-8000-${String(workerBatchIds.length + 1).padStart(12, '0')}`;
  workerBatchIds.push(batchId);
  const windowSql = `case when prague_now < time '02:00' then time '00:01' else (prague_now - interval '2 hours')::time end,
       case when prague_now > time '22:00' then time '23:59' else (prague_now + interval '2 hours')::time end`;
  await db.query(`insert into public.sales_lead_email_batches(
      id,status,template_id,template_name_snapshot,created_by,scheduled_date,timezone,
      window_start,window_end,daily_limit,idempotency_key,request_fingerprint,scheduled_count,skipped_count)
    select $1,$2,$3,'Worker sablona',$4,
      ((now() at time zone 'Europe/Prague')::date + $5::integer),'Europe/Prague',${windowSql},
      20,$6,repeat('a',64),1,0
    from (select (now() at time zone 'Europe/Prague')::time as prague_now) t`,
  [batchId, status, template, manager, dayOffset, `worker-key-${batchId}`]);
  return batchId;
};

const insertWorkerItem = async (batchId, suffix, overrides = {}) => {
  const leadId = `61000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
  const itemId = `62000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
  const email = `worker-${suffix}@worker-${suffix}.example.cz`;
  await db.query(`insert into public.sales_leads(id,company_name,contact_person,contact_email,email_source,
      email_verified_by_admin,email_verification_method,email_verified_at,status,created_by)
    values($1,$2,'Pavel',$3,$4,true,'admin_manual',now(),'novy',$5)`,
  [leadId, `Worker ${suffix}`, email, `https://worker-${suffix}.example.cz/kontakt`, manager]);
  await db.query(`insert into public.sales_lead_email_batch_items(
      id,batch_id,lead_id,status,scheduled_for,recipient_snapshot,email_source_snapshot,
      email_verification_method_snapshot,email_verified_at_snapshot,subject_snapshot,
      body_source_snapshot,body_text_snapshot,body_html_snapshot,template_id_snapshot,
      template_updated_at_snapshot,company_name_snapshot)
    values($1,$2,$3,'pending',now() + ($9 || ' minutes')::interval,$4,$5,'admin_manual',now(),
      $6,'Dobry den.','Dobry den.','<p>Dobry den.</p>',$7,now(),$8)`,
  [itemId, batchId, leadId, email, `https://worker-${suffix}.example.cz/kontakt`,
    overrides.subject ?? `Nabidka ${suffix}`, template, `Worker ${suffix}`,
    String(overrides.dueInMinutes ?? -1)]);
  return { leadId, itemId, email };
};

const claimNext = () => value('select public.sales_lead_email_batch_claim_next()');
const setAutomation = async (enabled) => {
  await asOwner();
  await db.query('update public.sales_lead_email_automation_settings set enabled=$1 where singleton', [enabled]);
};
// Earlier suites leave prepared rows behind. Each worker case starts from an
// empty queue so exactly one item can be due.
const startWorkerCase = async (enabled = true) => {
  await asOwner();
  await db.query("update public.sales_lead_email_batch_items set status='cancelled' where status in ('pending','processing')");
  await setAutomation(enabled);
};
const itemRow = async (itemId) => (await db.query(
  'select status,skip_reason,error_code,attempt_count from public.sales_lead_email_batch_items where id=$1',
  [itemId])).rows[0];
const batchRow = async (batchId) => (await db.query(
  'select status from public.sales_lead_email_batches where id=$1', [batchId])).rows[0];

test('worker RPCs are service-role only and never reachable by API roles', async () => {
  await asOwner();
  for (const signature of [
    'public.sales_lead_email_batch_claim_next()',
    'public.sales_lead_email_batch_activate(uuid)',
    'public.sales_lead_email_batch_item_record_failure(uuid,text,text)',
    'public.sales_lead_email_batch_recalculate_status(uuid)',
    'public.sales_lead_initial_email_already_recorded(uuid,text,uuid)',
  ]) {
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed', [role, signature, 'execute'])).rows[0].allowed,
        false, `${role} ${signature}`);
    }
    assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed', ['service_role', signature, 'execute'])).rows[0].allowed,
      true, signature);
  }
});

test('disabled automation claims nothing and mutates nothing', async () => {
  await startWorkerCase(false);
  const batchId = await insertWorkerBatch();
  const { itemId } = await insertWorkerItem(batchId, 401);
  const claimed = await claimNext();
  assert.deepEqual(claimed, { success: true, action: 'noop', reason: 'automation_disabled' });
  assert.deepEqual(await itemRow(itemId), { status: 'pending', skip_reason: null, error_code: null, attempt_count: 0 });
  assert.equal((await db.query('select count(*)::int n from public.sales_lead_email_deliveries where batch_item_id is not null')).rows[0].n, 0);
});

test('a paused batch is never claimed even while automation is enabled', async () => {
  await startWorkerCase(true);
  const batchId = await insertWorkerBatch({ status: 'paused' });
  const { itemId } = await insertWorkerItem(batchId, 402);
  assert.equal((await claimNext()).action, 'noop');
  assert.equal((await itemRow(itemId)).status, 'pending');
  await asOwner();
  await db.query("update public.sales_lead_email_batch_items set status='cancelled' where batch_id in ($1,$2)",
    [batchId, workerBatchIds[0]]);
  await setAutomation(false);
});

test('a scheduled batch yields exactly one due item and concurrent workers never share it', async () => {
  await startWorkerCase(true);
  const batchId = await insertWorkerBatch();
  const first = await insertWorkerItem(batchId, 403);
  const second = await insertWorkerItem(batchId, 404);
  const claimed = await claimNext();
  assert.equal(claimed.action, 'send');
  assert.equal(claimed.subject, 'Nabidka 403');
  assert.equal(claimed.recipient, first.email);
  assert.equal(claimed.performed_by, manager);
  assert.deepEqual(await itemRow(first.itemId), { status: 'processing', skip_reason: null, error_code: null, attempt_count: 1 });

  const [a, b] = await Promise.all([claimNext(), claimNext()]);
  const claimedIds = [a, b].filter((row) => row.action === 'send').map((row) => row.batch_item_id);
  assert.deepEqual(claimedIds, [second.itemId]);
  assert.equal((await claimNext()).action, 'noop');
  await asOwner();
  await db.query("update public.sales_lead_email_batch_items set status='cancelled' where batch_id=$1", [batchId]);
  await setAutomation(false);
});

test('an item outside its working window is not due yet and nothing is sent', async () => {
  await startWorkerCase(true);
  const batchId = await insertWorkerBatch({ dayOffset: 1 });
  const { itemId } = await insertWorkerItem(batchId, 405, { dueInMinutes: 90 });
  assert.equal((await claimNext()).action, 'noop');
  assert.equal((await itemRow(itemId)).status, 'pending');
  await asOwner();
  await db.query("update public.sales_lead_email_batch_items set status='cancelled' where id=$1", [itemId]);
  await setAutomation(false);
});

test('an item from an older day is skipped as scheduled_window_missed and never caught up', async () => {
  await startWorkerCase(true);
  const batchId = await insertWorkerBatch({ dayOffset: -1 });
  const { itemId } = await insertWorkerItem(batchId, 406);
  const claimed = await claimNext();
  assert.equal(claimed.action, 'skipped');
  assert.equal(claimed.reason, 'scheduled_window_missed');
  assert.equal((await itemRow(itemId)).status, 'skipped');
  assert.equal((await batchRow(batchId)).status, 'completed');
  assert.equal((await claimNext()).action, 'noop');
  await setAutomation(false);
});

for (const [suffix, reason, mutate] of [
  [410, 'contact_email_changed', "update public.sales_leads set contact_email='changed-410@example.cz' where id=$1"],
  [411, 'do_not_contact', 'update public.sales_leads set do_not_contact=true where id=$1'],
  [412, 'email_not_verified', 'update public.sales_leads set email_verified_by_admin=false where id=$1'],
  [413, 'initial_email_status_not_allowed', "update public.sales_leads set status='archiv' where id=$1"],
]) {
  test(`${reason} after preparation skips the item without any provider work`, async () => {
    await startWorkerCase(true);
    const batchId = await insertWorkerBatch();
    const { itemId, leadId } = await insertWorkerItem(batchId, suffix);
    await asOwner();
    await db.query(mutate, [leadId]);
    const claimed = await claimNext();
    assert.equal(claimed.action, 'skipped');
    assert.equal(claimed.reason, reason);
    assert.deepEqual(await itemRow(itemId), { status: 'skipped', skip_reason: reason, error_code: null, attempt_count: 0 });
    assert.equal((await db.query('select count(*)::int n from public.sales_lead_email_deliveries where batch_item_id=$1', [itemId])).rows[0].n, 0);
    await setAutomation(false);
  });
}

test('suppression added after preparation skips the item', async () => {
  await startWorkerCase(true);
  const batchId = await insertWorkerBatch();
  const { itemId, email } = await insertWorkerItem(batchId, 414);
  await asOwner();
  await db.query('insert into public.sales_lead_email_suppression(email_pattern,reason) values($1,$2)', [email, 'test']);
  const claimed = await claimNext();
  assert.equal(claimed.reason, 'suppressed');
  assert.equal((await itemRow(itemId)).status, 'skipped');
  await setAutomation(false);
});

test('an initial e-mail recorded after preparation skips the item', async () => {
  await startWorkerCase(true);
  const batchId = await insertWorkerBatch();
  const { itemId, leadId } = await insertWorkerItem(batchId, 415);
  await asOwner();
  await db.query(`insert into public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
    values($1,'email_sent','outbound',$2,'{"sent_by":"human"}'::jsonb)`, [leadId, manager]);
  assert.equal((await claimNext()).reason, 'initial_email_already_sent');
  assert.equal((await itemRow(itemId)).status, 'skipped');
  await setAutomation(false);
});

test('a duplicate guard block after preparation skips the item', async () => {
  await startWorkerCase(true);
  const batchId = await insertWorkerBatch();
  const { itemId, leadId } = await insertWorkerItem(batchId, 416);
  await asOwner();
  await db.query('insert into public.test_sales_lead_duplicate_guard_blocks(lead_id) values($1)', [leadId]);
  assert.equal((await claimNext()).reason, 'duplicate_override_required');
  assert.equal((await itemRow(itemId)).status, 'skipped');
  await setAutomation(false);
});

const claimBatchDelivery = (claimed, overrides = {}) => value(
  `select public.sales_lead_initial_email_claim($1,$2,$3::uuid,'batch_initial',$4::uuid,$5,$6,$7,$7,$8,'[]'::jsonb,$9::uuid,$10::uuid)`,
  [
    overrides.deliveryKey ?? '1'.repeat(64),
    overrides.fingerprint ?? '2'.repeat(64),
    claimed.lead_id,
    overrides.batchItemId ?? claimed.batch_item_id,
    claimed.recipient,
    overrides.subject ?? claimed.subject,
    overrides.body ?? claimed.body_source,
    overrides.html ?? claimed.body_html,
    claimed.performed_by,
    overrides.captureId ?? '70000000-0000-4000-8000-000000000001',
  ],
);

test('a snapshot mismatch blocks the provider call for a claimed batch item', async () => {
  await startWorkerCase(true);
  const batchId = await insertWorkerBatch();
  const { itemId } = await insertWorkerItem(batchId, 420);
  const claimed = await claimNext();
  assert.equal(claimed.action, 'send');
  const mismatch = await claimBatchDelivery(claimed, { subject: 'Podvrzeny predmet' });
  assert.equal(mismatch.error, 'batch_snapshot_mismatch');
  assert.equal((await db.query('select count(*)::int n from public.sales_lead_email_deliveries where batch_item_id=$1', [itemId])).rows[0].n, 0);
  await asOwner();
  await db.query("update public.sales_lead_email_batch_items set status='cancelled' where id=$1", [itemId]);
  await setAutomation(false);
});

test('an accepted batch delivery commits once, marks the item sent, and completes the batch', async () => {
  await startWorkerCase(true);
  const batchId = await insertWorkerBatch();
  const { itemId, leadId } = await insertWorkerItem(batchId, 421);
  const claimed = await claimNext();
  const delivery = await claimBatchDelivery(claimed, { deliveryKey: '3'.repeat(64), fingerprint: '4'.repeat(64) });
  assert.equal(delivery.action, 'call_provider');
  assert.equal((await value(`select public.sales_lead_initial_email_record_provider_result($1::uuid,'accepted','resend-batch-1',null)`,
    [delivery.delivery_id])).success, true);
  const committed = await value('select public.sales_lead_initial_email_commit($1::uuid)', [delivery.delivery_id]);
  assert.equal(committed.success, true);
  assert.equal(committed.batch_status, 'completed');
  const replay = await value('select public.sales_lead_initial_email_commit($1::uuid)', [delivery.delivery_id]);
  assert.equal(replay.already_committed, true);

  const activities = (await db.query(`select metadata->>'sent_by' sent_by, metadata->>'delivery_mode' delivery_mode,
      metadata->>'batch_item_id' batch_item_id, email_delivery_id
    from public.sales_lead_activities where lead_id=$1 and activity_type='email_sent'`, [leadId])).rows;
  assert.equal(activities.length, 1);
  assert.equal(activities[0].sent_by, 'system');
  assert.equal(activities[0].delivery_mode, 'batch_initial');
  assert.equal(activities[0].batch_item_id, itemId);
  assert.equal(activities[0].email_delivery_id, delivery.delivery_id);
  assert.equal((await itemRow(itemId)).status, 'sent');
  assert.equal((await batchRow(batchId)).status, 'completed');
  assert.equal((await db.query('select status from public.sales_leads where id=$1', [leadId])).rows[0].status, 'osloveno');
  assert.equal((await db.query('select count(*)::int n from public.email_queue')).rows[0].n, 0);
  await setAutomation(false);
});

test('a failed batch attempt marks the item failed, keeps uncertain deliveries blocked, and fails the batch', async () => {
  await startWorkerCase(true);
  const batchId = await insertWorkerBatch();
  const { itemId } = await insertWorkerItem(batchId, 422);
  const claimed = await claimNext();
  const delivery = await claimBatchDelivery(claimed, { deliveryKey: '5'.repeat(64), fingerprint: '6'.repeat(64) });
  await value(`select public.sales_lead_initial_email_record_provider_result($1::uuid,'uncertain',null,'email_delivery_outcome_uncertain')`,
    [delivery.delivery_id]);
  const failure = await value(`select public.sales_lead_email_batch_item_record_failure($1::uuid,'uncertain','email_delivery_outcome_uncertain')`,
    [itemId]);
  assert.equal(failure.success, true);
  assert.equal(failure.batch_status, 'failed');
  assert.deepEqual(await itemRow(itemId), {
    status: 'failed', skip_reason: null, error_code: 'email_delivery_outcome_uncertain', attempt_count: 1,
  });
  assert.equal((await db.query('select status from public.sales_lead_email_deliveries where id=$1', [delivery.delivery_id])).rows[0].status, 'uncertain');
  const repeated = await value(`select public.sales_lead_email_batch_item_record_failure($1::uuid,'uncertain','x')`, [itemId]);
  assert.equal(repeated.error, 'batch_item_not_processing');
  assert.equal((await claimNext()).action, 'noop');
  await setAutomation(false);
});

test('an accepted provider call can never be recorded as a batch failure', async () => {
  await startWorkerCase(true);
  const batchId = await insertWorkerBatch();
  const { itemId } = await insertWorkerItem(batchId, 423);
  const claimed = await claimNext();
  const delivery = await claimBatchDelivery(claimed, { deliveryKey: '7'.repeat(64), fingerprint: '8'.repeat(64) });
  await value(`select public.sales_lead_initial_email_record_provider_result($1::uuid,'accepted','resend-batch-2',null)`,
    [delivery.delivery_id]);
  const blocked = await value(`select public.sales_lead_email_batch_item_record_failure($1::uuid,'uncertain','x')`, [itemId]);
  assert.equal(blocked.error, 'provider_accepted_commit_required');
  // The next run may only finish the commit; the provider is never called again.
  const resumed = await claimNext();
  assert.equal(resumed.action, 'commit_only');
  assert.equal(resumed.batch_item_id, itemId);
  assert.equal(resumed.delivery_id, delivery.delivery_id);
  await value('select public.sales_lead_initial_email_commit($1::uuid)', [delivery.delivery_id]);
  assert.equal((await itemRow(itemId)).status, 'sent');
  await setAutomation(false);
});

test('batch activation requires enabled automation, a paused batch, and a usable window', async () => {
  await startWorkerCase(false);
  const pausedId = await insertWorkerBatch({ status: 'paused' });
  await insertWorkerItem(pausedId, 430);
  assert.equal((await value('select public.sales_lead_email_batch_activate($1::uuid)', [pausedId])).error, 'automation_must_be_enabled');
  assert.equal((await batchRow(pausedId)).status, 'paused');

  await setAutomation(true);
  const expiredId = await insertWorkerBatch({ dayOffset: -2, status: 'paused' });
  await insertWorkerItem(expiredId, 431);
  assert.equal((await value('select public.sales_lead_email_batch_activate($1::uuid)', [expiredId])).error, 'scheduled_window_missed');
  assert.equal((await batchRow(expiredId)).status, 'paused');

  const activated = await value('select public.sales_lead_email_batch_activate($1::uuid)', [pausedId]);
  assert.equal(activated.success, true);
  assert.equal((await batchRow(pausedId)).status, 'scheduled');
  const snapshots = (await db.query(`select subject_snapshot,status
    from public.sales_lead_email_batch_items where batch_id=$1`, [pausedId])).rows[0];
  assert.equal(snapshots.subject_snapshot, 'Nabidka 430');
  assert.equal(snapshots.status, 'pending');
  assert.equal((await value('select public.sales_lead_email_batch_activate($1::uuid)', [pausedId])).error, 'batch_not_activatable');
  await asOwner();
  await db.query("update public.sales_lead_email_batch_items set status='cancelled' where batch_id in ($1,$2)", [pausedId, expiredId]);
  await setAutomation(false);
});

test('the worker migration adds no cron, no queue write, and no automatic lead selection', async () => {
  await asOwner();
  const executable = workerMigration.replace(/--.*$/gm, '');
  assert.ok(!/\bcron\./i.test(executable));
  assert.ok(!/pg_cron|pg_net|net\.http/i.test(executable));
  assert.ok(!/email_queue/i.test(executable));
  assert.ok(!/\bresend\b/i.test(executable));
  assert.ok(/UPDATE public\.sales_lead_email_automation_settings[\s\S]+SET enabled = false/.test(workerMigration));
  const state = (await db.query(`select enabled,
    (select count(*)::int from cron.job) cron_jobs,
    (select count(*)::int from public.email_queue) email_queue
    from public.sales_lead_email_automation_settings`)).rows[0];
  assert.deepEqual(state, { enabled: false, cron_jobs: 0, email_queue: 0 });
});
