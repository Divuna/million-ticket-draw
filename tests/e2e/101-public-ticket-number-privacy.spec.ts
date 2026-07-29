import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const INVARIANT =
  '„Číslo ani pořadí tiketu je přísně interní údaj. Nesmí se zobrazovat ve veřejném rozhraní, výsledcích, přehledu výherců, profilech, e-mailech, notifikacích ani veřejných API odpovědích. Veřejně lze zobrazit pouze výhru, výherce, soutěž a čas. Číslo tiketu smí být dostupné pouze interní administraci, auditu a backendové soutěžní logice.“';

function listTreeFiles(root: string, extensionPattern: RegExp): string[] {
  const absoluteRoot = resolve(process.cwd(), root);
  const result: string[] = [];

  for (const entry of readdirSync(absoluteRoot)) {
    const absolute = join(absoluteRoot, entry);
    const relative = absolute.slice(process.cwd().length + 1).replaceAll('\\', '/');
    const stats = statSync(absolute);

    if (stats.isDirectory()) {
      result.push(...listTreeFiles(relative, extensionPattern));
    } else if (extensionPattern.test(relative)) {
      result.push(relative);
    }
  }

  return result;
}

function listPublicSourceFiles(root: string): string[] {
  const absoluteRoot = resolve(process.cwd(), root);
  const result: string[] = [];

  for (const entry of readdirSync(absoluteRoot)) {
    const absolute = join(absoluteRoot, entry);
    const relative = absolute.slice(process.cwd().length + 1).replaceAll('\\', '/');
    const stats = statSync(absolute);

    if (stats.isDirectory()) {
      if (relative === 'src/components/admin' || relative === 'src/tests') continue;
      result.push(...listPublicSourceFiles(relative));
    } else if (/\.(ts|tsx)$/.test(relative)) {
      if (/\/[^/]*Admin[^/]*\.(ts|tsx)$/.test(relative) || relative.includes('/admin/')) continue;
      // This component is imported only by superadmin contest views.
      if (relative === 'src/components/TicketProgressBar.tsx') continue;
      result.push(relative);
    }
  }

  return result;
}

test.describe('101 — public ticket number privacy invariant', () => {
  test('permanent project sources contain the exact invariant', () => {
    expect(read('CLAUDE.md')).toContain(INVARIANT);
    expect(read('ONEMIL_BUSINESS_CONTEXT.md')).toContain(INVARIANT);
  });

  test('homepage and Winners page receive only prize, winner, contest, and time data', () => {
    const hook = read('src/hooks/useLatestWinners.ts');
    const card = read('src/components/WinnerCard.tsx');
    const homepage = read('src/pages/Homepage.tsx');
    const winners = read('src/pages/Winners.tsx');

    expect(hook).not.toContain('ticket_number');
    expect(card).not.toContain('ticketNumber');
    expect(card).not.toMatch(/#\s*\{/);
    expect(homepage).not.toContain('ticketNumber=');
    expect(winners).not.toContain('ticketNumber=');
  });

  test('My games, Wins, contest and bonus customer surfaces do not render ticket identifiers', () => {
    const sources = [
      'src/pages/MyContests.tsx',
      'src/pages/Wins.tsx',
      'src/pages/ContestDetail.tsx',
      'src/pages/MyContestDetail.tsx',
      'src/pages/BonusDetail.tsx',
      'src/components/BonusPrizeOverlay.tsx',
    ].map(read).join('\n');

    expect(sources).not.toMatch(/(?:Tiket|Ticket|Pozice tiketu)\s*:?\s*#\s*(?:\$\{|\{)/i);
    expect(read('src/pages/MyContests.tsx')).not.toMatch(/\bnumber,\s*\n/);
    expect(read('src/pages/MyContests.tsx')).toContain("rpc('get_my_tickets_public'");
    expect(read('src/pages/MyContestDetail.tsx')).toContain("rpc('get_my_tickets_public'");
    expect(read('src/pages/BonusDetail.tsx')).not.toContain('ticket_position');
    expect(read('src/pages/MyContestDetail.tsx')).not.toContain('ticket_position');
  });

  test('both result dialogs and share outputs omit ticket number and ordering', () => {
    const standard = read('src/components/TicketResultModal.tsx');
    const mystery = read('src/components/MysteryPurchaseResultDialog.tsx');
    const sharePage = read('src/pages/ShareTicket.tsx');
    const ogImage = read('supabase/functions/og-ticket-share/index.ts');
    const legacyImage = read('supabase/functions/generate-ticket-image/index.ts');
    const uploader = read('supabase/functions/upload-ticket-share/index.ts');

    expect(standard).not.toMatch(/tiket\s*#\s*\$\{/i);
    expect(standard).not.toMatch(/·\s*#\s*\$\{/);
    expect(standard).not.toContain('Další výherní ticket čeká už za');
    expect(standard).not.toContain('nearestPrizeDistance');
    expect(standard).toContain('const ticketShareId = crypto.randomUUID()');
    expect(standard).toContain("a.download = 'onemil-vyhra.png'");

    expect(mystery).not.toContain('mystery-result-next-win');
    expect(mystery).not.toContain('Další výherní tiket čeká už za');

    expect(sharePage).not.toContain('ticketNumber');
    expect(sharePage).not.toMatch(/Ticket #/);
    expect(sharePage).not.toContain('/storage/v1/object/public/ticket-shares/');
    expect(sharePage).toContain('/functions/v1/og-ticket-share?id=');
    expect(ogImage).not.toContain('ticketNumber');
    expect(ogImage).not.toMatch(/Ticket #/);
    expect(legacyImage).not.toContain('safeTicketNumber');
    expect(legacyImage).not.toMatch(/#\$\{/);
    expect(legacyImage).toContain('status: 410');
    expect(legacyImage).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(legacyImage).not.toContain('.storage');
    expect(uploader).toContain('status: 410');
    expect(uploader).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(uploader).not.toContain('.storage');
    expect(uploader).not.toContain('.upload(');
    expect(uploader).not.toContain('upsert');
    expect(standard).not.toContain('/functions/v1/upload-ticket-share');
    const closingMigration = read(
      'supabase/migrations/20260729065526_close_remaining_public_ticket_inference_paths.sql',
    );
    expect(closingMigration).toContain(
      'DROP POLICY IF EXISTS "Public can view ticket share images" ON storage.objects',
    );
    expect(closingMigration).toMatch(
      /INSERT INTO storage\.buckets[\s\S]*?'ticket-shares'[\s\S]*?false[\s\S]*?ON CONFLICT \(id\) DO UPDATE[\s\S]*?SET public = false/,
    );
  });

  test('public winner RPC has no ticket field and customer notifications are sanitized', () => {
    const migration = read('supabase/migrations/20260728103000_hide_public_ticket_numbers.sql');
    const purchaseEdge = read('supabase/functions/purchase-ticket/index.ts');
    const returnTable = migration.match(/RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE sql/)?.[1] ?? '';
    const winnerQuery = migration.match(/CREATE FUNCTION public\.get_latest_winners_public[\s\S]*?\$function\$;/)?.[0] ?? '';
    const notificationFunction = migration.match(/CREATE OR REPLACE FUNCTION public\.enqueue_notifications_from_event_logs[\s\S]*?\$function\$;/)?.[0] ?? '';

    expect(returnTable).not.toContain('ticket_number');
    expect(winnerQuery).not.toContain('public.tickets');
    expect(winnerQuery).not.toContain('t.number');
    expect(migration).toContain('DROP POLICY IF EXISTS tickets_select_own ON public.tickets');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_my_tickets_public');
    expect(migration).toContain('DROP POLICY IF EXISTS "Public can view bonus prizes"');
    expect(migration).toContain('CREATE OR REPLACE VIEW public.public_bonus_prizes AS');
    expect(migration.match(/CREATE OR REPLACE VIEW public\.public_bonus_prizes AS([\s\S]*?);/)?.[1])
      .not.toContain('ticket_position');
    expect(notificationFunction).not.toContain('ticket_number');
    expect(notificationFunction).not.toContain("v_meta->>'notes'");
    expect(notificationFunction).toContain('Výhru najdeš v sekci Moje výhry.');

    expect(migration).toContain("v_result\n    - 'ticket_number'\n    - 'next_bonus_position'");
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM authenticated',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM authenticated',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM PUBLIC',
    );
    expect(purchaseEdge).toContain('ticket_number: _ticketNumber');
    expect(purchaseEdge).toContain('JSON.stringify(publicData)');
  });

  test('historical winner notes use a sanitized customer contract and untouched superadmin path', () => {
    const migration = read(
      'supabase/migrations/20260728191209_sanitize_public_winner_notes_and_fix_purchase_edge.sql',
    );
    const wins = read('src/pages/Wins.tsx');
    const card = read('src/components/WinCard.tsx');
    const detail = read('src/components/WinDetailModal.tsx');
    const admin = read('src/pages/AdminWinners.tsx');
    const publicRealtimeConsumers = [
      read('src/App.tsx'),
      read('src/pages/ContestDetail.tsx'),
      read('src/pages/Wins.tsx'),
      read('src/hooks/useUnseenWinsCount.ts'),
    ].join('\n');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.sanitize_winner_note_public');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_my_wins_public');
    expect(migration).toContain('REVOKE SELECT ON TABLE public.winners FROM authenticated');
    expect(migration).toMatch(/GRANT SELECT \([\s\S]*?\) ON TABLE public\.winners TO authenticated/);
    expect(migration.match(/GRANT SELECT \(([\s\S]*?)\) ON TABLE public\.winners/)?.[1])
      .not.toContain('notes');
    expect(migration).not.toMatch(/\bUPDATE\s+public\.winners\b/i);

    expect(wins).toContain(".rpc('get_my_wins_public')");
    expect(wins).not.toContain(".select('id, type, status, delivered, notes");
    expect(wins).not.toContain('payload.new.notes');
    expect(card).not.toContain('win.notes');
    expect(detail).not.toContain('win.notes');
    expect(card).toContain('win.public_notes');
    expect(detail).toContain('win.public_notes');
    expect(publicRealtimeConsumers).not.toMatch(/table:\s*['"]winners['"]/);

    expect(migration).toContain('get_winner_internal_notes_superadmin');
    expect(admin).toContain("rpc('get_winner_internal_notes_superadmin'");
    expect(admin).toContain('winner.internal_notes');
  });

  test('winner-note sanitizer uses a general fail-closed rule with broad bilingual variants', () => {
    const hardeningMigration = read(
      'supabase/migrations/20260728204440_harden_public_winner_note_sanitization.sql',
    );
    const databaseTest = read(
      'supabase/tests/winner_notes_and_edge_purchase_privacy.sql',
    );
    const closingMigration = read(
      'supabase/migrations/20260729065526_close_remaining_public_ticket_inference_paths.sql',
    );
    const generatedCases = databaseTest.match(
      /insert into winner_note_sanitizer_variants \(note_text\) values([\s\S]*?);\s*\n\s*select plan/,
    )?.[1] ?? '';
    const generatedCaseCount = generatedCases.match(/^\s*\('/gm)?.length ?? 0;
    const spelledCases = databaseTest.match(
      /insert into winner_note_spelled_order_variants \(note_text\) values([\s\S]*?);\s*\n\s*select plan/,
    )?.[1] ?? '';
    const spelledCaseCount = spelledCases.match(/^\s*\('/gm)?.length ?? 0;

    expect(hardeningMigration).toContain("v_clean ~ '[[:digit:]]'");
    expect(hardeningMigration).toContain('v_had_sequence_marker AND NOT v_had_numeric_token');
    expect(hardeningMigration).toContain(
      "IF v_clean ~ '[[:digit:]]' OR v_clean ~* v_sequence_marker",
    );
    expect(hardeningMigration).toContain(
      'ALTER PUBLICATION supabase_realtime DROP TABLE public.winners',
    );
    expect(hardeningMigration).toContain(
      'ALTER PUBLICATION supabase_realtime DROP TABLE public.contests',
    );
    expect(hardeningMigration).not.toMatch(/\bUPDATE\s+public\.winners\b/i);
    expect(closingMigration).toContain('v_number_word constant text');
    expect(closingMigration).toContain('IF p_note ~* v_number_word');
    expect(closingMigration).not.toMatch(/\bUPDATE\s+public\.winners\b/i);

    expect(generatedCaseCount).toBeGreaterThanOrEqual(40);
    expect(spelledCaseCount).toBeGreaterThanOrEqual(40);
    for (const requiredVariant of [
      '#34',
      'tiket 34',
      'ticket 34',
      'číslo tiketu: 34',
      'ticket number 34',
      '34. tiket',
      '34. pozice',
      'Výhra na 34. pozici',
      'pořadí 34',
      'position 34',
      '34th position',
      'ticket thirty-four',
      'thirty-fourth position',
    ]) {
      expect(generatedCases).toContain(requiredVariant);
    }
    for (const requiredVariant of [
      'Výhra na třicáté čtvrté příčce',
      'Třicátá čtvrtá pozice',
      'won at rank thirty-four',
      'thirty-fourth place',
      'position thirty four',
      'thirty fourth position',
    ]) {
      expect(spelledCases).toContain(requiredVariant);
    }
  });

  test('public bonus catalogue cannot reveal hidden prize lifecycle transitions', () => {
    const migration = read(
      'supabase/migrations/20260729065526_close_remaining_public_ticket_inference_paths.sql',
    );
    const viewBody = migration.match(
      /CREATE VIEW public\.public_bonus_prizes[\s\S]*?FROM public\.bonus_prizes AS bp'/,
    )?.[0] ?? '';
    const publicConsumers = [
      read('src/components/BonusPrizeOverlay.tsx'),
      read('src/components/TicketResultModal.tsx'),
      read('src/components/MysteryPurchaseResultDialog.tsx'),
      read('src/pages/BonusDetail.tsx'),
      read('src/pages/ContestDetail.tsx'),
      read('src/pages/MyContestDetail.tsx'),
      read('src/pages/Wins.tsx'),
    ].join('\n');

    expect(viewBody).not.toContain('ticket_position');
    expect(viewBody).not.toContain('status');
    expect(migration).toContain('REVOKE ALL ON TABLE public.public_bonus_prizes FROM PUBLIC');
    expect(publicConsumers).not.toMatch(
      /\.from\(['"]public_bonus_prizes['"]\)[\s\S]{0,120}\.select\([^)]*\bstatus\b/,
    );
  });

  test('purchase-ticket verifies the JWT and calls the atomic flow only through a service client', () => {
    const edge = read('supabase/functions/purchase-ticket/index.ts');
    const migration = read(
      'supabase/migrations/20260728191209_sanitize_public_winner_notes_and_fix_purchase_edge.sql',
    );

    expect(edge).toContain('supabaseAuth.auth.getUser()');
    expect(edge).toContain('const userId = user.id');
    expect(edge).toContain('const serviceClient = createClient(supabaseUrl, serviceKey)');
    expect(edge).toContain('"buy_ticket_atomic_service"');
    expect(edge).not.toContain('/rest/v1/rpc/buy_ticket_atomic');
    expect(edge).not.toContain('console.log(payload)');
    expect(edge).not.toMatch(/p_user_id\s*=\s*body/);
    expect(edge).not.toContain('serviceKey }');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public."buy_ticket_atomic_service"');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public."buy_ticket_atomic_service"(uuid, uuid) FROM authenticated',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public."buy_ticket_atomic_service"(uuid, uuid) TO service_role',
    );
    expect(migration).toMatch(
      /"buy_ticket_atomic"\(\s*p_user_id\s*=>\s*p_user_id,\s*p_contest_id\s*=>\s*p_contest_id\s*\)/,
    );
  });

  test('internal superadmin winner control keeps ticket numbers for audit', () => {
    const admin = read('src/pages/AdminWinners.tsx');

    expect(admin).toContain('ticket_number');
    expect(admin).toMatch(/#\$\{winner\.ticket_number/);
  });

  test('customer email, push, and notification code cannot format ticket identifiers', () => {
    const deliveryFiles = listTreeFiles('supabase/functions', /index\.ts$/)
      .filter((file) => /email|notification|push/i.test(file));
    const customerDeliveryFunctions = deliveryFiles.map(read).join('\n');

    expect(customerDeliveryFunctions).not.toMatch(/ticket_(?:number|position)/i);
    expect(customerDeliveryFunctions).not.toMatch(/(?:Tiket|Ticket)\s*#\s*(?:\$\{|\|\|)/i);
  });

  test('every Edge Function touching internal ticket state is guarded or explicitly sanitized', () => {
    const sensitiveField = /ticket_number|ticket_position|next_ticket_number|winner_ticket/i;
    const edgeFiles = listTreeFiles('supabase/functions', /index\.ts$/);
    const unprotected = edgeFiles
      .filter((file) => sensitiveField.test(read(file)))
      .filter((file) => {
        const source = read(file);
        const hasInternalToken = source.includes('INTERNAL_FUNCTION_TOKEN');
        const hasAdminRoleGuard =
          /\.in\(['"]role['"],\s*\[['"]admin['"]/.test(source)
          || /\[['"]admin['"],\s*['"]superadmin['"]\]\.includes/.test(source);
        const isSanitizedPurchase =
          file === 'supabase/functions/purchase-ticket/index.ts'
          && source.includes('ticket_number: _ticketNumber')
          && source.includes('JSON.stringify(publicData)')
          && source.includes('supabaseAuth.auth.getUser()')
          && source.includes('const serviceClient = createClient(supabaseUrl, serviceKey)');

        return !hasInternalToken && !hasAdminRoleGuard && !isSanitizedPurchase;
      });

    expect(unprotected).toEqual([]);
  });

  test('future public rendering cannot introduce ticket-number interpolation', () => {
    const forbidden = [
      /(?:Tiket|Ticket|Pozice(?: tiketu)?)\s*:?\s*#\s*(?:\$\{|\{)/i,
      /#\s*\{\s*[^}]*?(?:ticket|tiket|position)/i,
      /ticketNumber\s*=/,
      /\$\{contestId\}-\$\{result\.ticket_number\}/,
      /\.from\(['"](?:tickets|bonus_prizes|contests)['"]\)/,
      /postgres_changes[\s\S]{0,500}table:\s*['"](?:tickets|winners|bonus_prizes|contests)['"]/,
    ];

    const violations = listPublicSourceFiles('src').flatMap((file) => {
      const source = read(file);
      return forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${file}: ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});
