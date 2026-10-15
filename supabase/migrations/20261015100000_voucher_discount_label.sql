-- Slevová nálepka na kartě voucheru (redesign, deska Vouchery: „−20 %“, „−150 Kč“).
-- Čistě zobrazovací, volitelný údaj, který vyplňuje admin ve správě voucherů.
-- Nemění cenu voucheru, nákup (buy_voucher_atomic), kódy ani B2B ceny.
-- Tabulka vouchers je záměrně veřejně čitelná (veřejný katalog), takže stačí sloupec.

alter table public.vouchers
  add column if not exists discount_label text;

alter table public.vouchers
  drop constraint if exists vouchers_discount_label_len;

alter table public.vouchers
  add constraint vouchers_discount_label_len
  check (discount_label is null or char_length(btrim(discount_label)) between 1 and 12);

comment on column public.vouchers.discount_label is
  'Krátký text slevové nálepky na kartě voucheru (např. −20 %, −150 Kč). Jen zobrazení, max 12 znaků.';
