
-- Grant SELECT on public tables needed for homepage (anonymous + authenticated)
GRANT SELECT ON public.banners TO anon, authenticated;
GRANT SELECT ON public.contests TO anon, authenticated;
GRANT SELECT ON public.vouchers TO anon, authenticated;
GRANT SELECT ON public.partners TO anon, authenticated;
GRANT SELECT ON public.coming_soon_banners TO anon, authenticated;
GRANT SELECT ON public.content_pages TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
;
