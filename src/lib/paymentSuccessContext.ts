const KIND_KEY = 'payment_success_kind';
const RETURN_KEY = 'payment_success_return';

export function isSafeInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('://');
}

/** Call immediately before redirecting to Stripe checkout (client-only). */
export function setPendingPaymentSuccessContext(opts: {
  kind: 'miocoin' | 'voucher';
  returnTo?: string | null;
}): void {
  sessionStorage.setItem(KIND_KEY, opts.kind);
  if (opts.returnTo && isSafeInternalPath(opts.returnTo)) {
    sessionStorage.setItem(RETURN_KEY, opts.returnTo);
  } else {
    sessionStorage.removeItem(RETURN_KEY);
  }
}

export function peekPaymentSuccessContext(): {
  kind: 'miocoin' | 'voucher';
  returnTo: string | null;
} {
  const kindRaw = sessionStorage.getItem(KIND_KEY);
  const retRaw = sessionStorage.getItem(RETURN_KEY);
  const kind: 'miocoin' | 'voucher' = kindRaw === 'voucher' ? 'voucher' : 'miocoin';
  const returnTo = retRaw && isSafeInternalPath(retRaw) ? retRaw : null;
  return { kind, returnTo };
}

export function clearPaymentSuccessContext(): void {
  sessionStorage.removeItem(KIND_KEY);
  sessionStorage.removeItem(RETURN_KEY);
}

export function resolvePaymentSuccessViewContext(searchParams: URLSearchParams): {
  kind: 'miocoin' | 'voucher';
  returnTo: string | null;
} {
  const stored = peekPaymentSuccessContext();
  const urlType = searchParams.get('type');
  const urlReturn = searchParams.get('returnTo');
  const kind =
    urlType === 'voucher' ? 'voucher' : urlType === 'miocoin' ? 'miocoin' : stored.kind;
  const returnTo =
    (urlReturn && isSafeInternalPath(urlReturn) ? urlReturn : null) ?? stored.returnTo;
  return { kind, returnTo };
}
