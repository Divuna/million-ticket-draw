const MIOCOIN_PACKAGE_TO_CZK: Record<number, number> = {
  50: 50,
  310: 300,
  525: 500,
  1280: 1200,
};

export function derivePaidCzkFromCreditedMiocoins(amount: number | null | undefined): number | null {
  const creditedMiocoins = Number(amount);
  if (!Number.isFinite(creditedMiocoins)) return null;
  return MIOCOIN_PACKAGE_TO_CZK[creditedMiocoins] ?? null;
}

export function formatCreditedMiocoins(amount: number | null | undefined): string {
  const creditedMiocoins = Number(amount) || 0;
  return `${creditedMiocoins.toLocaleString('cs-CZ')} MioCoinů`;
}

export function formatDerivedPaidCzk(amount: number | null | undefined): string {
  const paidCzk = derivePaidCzkFromCreditedMiocoins(amount);
  return paidCzk === null ? 'neznámé' : `${paidCzk.toLocaleString('cs-CZ')} Kč`;
}

export function summarizePaymentReporting<T extends { amount: number | null | undefined }>(
  payments: T[] | null | undefined,
) {
  return (payments ?? []).reduce(
    (summary, payment) => {
      const creditedMiocoins = Number(payment.amount) || 0;
      const paidCzk = derivePaidCzkFromCreditedMiocoins(payment.amount);

      return {
        creditedMiocoins: summary.creditedMiocoins + creditedMiocoins,
        paidCzk: summary.paidCzk + (paidCzk ?? 0),
        hasUnknownPaidCzk: summary.hasUnknownPaidCzk || paidCzk === null,
      };
    },
    { creditedMiocoins: 0, paidCzk: 0, hasUnknownPaidCzk: false },
  );
}

export function formatPaymentReportingTotal(summary: {
  paidCzk: number;
  hasUnknownPaidCzk: boolean;
}): string {
  return summary.hasUnknownPaidCzk ? 'neznámé' : `${summary.paidCzk.toLocaleString('cs-CZ')} Kč`;
}
