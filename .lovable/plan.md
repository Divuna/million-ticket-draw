

## Problem

The "Připravujeme" section on the homepage shows empty placeholder cards because the `coming_soon_banners` table has Row Level Security (RLS) enabled with only an admin policy. Regular and anonymous users cannot read the data.

The images themselves are stored correctly in the `banner-images` bucket (which is public), and the URLs in the database are valid full public URLs. The issue is purely an RLS policy problem.

## Root Cause

- Table `coming_soon_banners` has RLS enabled
- Only policy: `Admins can manage coming soon banners` (ALL for admin/superadmin roles)
- No SELECT policy exists for anonymous or authenticated users
- Homepage queries this table as the current user, which gets zero rows back

## Plan

**Step 1: Add a public SELECT RLS policy** on `coming_soon_banners` to allow everyone (including anonymous visitors) to read banners.

```sql
CREATE POLICY "Anyone can view coming soon banners"
  ON public.coming_soon_banners
  FOR SELECT
  USING (true);
```

This is safe because the table only contains public display data (id, image_url, title, created_at) with no sensitive information.

No code changes needed -- the frontend logic in `Homepage.tsx` and `useComingSoonBanners.ts` is already correct.

