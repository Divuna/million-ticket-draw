import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const finalOutcomeMigration = read('supabase/migrations/20260806140000_sales_lead_response_final_outcome_lock.sql');
const executableSql = finalOutcomeMigration.replace(/--.*$/gm, '');
const responseFunction = read('supabase/functions/sales-lead-response/index.ts');
const publicPage = read('public/partner-response.html');

const PROJECT = 'dxmowysntemfqfnanxua';
const TOKEN = 'a'.repeat(64);
const API_GLOB = `https://${PROJECT}.supabase.co/functions/v1/sales-lead-response*`;

type Status = 'pending' | 'interested' | 'declined';
type Action = 'interest' | 'decline';

const SETTLED_ACTION: Record<string, Action> = {
  interested: 'interest',
  declined: 'decline',
};

type Stub = {
  /** Authoritative stored outcome, exactly as the database would hold it. */
  status: Status;
  getCount: number;
  postCount: number;
  /** Requests that actually asked the backend to record something. */
  writeAttempts: Array<{ action: string }>;
};

/**
 * Serves the same contract as the Edge Function + submit RPC after this fix:
 * a recorded outcome is final, and a replay reports the ORIGINAL answer.
 */
async function installBackendStub(page: Page, initialStatus: Status): Promise<Stub> {
  const stub: Stub = {
    status: initialStatus,
    getCount: 0,
    postCount: 0,
    writeAttempts: [],
  };

  await serveResponsePage(page);

  await page.route(API_GLOB, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(body),
      });

    if (request.method() === 'GET') {
      stub.getCount += 1;
      // GET is read-only: it never mutates stub.status.
      return json({
        success: true,
        status: stub.status,
        action: url.searchParams.get('action'),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
    }

    stub.postCount += 1;
    const body = new URLSearchParams(request.postData() ?? '');
    const action = (body.get('action') ?? '') as Action;

    if (stub.status !== 'pending') {
      const settledAction = SETTLED_ACTION[stub.status];
      // No write. The stored answer is returned unchanged.
      return json({
        success: true,
        action: settledAction,
        status: stub.status,
        idempotent_replay: true,
        conflicting_action: settledAction !== action,
      });
    }

    stub.writeAttempts.push({ action });
    stub.status = action === 'interest' ? 'interested' : 'declined';
    return json({
      success: true,
      action,
      status: stub.status,
      idempotent_replay: false,
      conflicting_action: false,
    });
  });

  return stub;
}

/**
 * The Vite dev server rewrites unknown .html paths to the SPA shell, so the real
 * static artifact is served verbatim over the normal origin instead.
 */
async function serveResponsePage(page: Page) {
  await page.route('**/partner-response.html*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: publicPage,
    }),
  );
  await page.route('**/onemil-logo.png', (route) => route.fulfill({ status: 204, body: '' }));
}

async function openResponsePage(page: Page, action: Action) {
  await page.goto(
    `/partner-response.html?project=${PROJECT}&token=${TOKEN}&action=${action}`,
  );
  await expect(page.locator('.loading')).toHaveCount(0);
}

const heading = (page: Page) => page.locator('#card h1');
const body = (page: Page) => page.locator('#card p').first();

test.describe('105 — sales-lead response has one final outcome per token', () => {
  test('1) pending + interest POST records interest and confirms it', async ({ page }) => {
    const stub = await installBackendStub(page, 'pending');
    await openResponsePage(page, 'interest');

    await expect(heading(page)).toHaveText('Děkujeme za projevený zájem');
    await page.fill('#name', 'Jana Nováková');
    await page.fill('#phone', '+420 777 123 456');
    await page.click('#submit-button');

    await expect(heading(page)).toHaveText('Děkujeme za projevený zájem');
    await expect(page.locator('#response-form')).toHaveCount(0);
    expect(stub.status).toBe('interested');
    expect(stub.writeAttempts).toEqual([{ action: 'interest' }]);
  });

  test('3) interested + decline GET writes nothing and explains the locked answer', async ({ page }) => {
    const stub = await installBackendStub(page, 'interested');
    await openResponsePage(page, 'decline');

    await expect(heading(page)).toHaveText('Vaše odpověď už byla zaznamenána');
    await expect(body(page)).toContainText(
      'Děkujeme za projevený zájem. Váš kontakt jsme přijali a brzy se vám ozveme.',
    );
    // The confusing plain confirmation must not be reused here.
    await expect(heading(page)).not.toHaveText('Děkujeme za projevený zájem');
    expect(stub.status).toBe('interested');
    expect(stub.postCount).toBe(0);
    expect(stub.writeAttempts).toHaveLength(0);
  });

  test('3b) interested + decline GET offers no form and no way to change the answer', async ({ page }) => {
    await installBackendStub(page, 'interested');
    await openResponsePage(page, 'decline');

    await expect(page.locator('#card form')).toHaveCount(0);
    await expect(page.locator('#card button')).toHaveCount(0);
    await expect(page.locator('#decline-button')).toHaveCount(0);
  });

  test('4) interested + interest GET repeats the interest confirmation without a form', async ({ page }) => {
    const stub = await installBackendStub(page, 'interested');
    await openResponsePage(page, 'interest');

    await expect(heading(page)).toHaveText('Děkujeme za projevený zájem');
    await expect(page.locator('#response-form')).toHaveCount(0);
    await expect(page.locator('#card button')).toHaveCount(0);
    expect(stub.postCount).toBe(0);
  });

  test('6) declined + interest GET writes nothing and respects the decline', async ({ page }) => {
    const stub = await installBackendStub(page, 'declined');
    await openResponsePage(page, 'interest');

    await expect(heading(page)).toHaveText('Vaše odpověď už byla zaznamenána');
    await expect(body(page)).toContainText(
      'Vaše rozhodnutí respektujeme a další obchodní nabídky vám nebudeme zasílat.',
    );
    await expect(page.locator('#response-form')).toHaveCount(0);
    await expect(page.locator('#card button')).toHaveCount(0);
    expect(stub.status).toBe('declined');
    expect(stub.postCount).toBe(0);
    expect(stub.writeAttempts).toHaveLength(0);
  });

  test('7) declined + decline GET repeats the decline confirmation', async ({ page }) => {
    const stub = await installBackendStub(page, 'declined');
    await openResponsePage(page, 'decline');

    await expect(heading(page)).toHaveText('Děkujeme za odpověď');
    await expect(body(page)).toContainText('Další obchodní nabídky vám již nebudeme zasílat');
    await expect(page.locator('#decline-button')).toHaveCount(0);
    expect(stub.postCount).toBe(0);
  });

  test('8) opening both links repeatedly never triggers a second write', async ({ page }) => {
    const stub = await installBackendStub(page, 'pending');

    await openResponsePage(page, 'interest');
    await page.fill('#name', 'Jana Nováková');
    await page.fill('#phone', '+420 777 123 456');
    await page.click('#submit-button');
    await expect(page.locator('#response-form')).toHaveCount(0);

    for (const action of ['decline', 'interest', 'decline'] as Action[]) {
      await openResponsePage(page, action);
      await expect(page.locator('#card form')).toHaveCount(0);
      await expect(page.locator('#card button')).toHaveCount(0);
    }

    expect(stub.status).toBe('interested');
    expect(stub.writeAttempts).toHaveLength(1);
  });

  test('the page decides from the stored status, never from the URL action alone', () => {
    expect(publicPage).toContain('function showFinalStatus(');
    expect(publicPage).toContain('Vaše odpověď už byla zaznamenána');
    expect(publicPage).toContain("if (result.status !== 'pending')");
    // The form may only appear for a still-pending token.
    expect(publicPage).toMatch(
      /if \(result\.status !== 'pending'\)[\s\S]{0,160}action === 'interest' \? showInterestForm\(\) : showDeclineForm\(\)/,
    );
  });
});

test.describe('105 — backend keeps the first outcome final', () => {
  test('2 & 5) a replay returns the ORIGINAL outcome and performs no write', () => {
    expect(executableSql).toContain("IF v_response.status <> 'pending' THEN");
    expect(executableSql).toMatch(
      /v_settled_action := CASE v_response\.status\s+WHEN 'interested' THEN 'interest'\s+ELSE 'decline'\s+END;/,
    );
    // The replay branch returns the stored answer, not the requested one.
    expect(executableSql).toMatch(
      /IF v_response\.status <> 'pending' THEN[\s\S]+?'action', v_settled_action,[\s\S]+?'status', v_response\.status,[\s\S]+?'conflicting_action', v_settled_action IS DISTINCT FROM v_action[\s\S]+?END IF;/,
    );
  });

  const replayBranch = executableSql.slice(
    executableSql.indexOf("IF v_response.status <> 'pending' THEN"),
    executableSql.indexOf('SELECT *\n  INTO v_lead'),
  );

  test('8) the replay branch inserts no activity and no status history', () => {
    expect(replayBranch).not.toMatch(/INSERT INTO/i);
    expect(replayBranch).not.toMatch(/sales_lead_activities/i);
    expect(replayBranch).not.toMatch(/sales_lead_status_history/i);
  });

  test('9) the replay branch never clears suppression or do_not_contact', () => {
    expect(replayBranch).not.toMatch(/UPDATE/i);
    expect(replayBranch).not.toMatch(/DELETE/i);
    expect(replayBranch).not.toMatch(/do_not_contact/i);
    expect(replayBranch).not.toMatch(/sales_lead_email_suppression/i);
    // Nothing anywhere in the function removes a suppression row.
    expect(executableSql).not.toMatch(/DELETE\s+FROM\s+public\.sales_lead_email_suppression/i);
    expect(executableSql).not.toMatch(/do_not_contact\s*=\s*false/i);
  });

  test('10) the replay branch never overwrites the stored name or phone', () => {
    expect(replayBranch).not.toMatch(/response_name/i);
    expect(replayBranch).not.toMatch(/response_phone/i);
    expect(replayBranch).not.toMatch(/contact_person/i);
    expect(replayBranch).not.toMatch(/contact_phone/i);
  });

  test('the outcome is locked under a row lock and the token stays private', () => {
    expect(executableSql).toContain('FOR UPDATE');
    expect(executableSql).toContain('SECURITY DEFINER');
    expect(executableSql).toContain("SET search_path = ''");
    expect(finalOutcomeMigration).toContain(
      'REVOKE ALL ON FUNCTION public.sales_lead_email_response_submit(text,text,text,text)',
    );
    expect(finalOutcomeMigration).toContain('TO service_role');
    // Still no e-mail, no network call, no cron from this migration.
    expect(executableSql).not.toMatch(/Resend|emails\.send|email_queue|net\.http|cron\.schedule|pg_net/i);
  });

  test('the Edge Function forwards the authoritative status on POST', () => {
    expect(responseFunction).toContain('status: result.status ?? null');
    expect(responseFunction).toContain('conflicting_action: result.conflicting_action === true');
    // GET must stay read-only.
    const getBranch = responseFunction.slice(
      responseFunction.indexOf('if (req.method === "GET")'),
      responseFunction.indexOf('const body = await readBody(req)'),
    );
    expect(getBranch).not.toContain('.rpc(');
    expect(getBranch).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });
});
