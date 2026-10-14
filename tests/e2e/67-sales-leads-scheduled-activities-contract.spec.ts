import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const read=(p:string)=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20260711130000_sales_leads_scheduled_activities.sql');
const panel=read('src/components/admin/sales-leads/LeadCrmPanel.tsx');
const detail=read('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx');
const list=read('src/pages/AdminSalesLeads.tsx');
test.describe('scheduled sales activities',()=>{
 test('stores created and scheduled times separately and backfills old future records',()=>{expect(migration).toContain('scheduled_for timestamptz');expect(migration).toMatch(/SET scheduled_for = created_at[\s\S]*created_at > now\(\)/);expect(migration).toContain("created_at,scheduled_for,activity_status");});
 test('all writes are guarded and cancelled/completed records remain',()=>{expect(migration).toContain("has_admin_permission('sales_leads.manage'");expect(migration).toContain("p_status NOT IN ('dokonceno','zruseno')");expect(migration).not.toContain('DELETE FROM public.sales_lead_activities');});
 test('detail has distinct planned section with edit, complete and cancel',()=>{expect(panel).toContain('Naplánované aktivity');expect(panel).toContain('Upravit');expect(panel).toContain('Dokončit');expect(panel).toContain('Zrušit');expect(panel).toContain("timeZone:'Europe/Prague'");});
 test('future planned items are excluded from history while date remains visible for past items',()=>{expect(detail).toContain("a.activity_status === 'naplanovano'");expect(detail).toContain('Datum a čas:');expect(detail).toContain('a.scheduled_for ?? a.created_at');});
 test('main list shows nearest planned activity',()=>{expect(list).toContain('Nejbližší plán');expect(list).toContain('plannedActivities.find');});
 test('email and duplicate invariants remain untouched',()=>{expect(read('supabase/functions/send-sales-lead-reply/index.ts')).toContain('replyTo,');expect(read('supabase/functions/send-sales-lead-follow-up/index.ts')).toContain('sales_lead_email_send_guard');});
});
