declare global {
  interface Window {
    dataLayer: unknown[];
  }
}

function push(event: string, params?: Record<string, unknown>) {
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...params });
  } catch {
    // non-fatal
  }
}

export const analytics = {
  registrationCompleted: () => push('registration_completed'),
  voucherPurchase: (sessionId?: string | null) =>
    push('voucher_purchase', sessionId ? { transaction_id: sessionId } : undefined),
  ticketPurchase: (params: { contestId: string; ticketNumber?: number }) =>
    push('ticket_purchase', { contest_id: params.contestId, ticket_number: params.ticketNumber }),
};
