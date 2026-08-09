import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("staging consent reuses Supabase Auth OAuth server APIs", () => {
  const source = readFileSync(join(root, "src/pages/OAuthConsent.tsx"), "utf8");

  expect(source).toContain('const STAGING_PROJECT_REF = "dxmowysntemfqfnanxua"');
  expect(source).toContain("supabase.auth.oauth.getAuthorizationDetails(authorizationId)");
  expect(source).toContain("supabase.auth.oauth.approveAuthorization(authorizationId");
  expect(source).toContain("supabase.auth.oauth.denyAuthorization(authorizationId");
  expect(source).toContain("buildLoginRedirectUrl(`${location.pathname}${location.search}`)");
  expect(source).toContain("if (!isSuperAdmin)");
  expect(source).not.toContain("service_role");
  expect(source).not.toContain("localStorage");
});

test("route and admin login preserve only the OAuth consent return", () => {
  const app = readFileSync(join(root, "src/App.tsx"), "utf8");
  const login = readFileSync(join(root, "src/pages/Login.tsx"), "utf8");

  expect(app).toContain('<Route path="/oauth/consent" element={<OAuthConsent />} />');
  expect(login).toContain('redirectTarget?.startsWith("/oauth/consent?authorization_id=")');
  expect(login).toContain('navigate(isOAuthConsentReturn ? redirectTarget! : "/admin"');
});
