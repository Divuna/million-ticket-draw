// Charset-correct decoding of the Shoptet CSV body.
//
// Pure and dependency-free so it runs unchanged in Deno (the Edge Function) and
// can be imported directly by the Playwright specs — the tested decoder and the
// deployed decoder are literally the same code.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// The importer used `resp.text()`, which ALWAYS decodes as UTF-8 and ignores the
// charset in Content-Type. Shoptet serves a custom order export as:
//
//     Content-Type: application/csv; charset=windows-1250
//
// In windows-1250 "ř" is the single byte 0xF8, which is not a valid UTF-8 lead
// byte, so `resp.text()` turned "Nevyřízená" into "Nevy��zen�".
// That silently broke status mapping: the mojibake matches none of the patterns
// in mapStatus, so every order fell to `pending` and its reward was never issued.
// Verified on production — one partner sat at `pending` indefinitely while its
// Shoptet order was already handled.
//
// Nothing here guesses. The charset is taken from the header the server itself
// sent; when the server says nothing we keep the previous behaviour (UTF-8).
//
// No new dependency is needed: both Deno and Node implement the WHATWG Encoding
// Standard, which includes the legacy single-byte encodings such as windows-1250.

/** UTF-8 is the assumption when the server does not say otherwise. */
export const DEFAULT_CHARSET = "utf-8";

/**
 * Extracts the `charset` parameter from a Content-Type header.
 *
 * Returns null when the header is missing or carries no charset, so the caller
 * can fall back rather than invent an encoding.
 */
export function charsetFromContentType(contentType: string | null | undefined): string | null {
  if (!contentType) return null;
  // charset may be quoted and may sit among other parameters, in any case.
  const m = /;\s*charset\s*=\s*"?([^";]+)"?/i.exec(contentType);
  if (!m) return null;
  const label = m[1].trim().toLowerCase();
  return label.length > 0 ? label : null;
}

/**
 * Decodes a raw CSV body using the charset the server declared.
 *
 * Falls back to UTF-8 when the header carries no charset, or when it names a
 * label this runtime does not know — an unknown label must never take the import
 * down, and UTF-8 is exactly what the importer did before this function existed.
 *
 * BOM handling is unchanged: TextDecoder strips a leading BOM by default, which
 * is what `resp.text()` did too.
 */
export function decodeCsvBody(
  body: ArrayBuffer | Uint8Array,
  contentType: string | null | undefined,
): string {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  const label = charsetFromContentType(contentType) ?? DEFAULT_CHARSET;

  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    // Unknown/unsupported label (e.g. a non-standard "win-1250"). Decode as UTF-8
    // rather than fail the whole import; a mis-decoded status maps to `pending`,
    // which withholds the reward instead of issuing a wrong one.
    return new TextDecoder(DEFAULT_CHARSET).decode(bytes);
  }
}
