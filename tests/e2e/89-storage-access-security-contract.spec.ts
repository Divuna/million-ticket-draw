import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const migrationPath =
  'supabase/migrations/20260718191000_restrict_storage_object_access.sql';
const storagePolicyFixPath =
  'supabase/migrations/20260718194231_fix_storage_policy_object_name.sql';

test.describe('storage access security contract', () => {
  test('partner invoice documents are private and service-role only in Storage', () => {
    const migration = read(migrationPath);

    expect(migration).toContain("WHERE id = 'partner-invoices'");
    expect(migration).toContain('SET public = false');
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Anyone can view partner invoices" ON storage.objects',
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "allow upload partner invoices" ON storage.objects',
    );
    expect(migration).toContain('TO service_role');
    expect(migration).not.toMatch(/partner-invoices[\s\S]{0,240}TO authenticated/i);
    expect(migration).not.toMatch(/partner-invoices[\s\S]{0,240}TO anon/i);
  });

  test('invoice exports store private Storage paths, not long-lived signed URLs', () => {
    const migration = read(migrationPath);
    const isdoc = read('supabase/functions/generate-isdoc/index.ts');
    const pdf = read('supabase/functions/generate-partner-invoice-pdf/index.ts');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS storage_bucket text');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS storage_path text');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS metadata jsonb');
    expect(migration).toContain('SET file_url = NULL');
    expect(migration).toContain('Do not store public or signed invoice URLs');
    expect(isdoc).toContain(".from('partner-invoices')");
    expect(isdoc).toContain('file_url: null');
    expect(isdoc).toContain("storage_bucket: 'partner-invoices'");
    expect(isdoc).toContain('storage_path: filename');
    expect(isdoc).not.toContain('.createSignedUrl(');
    expect(isdoc).not.toContain('10 * 365 * 24 * 60 * 60');
    expect(isdoc).not.toContain('.getPublicUrl(filename)');
    expect(isdoc).not.toContain('urlData.publicUrl');

    expect(pdf).toContain('file_url: null');
    expect(pdf).toContain("storage_bucket: 'partner-invoices'");
    expect(pdf).toContain('storage_path: filename');
    expect(pdf).not.toContain('.createSignedUrl(');
    expect(pdf).not.toContain('10 * 365 * 24 * 60 * 60');
    expect(pdf).not.toContain('.getPublicUrl(filename)');
  });

  test('authorized invoice download creates only short-lived signed URLs', () => {
    const download = read('supabase/functions/get-partner-invoice-export-url/index.ts');

    expect(download).toContain('const SIGNED_URL_TTL_SECONDS = 15 * 60');
    expect(download).toContain('.createSignedUrl(exportRow.storage_path, SIGNED_URL_TTL_SECONDS)');
    expect(download).toContain('.from("user_roles")');
    expect(download).toContain('.in("role", ["admin", "superadmin"])');
    expect(download).toContain('.from("partners")');
    expect(download).toContain('partner.auth_user_id !== userId');
    expect(download).toContain('access_denied');
    expect(download).not.toContain('10 * 365 * 24 * 60 * 60');
  });

  test('partner invoice email attachments use private Storage paths instead of persisted URLs', () => {
    const sender = read('supabase/functions/send-partner-invoice-email/index.ts');

    expect(sender).toContain('.select("id, storage_bucket, storage_path, created_at")');
    expect(sender).toContain('.download(exportRow.storage_path)');
    expect(sender).toContain('buildAttachment(supabase, pdf, periodStart, periodEnd)');
    expect(sender).not.toContain('fetch(pdf.file_url)');
    expect(sender).not.toContain('buildAttachment(pdf.file_url');
  });

  test('contest image and banner mutations require admin role', () => {
    const migration = read(migrationPath);

    for (const policy of [
      '"Authenticated users can upload contest images"',
      '"Admin users can update contest images"',
      '"Admin users can delete contest images"',
      '"Authenticated users can upload contest banners"',
      '"Authenticated users can update contest banners"',
      '"Authenticated users can delete contest banners"',
    ]) {
      expect(migration).toContain(`DROP POLICY IF EXISTS ${policy} ON storage.objects`);
    }

    expect(migration).toContain('storage_contest_images_admin_insert');
    expect(migration).toContain('storage_contest_banners_admin_insert');
    expect(migration).toContain("public.has_role(auth.uid(), 'admin'::public.app_role)");
    expect(migration).toContain("public.has_role(auth.uid(), 'superadmin'::public.app_role)");
    expect(migration).not.toContain("auth.role() = 'authenticated'::text");
  });

  test('partner offer assets are scoped to offers/{partner_id}', () => {
    const migration = read(storagePolicyFixPath);

    expect(migration).toContain(
      'DROP POLICY IF EXISTS "storage_partner_offer_assets_owner_insert" ON storage.objects',
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "storage_partner_offer_assets_owner_update" ON storage.objects',
    );
    expect(migration).toContain('storage_partner_offer_assets_owner_insert');
    expect(migration).toContain('storage_partner_offer_assets_owner_update');
    expect(migration).toContain("public.has_role(auth.uid(), 'admin'::public.app_role)");
    expect(migration).toContain("public.has_role(auth.uid(), 'superadmin'::public.app_role)");
    expect(migration).toContain("p.auth_user_id = auth.uid()");
    expect(migration).toContain("(storage.foldername(storage.objects.name))[1] = 'offers'");
    expect(migration).toContain('(storage.foldername(storage.objects.name))[2] = p.id::text');
    expect(migration).toContain('WITH CHECK');
    expect(migration).toContain('USING');
    expect(migration).not.toContain('storage.foldername(name)');
  });

  test('partner logo writes are limited to admin or current partner-derived names', () => {
    const migration = read(storagePolicyFixPath);

    expect(migration).toContain(
      'DROP POLICY IF EXISTS "storage_partner_logos_owner_insert" ON storage.objects',
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "storage_partner_logos_owner_update" ON storage.objects',
    );
    expect(migration).toContain('storage_partner_logos_owner_insert');
    expect(migration).toContain('storage_partner_logos_owner_update');
    expect(migration).toContain("storage.objects.name LIKE (p.id::text || '-%')");
    expect(migration).toContain("storage.objects.name LIKE (p.id::text || '.%')");
    expect(migration).toContain("storage.objects.name LIKE ('affiliate/' || p.id::text || '.%')");
    expect(migration).toContain('WITH CHECK');
    expect(migration).toContain('USING');
    expect(migration).not.toMatch(/[^.]\bname LIKE \(p\.id::text/);
  });

  test('storage owner policy examples preserve partner/admin boundaries', () => {
    const migration = read(storagePolicyFixPath);
    const ownPartnerId = '11111111-1111-4111-8111-111111111111';
    const otherPartnerId = '22222222-2222-4222-8222-222222222222';

    const offerPathAllowed = (objectName: string, partnerId: string) => {
      const parts = objectName.split('/');
      return parts[0] === 'offers' && parts[1] === partnerId;
    };
    const logoPathAllowed = (objectName: string, partnerId: string) =>
      objectName.startsWith(`${partnerId}-`) ||
      objectName.startsWith(`${partnerId}.`) ||
      objectName.startsWith(`affiliate/${partnerId}.`);

    expect(offerPathAllowed(`offers/${ownPartnerId}/banner.webp`, ownPartnerId)).toBe(true);
    expect(offerPathAllowed(`offers/${otherPartnerId}/banner.webp`, ownPartnerId)).toBe(false);
    expect(offerPathAllowed('offers/missing-partner/banner.webp', ownPartnerId)).toBe(false);
    expect(logoPathAllowed(`${ownPartnerId}.png`, ownPartnerId)).toBe(true);
    expect(logoPathAllowed(`${ownPartnerId}-logo.webp`, ownPartnerId)).toBe(true);
    expect(logoPathAllowed(`affiliate/${ownPartnerId}.svg`, ownPartnerId)).toBe(true);
    expect(logoPathAllowed(`${otherPartnerId}.png`, ownPartnerId)).toBe(false);

    expect(migration).toContain("public.has_role(auth.uid(), 'admin'::public.app_role)");
    expect(migration).toContain("public.has_role(auth.uid(), 'superadmin'::public.app_role)");
    expect(migration).toContain('EXISTS (');
    expect(migration).toContain('FROM public.partners p');
    expect(migration).toContain('WHERE p.auth_user_id = auth.uid()');
  });
});
