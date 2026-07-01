alter table public.vouchers
  add column if not exists short_description text,
  add column if not exists usage_description text,
  add column if not exists terms_text text,
  add column if not exists how_to_use_text text;

comment on column public.vouchers.short_description is
  'Short admin-provided voucher detail text shown in public voucher detail.';
comment on column public.vouchers.usage_description is
  'Admin-provided description of the voucher offer or usage context.';
comment on column public.vouchers.terms_text is
  'Admin-provided voucher terms text.';
comment on column public.vouchers.how_to_use_text is
  'Admin-provided instructions for using the issued voucher code.';
