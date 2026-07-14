import { test,expect } from '@playwright/test';
import fs from 'node:fs';
const read=(p:string)=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20260711120000_sales_leads_crm_completion.sql');
test.describe('Sales leads CRM completion contracts',()=>{
 test('task and activity writes are permission guarded',()=>{expect(migration).toContain("has_admin_permission('sales_leads.manage'");expect(migration).toContain('ALTER TABLE public.sales_lead_tasks ENABLE ROW LEVEL SECURITY');expect(migration).toContain('REVOKE ALL ON public.sales_lead_tasks FROM PUBLIC,anon');});
 test('activities and completed tasks remain audited',()=>{expect(migration).toContain("'meeting_logged'");expect(migration).toContain("'task_completed'");expect(migration).toContain("'task_cancelled'");});
 test('follow-up keeps all hard guards and is human confirmed',()=>{const fn=read('supabase/functions/send-sales-lead-follow-up/index.ts');for(const value of ['email_verified_by_admin','do_not_contact','sales_lead_email_suppression','sales_lead_email_send_guard','reply_received',"['osloveno','follow_up']"])expect(fn).toContain(value);expect(fn).toContain("sent_by:'human_follow_up'");});
 test('configured inbound webhook verifies signature and stores supported failures',()=>{const fn=read('supabase/functions/sales-lead-inbound/index.ts');for(const value of ['svix-signature','email.bounced','email.failed','email.suppressed','email.delivery_delayed','email.delivered'])expect(fn).toContain(value);});
 test('public replyTo invariant is the trusted sales mailbox',()=>{expect(read('supabase/functions/send-sales-lead-reply/index.ts')).toContain('replyTo,');expect(read('supabase/functions/send-sales-lead-email/index.ts')).toContain('reply_to: REPLY_TO');});
 test('mark replies read invariant remains unchanged',()=>{const old=read('supabase/migrations/20260711100000_sales_leads_activity_read_state.sql');expect(old).not.toContain('UPDATE public.sales_leads');});
});
