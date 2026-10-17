/**
 * Cena voucheru pro zákazníka v MIO – jediné místo pro texty na webu.
 * MUSÍ odpovídat `v_price` v DB funkci `buy_voucher_atomic` (dnes 5 MIO).
 * Přechod na vouchery zdarma = migrace `20261017120000_vouchers_free_for_customers`
 * a současně změna této konstanty na 0 (schvaluje Pavel).
 */
export const VOUCHER_PRICE_MIO: number = 5;

export const isVoucherFree = VOUCHER_PRICE_MIO === 0;

/** Text tlačítka u voucheru, který si zákazník ještě nevzal. */
export const voucherCtaLabel = isVoucherFree ? 'Získat zdarma' : `Koupit za ${VOUCHER_PRICE_MIO} MIO`;

/** Hláška po úspěšném získání voucheru. */
export const voucherAcquiredMessage = isVoucherFree
  ? 'Voucher je tvůj!'
  : `Voucher úspěšně zakoupen za ${VOUCHER_PRICE_MIO} MIO!`;
