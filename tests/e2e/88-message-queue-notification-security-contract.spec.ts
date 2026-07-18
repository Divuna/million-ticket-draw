import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const migrationPath =
  'supabase/migrations/20260718190001_restrict_message_queue_notification_rpc_access.sql';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function listFiles(root: string): string[] {
  const absoluteRoot = resolve(process.cwd(), root);
  const result: string[] = [];

  for (const entry of readdirSync(absoluteRoot)) {
    const absolute = join(absoluteRoot, entry);
    const relative = absolute.slice(process.cwd().length + 1).replaceAll('\\', '/');
    const stats = statSync(absolute);

    if (
      stats.isDirectory()
      && !relative.startsWith('node_modules/')
      && !relative.startsWith('dist/')
      && !relative.startsWith('.git/')
      && !relative.startsWith('playwright-report/')
      && !relative.startsWith('test-results/')
    ) {
      result.push(...listFiles(relative));
    } else if (stats.isFile() && /\.(ts|tsx|js|mjs|cjs)$/.test(relative)) {
      result.push(relative);
    }
  }

  return result;
}

test.describe('message, notification and internal queue security contract', () => {
  test('event_queue can no longer be mutated directly by client roles', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('DROP POLICY IF EXISTS allow_insert_event_queue ON public.event_queue');
    expect(migration).toContain('DROP POLICY IF EXISTS allow_insert_event_queue_anon ON public.event_queue');
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_queue FROM anon');
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_queue FROM authenticated');
    expect(migration).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_queue TO service_role');
  });

  test('direct external-call and queue helper RPCs are service-role only', () => {
    const migration = read(migrationPath);
    const signatures = [
      'public.notify_sofinity_event(text, uuid, uuid, jsonb)',
      'public.forward_event_to_sofinity(jsonb)',
      'public._invoke_forward_messages_to_sofinity()',
      'public.safe_send_message(uuid, text, text)',
      'public.update_onesignal_id(uuid, text)',
      'public.create_guardian_message_for_user(uuid, text, uuid)',
      'public.create_guardian_message_for_user(uuid, uuid, text)',
      'public.create_guardian_notification_if_needed(uuid, uuid, uuid)',
      'public.check_guardian_notifications_batch()',
      'public.run_pipeline_alerts()',
      'public.test_sofinity_player_sync()',
      'public.proxy_post_to_onesignal(text, text, text, text, text)',
    ];

    for (const signature of signatures) {
      expect(migration).toContain(`ALTER FUNCTION ${signature} SET search_path TO public`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    }
  });

  test('message clients can insert only user-authored own messages and update only read state', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('DROP POLICY IF EXISTS messages_insert ON public.messages');
    expect(migration).toContain('CREATE POLICY messages_insert_user_own ON public.messages');
    expect(migration).toContain('auth.uid() = user_id');
    expect(migration).toContain("AND sender = 'user'");
    expect(migration).toContain('REVOKE UPDATE ON TABLE public.messages FROM authenticated');
    expect(migration).toContain('GRANT UPDATE (read) ON TABLE public.messages TO authenticated');
  });

  test('legitimate queue processors and frontend message paths remain routed through guarded flows', () => {
    const processQueue = read('supabase/functions/process_event_queue_worker/index.ts');
    const guardian = read('supabase/functions/check-guardian-notifications/index.ts');
    const pipeline = read('supabase/functions/pipeline-alert-runner/index.ts');
    const userMessages = read('src/hooks/useMessages.ts');
    const adminMessages = read('src/hooks/useAdminMessages.ts');

    expect(processQueue).toContain('INTERNAL_FUNCTION_TOKEN');
    expect(processQueue).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(processQueue).toContain('.from("event_queue")');
    expect(guardian).toContain('INTERNAL_FUNCTION_TOKEN');
    expect(guardian).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(guardian).toContain("rpc('check_guardian_notifications_batch')");
    expect(pipeline).toContain('INTERNAL_FUNCTION_TOKEN');
    expect(pipeline).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(pipeline).toContain('rpc("run_pipeline_alerts")');
    expect(userMessages).toContain('sender: "user"');
    expect(adminMessages).toContain('sender: "admin"');
  });

  test('frontend does not directly invoke locked legacy RPC helpers', () => {
    const lockedNames = [
      'notify_sofinity_event',
      'forward_event_to_sofinity',
      '_invoke_forward_messages_to_sofinity',
      'safe_send_message',
      'update_onesignal_id',
      'create_guardian_message_for_user',
      'create_guardian_notification_if_needed',
      'check_guardian_notifications_batch',
      'run_pipeline_alerts',
      'test_sofinity_player_sync',
      'proxy_post_to_onesignal',
    ];

    const offenders = listFiles('src')
      .filter((file) => {
        if (file === 'src/integrations/supabase/types.ts') return false;
        const content = read(file);
        return lockedNames.some((name) => content.includes(name));
      })
      .sort();

    expect(offenders).toEqual([]);
  });
});
