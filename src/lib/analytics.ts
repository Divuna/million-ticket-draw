declare global {
  interface Window {
    dataLayer: unknown[];
  }
}

function push(event: string, params?: Record<string, unknown>) {
  try {
    window.dataLayer = window.dataLayer || [];
    const payload = { event, ...params };
    console.log('[analytics] dataLayer.push', payload);
    window.dataLayer.push(payload);
  } catch (err) {
    console.error('[analytics] dataLayer.push failed', err);
  }
}

export const analytics = {
  registrationCompleted: () => {
    console.log('[analytics] registration_completed');
    push('registration_completed');
  },
  voucherPurchase: (sessionId?: string | null) => {
    console.log('[analytics] voucher_purchase', { sessionId });
    push('voucher_purchase', sessionId ? { transaction_id: sessionId } : undefined);
  },
  ticketPurchase: (params: { contestId: string; ticketNumber?: number }) => {
    console.log('[analytics] ticket_purchase', params);
    push('ticket_purchase', { contest_id: params.contestId, ticket_number: params.ticketNumber });
  },
};
