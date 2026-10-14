import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /(63-sales-leads-duplicate-reply-contract|64-sales-leads-reply-to-header-contract|65-sales-leads-unread-replies-contract|66-sales-leads-crm-completion-contract|67-sales-leads-scheduled-activities-contract|68-sales-leads-company-website-verification-contract|69-sales-leads-discover-web-search-contract|70-sales-leads-website-verification-behavior)\.spec\.ts/,
  workers: 1,
  reporter: 'list',
});
