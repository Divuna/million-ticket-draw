/** Reads only the expected code parameter and normalises it like the manual input. */
export function getMioCoinCodeFromSearch(search: string): string | null {
  try {
    const code = new URLSearchParams(search).get('miocoin_code')?.trim().toUpperCase();
    return code || null;
  } catch {
    return null;
  }
}

/** Removes a consumed URL code while preserving every unrelated query parameter. */
export function withoutMioCoinCode(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('miocoin_code');
  const next = params.toString();
  return next ? `?${next}` : '';
}
