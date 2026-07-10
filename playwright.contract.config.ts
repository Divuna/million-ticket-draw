import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /(63-sales-leads-duplicate-reply-contract|64-sales-leads-reply-to-header-contract)\.spec\.ts/,
  workers: 1,
  reporter: 'list',
});
