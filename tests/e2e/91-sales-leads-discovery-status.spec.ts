/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Obchod / Leady — stav hledání nových firem  (spec 91)                    ║
 * ║                                                                            ║
 * ║  Ověřuje, že sledování discovery úlohy žije NAD dialogem:                  ║
 * ║    • stavový pruh je během hledání viditelný i při zavřeném dialogu        ║
 * ║    • kliknutí na pruh otevře dialog s aktuálním průběhem                   ║
 * ║    • zavření dialogu sledování nezastaví (polling běží dál)                ║
 * ║    • po dokončení se seznam a počty automaticky obnoví                     ║
 * ║    • po dokončení se přepne záložka na „Návrhy"                            ║
 * ║    • po obnovení stránky se běžící úloha znovu načte                       ║
 * ║                                                                            ║
 * ║  Odpovědi tabulky `sales_lead_discovery_jobs` jsou v testu ODCHYCENÉ       ║
 * ║  (page.route) — test tedy NIKDY nespustí reálné vyhledávání firem, ARES,   ║
 * ║  ověřování webů ani zápis leadů a nemění žádná data.                       ║
 * ║                                                                            ║
 * ║  STAGING-ONLY. Vyžaduje superadmina (obchází RequirePermission).           ║
 * ║  Env: E2E_SUPERADMIN_EMAIL, E2E_SUPERADMIN_PASSWORD                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(p, 'utf8');

test.describe('91 — kontrakt: stav úlohy nežije uvnitř dialogu', () => {
  const hook = read('src/components/admin/sales-leads/useDiscoveryJob.ts');
  const dialog = read('src/components/admin/sales-leads/DiscoverLeadsDialog.tsx');
  const page = read('src/pages/AdminSalesLeads.tsx');

  test('sledování drží sdílený hook nad dialogem', () => {
    expect(page).toContain('useDiscoveryJob');
    expect(page).toContain('<DiscoveryStatusBar');
    // Dialog stav jen zobrazuje — nevlastní ho.
    expect(dialog).not.toContain('setJobId');
    expect(dialog).not.toContain("useState<JobRow");
  });

  test('zavření dialogu nemaže jobId ani nezastavuje sledování', () => {
    const handleClose = dialog.slice(dialog.indexOf('const handleClose'), dialog.indexOf('const addGroup'));
    expect(handleClose).not.toContain('setJobId');
    expect(handleClose).not.toContain('setJob(');
    expect(handleClose).not.toContain('onStop');
  });

  test('běžící úloha se dohledává z existující tabulky podle admina', () => {
    expect(hook).toContain('sales_lead_discovery_jobs');
    expect(hook).toContain("eq('created_by'");
    expect(hook).toMatch(/order\('created_at',\s*\{\s*ascending:\s*false/);
    // Žádný paralelní systém — jen existující tabulka a její RPC.
    expect(hook).toContain('sales_lead_discovery_job_create');
    expect(hook).toContain('sales_lead_discovery_job_stop');
  });

  test('ošetřuje běží / dokončeno / zastaveno / chyba', () => {
    for (const status of ['queued', 'running', 'done', 'stopped', 'failed']) {
      expect(hook).toContain(status);
    }
    const bar = read('src/components/admin/sales-leads/DiscoveryStatusBar.tsx');
    expect(bar).toContain('Probíhá hledání nových firem…');
    expect(bar).toContain('Vyhledávání dokončeno');
    expect(bar).toContain('Vyhledávání zastaveno');
    expect(bar).toContain('Vyhledávání selhalo');
  });

  test('dokončení přepne na Návrhy a obnoví seznam', () => {
    expect(page).toContain("setActiveTab('proposed')");
    expect(page).toContain('onFinished: handleDiscoveryFinished');
    expect(page).toContain('onProgress: load');
  });
});

const EMAIL = process.env.E2E_SUPERADMIN_EMAIL ?? '';
const PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD ?? '';

const JOB_ID = '11111111-2222-3333-4444-555555555555';

type JobStatus = 'queued' | 'running' | 'done' | 'stopped' | 'failed';

function makeJob(status: JobStatus, createdCount: number) {
  return {
    id: JOB_ID,
    status,
    lead_group: 'eshop',
    requested_count: 5,
    candidates_checked: 12,
    created_count: createdCount,
    duplicates: 1,
    websites_rejected: 2,
    wrong_category: 0,
    with_ico: createdCount,
    with_dic: createdCount,
    with_address: createdCount,
    with_phone: 1,
    finish_reason: status === 'done' ? 'target_reached' : null,
    error: null,
    created_by: '00000000-0000-0000-0000-000000000000',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Mutovatelný stav odchycené úlohy + počítadla dotazů. */
interface Stub {
  job: ReturnType<typeof makeJob>;
  jobPolls: number;
  leadsFetches: number;
}

async function installStubs(page: Page, stub: Stub) {
  // Odchyt discovery úlohy — vrací vždy jeden objekt (dotazy používají maybeSingle).
  await page.route('**/rest/v1/sales_lead_discovery_jobs*', async (route) => {
    stub.jobPolls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(stub.job),
    });
  });

  // Počítáme obnovení seznamu leadů (necháváme projít na staging).
  await page.route('**/rest/v1/sales_leads*', async (route) => {
    stub.leadsFetches += 1;
    await route.fallback();
  });

  await page.addInitScript(() => {
    localStorage.setItem(
      'cookie_consent',
      JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
    );
  });
}

async function loginAndOpenLeads(page: Page) {
  await page.goto('/login');
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 });
  await page.goto('/admin/sales-leads');
}

const statusBar = (page: Page) => page.getByTestId('sl-discovery-status-bar');

test.describe.serial('91 — stav hledání nových firem (Obchod / Leady)', () => {
  test.skip(!EMAIL || !PASSWORD, 'Missing E2E_SUPERADMIN_* — skipping spec 91');

  test('91a) během hledání je stavový pruh viditelný s průběhem', async ({ page }) => {
    const stub: Stub = { job: makeJob('running', 2), jobPolls: 0, leadsFetches: 0 };
    await installStubs(page, stub);
    await loginAndOpenLeads(page);

    const bar = statusBar(page);
    await expect(bar).toBeVisible({ timeout: 20_000 });
    await expect(bar).toHaveAttribute('data-status', 'running');
    await expect(bar).toContainText('Probíhá hledání nových firem…');
    await expect(bar).toContainText('Uloženo 2 z 5');
  });

  test('91b) kliknutí na pruh otevře dialog s aktuálním průběhem', async ({ page }) => {
    const stub: Stub = { job: makeJob('running', 3), jobPolls: 0, leadsFetches: 0 };
    await installStubs(page, stub);
    await loginAndOpenLeads(page);

    await expect(statusBar(page)).toBeVisible({ timeout: 20_000 });
    await statusBar(page).click();

    const dialog = page.getByTestId('sl-discover-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('sl-discover-progress')).toContainText('Uloženo 3 z 5');
  });

  test('91c) zavření dialogu nezastaví sledování', async ({ page }) => {
    const stub: Stub = { job: makeJob('running', 1), jobPolls: 0, leadsFetches: 0 };
    await installStubs(page, stub);
    await loginAndOpenLeads(page);

    await expect(statusBar(page)).toBeVisible({ timeout: 20_000 });
    await statusBar(page).click();
    await expect(page.getByTestId('sl-discover-dialog')).toBeVisible();

    await page.getByTestId('sl-discover-close').click();
    await expect(page.getByTestId('sl-discover-dialog')).not.toBeVisible();

    // Pruh zůstává a polling pokračuje i se zavřeným dialogem
    await expect(statusBar(page)).toBeVisible();
    const pollsAfterClose = stub.jobPolls;
    await expect.poll(() => stub.jobPolls, { timeout: 15_000 }).toBeGreaterThan(pollsAfterClose);
    await expect(statusBar(page)).toHaveAttribute('data-status', 'running');
  });

  test('91d) dokončení obnoví seznam, přepne na „Návrhy" a zobrazí výsledek', async ({ page }) => {
    const stub: Stub = { job: makeJob('running', 4), jobPolls: 0, leadsFetches: 0 };
    await installStubs(page, stub);
    await loginAndOpenLeads(page);

    await expect(statusBar(page)).toBeVisible({ timeout: 20_000 });
    const leadsBefore = stub.leadsFetches;

    // Úloha doběhne
    stub.job = makeJob('done', 5);

    // Stavový pruh přejde do dokončeného stavu
    await expect(statusBar(page)).toHaveAttribute('data-status', 'done', { timeout: 15_000 });
    await expect(statusBar(page)).toContainText('Vyhledávání dokončeno — uloženo 5 firem.');

    // Seznam se automaticky obnovil
    await expect.poll(() => stub.leadsFetches, { timeout: 15_000 }).toBeGreaterThan(leadsBefore);

    // Záložka se přepnula na „Návrhy"
    await expect(page.getByRole('tab', { name: /Návrhy/ })).toHaveAttribute('data-state', 'active');
  });

  test('91e) po obnovení stránky se běžící úloha znovu načte', async ({ page }) => {
    const stub: Stub = { job: makeJob('running', 2), jobPolls: 0, leadsFetches: 0 };
    await installStubs(page, stub);
    await loginAndOpenLeads(page);
    await expect(statusBar(page)).toBeVisible({ timeout: 20_000 });

    await page.reload();

    // Stav přežil refresh — dohledal se z sales_lead_discovery_jobs
    await expect(statusBar(page)).toBeVisible({ timeout: 20_000 });
    await expect(statusBar(page)).toHaveAttribute('data-status', 'running');
    await expect(statusBar(page)).toContainText('Uloženo 2 z 5');
  });

  test('91f) dokončení při otevřeném dialogu ukáže výsledek a jen „Zavřít"', async ({ page }) => {
    const stub: Stub = { job: makeJob('running', 4), jobPolls: 0, leadsFetches: 0 };
    await installStubs(page, stub);
    await loginAndOpenLeads(page);

    await expect(statusBar(page)).toBeVisible({ timeout: 20_000 });
    await statusBar(page).click();
    await expect(page.getByTestId('sl-discover-dialog')).toBeVisible();

    stub.job = makeJob('done', 5);

    await expect(page.getByTestId('sl-discover-title')).toHaveText('Vyhledávání dokončeno', { timeout: 15_000 });
    await expect(page.getByTestId('sl-discover-progress')).toContainText('5 / 5');
    // Spouštěcí tlačítko je pryč, zůstává jen „Zavřít"
    await expect(page.getByTestId('sl-discover-run')).toHaveCount(0);
    await expect(page.getByTestId('sl-discover-close')).toBeVisible();
  });
});
