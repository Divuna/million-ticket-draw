import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test.describe('98 — winner email queue contract', () => {
  const migration = fs.readFileSync(
    'supabase/migrations/20260723194828_enqueue_winner_emails.sql',
    'utf8',
  );
  const worker = fs.readFileSync(
    'supabase/functions/process-email-queue/index.ts',
    'utf8',
  );

  test('one new winner creates one pending email in the existing queue', () => {
    expect(migration).toContain('AFTER INSERT ON public.winners');
    expect(migration).toContain('INSERT INTO public.email_queue');
    expect(migration).toContain("'pending'");
    expect(migration).not.toContain('resend.com');
    expect(migration).not.toContain('net.http_post');
  });

  test('reprocessing the same winner cannot create a duplicate', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_dedupe_key');
    expect(migration).toContain("v_dedupe_key := concat('winner-email:', NEW.id)");
    expect(migration).toContain('ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL');
    expect(migration).toContain("WHERE public.email_queue.status = 'pending'");
  });

  test('an email queue failure cannot roll back the winner', () => {
    expect(migration).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(migration).toContain('A queue/schema/profile failure must never');
    expect(migration).toMatch(
      /RAISE LOG 'enqueue_winner_email failed \(winner_id=%\): %', NEW\.id, SQLERRM;\s+RETURN NEW;/,
    );
  });

  test('email contains the real contest, prize details, and safe wins link', () => {
    expect(migration).toContain('FROM public.contests c');
    expect(migration).toContain('LEFT JOIN public.bonus_prizes bp ON bp.id = w.prize_id');
    expect(migration).toContain('NULLIF(btrim(c.main_prize)');
    expect(migration).toContain('NULLIF(btrim(bp.title)');
    expect(migration).toContain('bp.amount');
    expect(migration).toContain('Výhra je dostupná v sekci <strong>Moje výhry</strong>.');
    expect(migration).toContain('https://onemil.cz/wins');
    expect(migration).toContain('winner_email_html_escape');
  });

  test('bonus wins are grouped for ten minutes before the worker can send', () => {
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toContain("v_dedupe_key := concat(\n      'winner-email:bonus:'");
    expect(migration).toContain('v_available_at := v_bucket_end');
    expect(migration).toContain("AND w.type = 'bonus'");
    expect(migration).toContain('string_agg(');
    expect(worker).toContain('.lte("available_at", new Date().toISOString())');
  });

  test('existing queue worker remains the only email sender', () => {
    expect(worker).toContain('.from("email_queue")');
    expect(worker).toContain('getResendClient().emails.send(emailOptions)');
    expect(migration).not.toContain('RESEND_API_KEY');
    expect(migration).not.toContain('emails.send');
  });
});
