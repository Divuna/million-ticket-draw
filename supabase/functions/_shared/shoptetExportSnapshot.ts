import { decodeCsvBody } from "../import-shoptet-orders/encoding.ts";
import { parseShoptetCsv } from "../import-shoptet-orders/csv.ts";

/**
 * Jeden bezpečný snímek Shoptet exportu — stáhne, dekóduje, zparsuje a rozhodne,
 * jestli je použitelný. Sdílí ho partnerské ověření i admin schválení, aby obě
 * cesty posuzovaly export úplně stejně; kdyby se rozešly, mohla by aktivace
 * projít nad exportem, který ověření odmítlo (nebo naopak).
 *
 * Snímek nikdy nic nevydává a nikdy nevrací URL, hash ani zákaznická data —
 * ven jde jen seznam čísel objednávek a počty.
 */

/** Povinné hlavičky přeložené do řeči partnera. Klíče drží `parseShoptetCsv`. */
const HEADER_LABELS: Record<string, string> = {
  order_code: "číslo objednávky",
  total: "celková cena objednávky",
  email: "e-mail zákazníka",
};

export type SnapshotReason =
  | "export_unreachable"
  | "export_http_error"
  | "export_empty"
  | "missing_headers"
  | "invalid_rows"
  | "no_usable_rows";

export type ExportSnapshot = {
  usable: boolean;
  reachable: boolean;
  httpStatus: number | null;
  headersOk: boolean;
  missingHeaders: string[];
  rowsTotal: number;
  rowsValid: number;
  rowsInvalid: number;
  /** Unikátní čísla objednávek. Prázdné, dokud `usable` není true. */
  orderIds: string[];
  reason: SnapshotReason | null;
};

const fail = (
  reason: SnapshotReason,
  patch: Partial<ExportSnapshot> = {},
): ExportSnapshot => ({
  usable: false,
  reachable: false,
  httpStatus: null,
  headersOk: false,
  missingHeaders: [],
  rowsTotal: 0,
  rowsValid: 0,
  rowsInvalid: 0,
  orderIds: [],
  reason,
  ...patch,
});

export async function snapshotShoptetExport(url: string): Promise<ExportSnapshot> {
  let resp: Response;
  try {
    resp = await fetch(url, { redirect: "follow" });
  } catch (fetchErr) {
    // Loguje se jen typ chyby — nikdy URL.
    console.warn("shoptet export fetch failed:", (fetchErr as Error).name);
    return fail("export_unreachable");
  }

  if (!resp.ok) {
    return fail("export_http_error", { httpStatus: resp.status });
  }

  const text = decodeCsvBody(await resp.arrayBuffer(), resp.headers.get("content-type"));
  const parsed = parseShoptetCsv(text);

  const base = { reachable: true, httpStatus: resp.status };

  if (parsed.missingHeaders.length === 1 && parsed.missingHeaders[0] === "empty_csv") {
    return fail("export_empty", base);
  }

  if (parsed.missingHeaders.length > 0) {
    return fail("missing_headers", {
      ...base,
      missingHeaders: parsed.missingHeaders.map((h) => HEADER_LABELS[h] ?? h),
      rowsTotal: parsed.dataRowCount,
      rowsInvalid: parsed.dataRowCount,
    });
  }

  const rowsValid = parsed.orders.length;
  const rowsInvalid = parsed.invalidRows.length;

  // Neplatný objednávkový řádek znamená, že o části exportu nevíme, co v ní je —
  // a baseline z takového exportu by mohla objednávku vynechat. Fail-closed.
  if (rowsInvalid > 0) {
    return fail("invalid_rows", {
      ...base,
      headersOk: true,
      rowsTotal: parsed.dataRowCount,
      rowsValid,
      rowsInvalid,
    });
  }

  // Prázdný export se nesmí prohlásit za bezpečně ověřený — aktivace nad ním
  // pustí do provozu napojení, které nic nedodává.
  if (rowsValid === 0) {
    return fail("no_usable_rows", {
      ...base,
      headersOk: true,
      rowsTotal: parsed.dataRowCount,
    });
  }

  return {
    usable: true,
    reachable: true,
    httpStatus: resp.status,
    headersOk: true,
    missingHeaders: [],
    rowsTotal: parsed.dataRowCount,
    rowsValid,
    rowsInvalid: 0,
    orderIds: [...new Set(parsed.orders.map((o) => o.orderId))],
    reason: null,
  };
}
