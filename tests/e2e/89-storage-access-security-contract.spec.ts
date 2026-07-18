import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const migrationPath =
  'supabase/migrations/20260718191000_restrict_storage_object_access.sql';

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

  test('ISDOC exports no longer create public Storage URLs', () => {
    const isdoc = read('supabase/functions/generate-isdoc/index.ts');

    expect(isdoc).toContain(".from('partner-invoices')");
    expect(isdoc).toContain('.createSignedUrl(filename, SIGNED_URL_TTL_SECONDS)');
    expect(isdoc).not.toContain('.getPublicUrl(filename)');
    expect(isdoc).not.toContain('urlData.publicUrl');
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
    const migration = read(migrationPath);

    expect(migration).toContain(
      'DROP POLICY IF EXISTS "partner-offer-assets authenticated upload" ON storage.objects',
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "partner-offer-assets authenticated update" ON storage.objects',
    );
    expect(migration).toContain('storage_partner_offer_assets_owner_insert');
    expect(migration).toContain("p.auth_user_id = auth.uid()");
    expect(migration).toContain("(storage.foldername(name))[1] = 'offers'");
    expect(migration).toContain('(storage.foldername(name))[2] = p.id::text');
  });

  test('partner logo writes are limited to admin or current partner-derived names', () => {
    const migration = read(migrationPath);

    expect(migration).toContain(
      'DROP POLICY IF EXISTS "partner_upload_own_logo" ON storage.objects',
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "partner_update_own_logo" ON storage.objects',
    );
    expect(migration).toContain('storage_partner_logos_owner_insert');
    expect(migration).toContain("name LIKE (p.id::text || '-%')");
    expect(migration).toContain("name LIKE (p.id::text || '.%')");
    expect(migration).toContain("name LIKE ('affiliate/' || p.id::text || '.%')");
    expect(migration).toContain("allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']");
    expect(migration).toContain('file_size_limit = 5242880');
  });
});
