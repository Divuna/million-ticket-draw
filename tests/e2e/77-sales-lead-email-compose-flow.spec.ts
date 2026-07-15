import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const detail = read('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx');
const panel = read('src/components/admin/sales-leads/LeadCrmPanel.tsx');

test.describe('Sales lead e-mail compose flow', () => {
  test('first e-mail opens a blank editor without requiring a template', () => {
    expect(detail).toContain('const openInitialEmailComposer = () => {');
    expect(detail).toContain("setDraftSubject('');");
    expect(detail).toContain("setDraftBody('');");
    expect(detail).toContain('setAiWorkspaceOpen(true);');
    expect(detail).toContain('onClick={openInitialEmailComposer}');
    expect(detail).toContain('Napsat e-mail');
    expect(detail).toContain('Otevřít prázdný editor');
  });

  test('first e-mail template is optional and only fills the existing editor', () => {
    expect(detail).toContain('Použít šablonu');
    expect(detail).toContain("onClick={() => setTemplatePickerType('initial')}");
    expect(detail).toContain('setDraftSubject(value.subject);');
    expect(detail).toContain('setDraftBody(value.body);');
    expect(detail).toContain("type={templatePickerType}");
  });

  test('follow-up opens a blank editor without requiring a template', () => {
    expect(panel).toContain('const openFollowUpComposer = () => {');
    expect(panel).toContain("setFuSubject('');");
    expect(panel).toContain("setFuBody('');");
    expect(panel).toContain('setFollowUpComposerOpen(true);');
    expect(panel).toContain('onClick={openFollowUpComposer}');
    expect(panel).toContain('Napsat follow-up');
    expect(panel).toContain('{followUpComposerOpen && (');
  });

  test('follow-up template is optional and fills the same editor', () => {
    expect(panel).toContain('Použít šablonu');
    expect(panel).toContain('onClick={() => setFollowUpPickerOpen(true)}');
    expect(panel).toContain('type="follow_up"');
    expect(panel).toContain('setFuSubject(value.subject);');
    expect(panel).toContain('setFuBody(value.body);');
  });

  test('reply-in-thread flow and sender contract remain unchanged', () => {
    expect(detail).toContain('const InlineReplyForm = ({');
    expect(detail).toContain('Odeslat odpověď');
    expect(detail).toContain("setTemplatePickerType('reply')");
    expect(detail).toContain("supabase.functions.invoke('send-sales-lead-reply'");
  });
});
