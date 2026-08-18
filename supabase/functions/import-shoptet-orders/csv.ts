// Pure Shoptet CSV parsing for import-shoptet-orders.
//
// Kept dependency-free so it runs unchanged in Deno (the Edge Function) and can be
// imported directly by the Playwright specs. There must be exactly one parser —
// never re-implement this logic in a test fixture.
//
// Two export shapes are supported:
//   * legacy header-only  — one CSV row per order (what every existing partner uses)
//   * item-level          — one CSV row per order item, order header data repeated,
//                           produced by Shoptet's "Exportovat jednotlivé položky
//                           objednávky" option
//
// Item-level rows are grouped back into one order carrying items[], which flows to
// create_partner_order_reward → compute_partner_reward.

// Five-bucket Shoptet order status taxonomy.
// completed: fully fulfilled  → issue for all trigger thresholds.
// shipped:   dispatched       → issue for 'paid' and 'shipped' thresholds.
// paid:      payment received → issue only for 'paid' threshold.
// cancelled: stopped/returned → always cancel the reward code.
// pending:   below threshold  → leave reward code as pending.
export type ShoptetStatus = "paid" | "shipped" | "completed" | "cancelled" | "pending";

// One order line item, as sent to create_partner_order_reward → compute_partner_reward.
// `code` is the only matching key; `name` is display-only and feeds the partner's
// product picker cache.
export type ImportItem = {
  code: string;
  name: string;
  quantity: number;
  unit_price_czk: number;
};

export type ImportRow = {
  orderId: string;
  total: number;
  customerEmail: string;
  shoptetStatus: ShoptetStatus;
  items: ImportItem[];
};

export type ParsedCsv = {
  isItemLevel: boolean;
  orders: ImportRow[];
  invalidRows: Array<{ orderId: string | null }>;
  missingHeaders: string[];
  dataRowCount: number;
};

export function detectDelimiter(headerLine: string): string {
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  return semi >= comma ? ";" : ",";
}

export function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function norm(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// The Czech variants are listed first because the custom Shoptet export a partner
// must configure for item-level data produces Czech headers ("Kód objednávky").
// The legacy English candidates are kept untouched afterwards so every existing
// partner export keeps resolving to exactly the same column as before.
export const HEADER_CANDIDATES = {
  order: ["kod objednavky", "cislo objednavky", "code", "order", "order_number", "objednavka"],
  total: ["cena objednavky celkem", "total", "celkem", "cena celkem", "price", "totalprice", "grand total", "amount"],
  email: ["email", "e-mail", "mail"],
  status: ["status", "stav"],
};

// Item-level columns from the Shoptet "Exportovat jednotlivé položky objednávky"
// export. Candidates are deliberately specific ("polozka" / "order item") so they
// can never be confused with the order-header columns above.
//
// Each list ends with Shoptet's own DEFAULT header names (orderItemCode,
// orderItemName, …). Those are camelCase with no separator, so none of the older
// candidates — which all contain a space, dash or underscore — could ever match
// them: a partner exporting with Shoptet's stock column names produced no items at
// all, and the order fell back to the whole-order rate.
//
// They are appended, never inserted, so on an export carrying both spellings the
// previously-chosen column still wins and existing partners resolve exactly as
// before.
export const ITEM_HEADER_CANDIDATES = {
  itemCode: ["polozka objednavky - kod", "polozka - kod", "order item - code", "order item code", "item code", "item_code", "orderitemcode"],
  itemName: ["polozka objednavky - nazev", "polozka - nazev", "order item - name", "order item name", "item name", "item_name", "orderitemname"],
  itemQty: ["polozka objednavky - mnozstvi", "polozka - mnozstvi", "order item - amount", "order item amount", "item amount", "item quantity", "item_quantity", "orderitemamount"],
  // After-discount unit price is the confirmed source for ratio rewards.
  itemUnitPriceAfterDiscount: [
    "polozka objednavky - cena s dani za jednotku po sleve",
    "polozka - cena s dani za jednotku po sleve",
    "order item - unit price with vat after discount",
    "item unit price after discount",
    "orderitemunitdiscountpricewithvat",
  ],
  // Fallback when the export only carries the plain unit price.
  // The default-name pair mirrors the Czech pair above: the discounted column is
  // preferred, this one is used only when the export has no discounted price.
  // "orderitemunitpricewithvat" cannot swallow the discounted column, because
  // "orderitemunitdiscountpricewithvat" does not contain it as a substring.
  itemUnitPrice: [
    "polozka objednavky - cena s dani za jednotku",
    "polozka - cena s dani za jednotku",
    "order item - unit price with vat",
    "item unit price",
    "orderitemunitpricewithvat",
  ],
  itemType: ["polozka objednavky - typ", "polozka - typ", "order item - type", "item type", "item_type", "orderitemtype"],
};

// `exclude` keeps header detection from latching onto an item column. Without it an
// English export column like "Order item - code" would satisfy the order-header
// candidate "code" and the importer would group by product instead of by order.
export function findCol(headers: string[], candidates: string[], exclude?: Set<number>): number {
  const normalized = headers.map((h) => norm(h));
  for (const c of candidates) {
    const idx = normalized.findIndex((h, i) => !exclude?.has(i) && h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Non-product lines Shoptet mixes into the item export (shipping, payment fee,
// discount coupons, gift wrapping). They must never be matched against a product
// rule, and must not earn MioCoins at the global rate in the exceptions mode.
// Unknown/blank types are treated as products on purpose: under-counting would pay
// the customer less than the widget promised.
export function isNonProductItemType(raw: string): boolean {
  const s = norm(raw);
  if (!s) return false;
  return /(doprav|shipping|postovn|platb|payment|billing|sleva|discount|kupon|coupon|voucher|darkove baleni|gift wrap|poplat|fee)/.test(s);
}

export function parseNumericCell(raw: string): number {
  const cleaned = (raw ?? "").replace(/\s/g, "").replace(/ /g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Maps raw Shoptet status string to the 5-bucket taxonomy.
// completed must be checked BEFORE shipped and paid — Czech "vyřízená" (vyriz)
// would otherwise match the paid pattern first.
export function mapStatus(raw: string): ShoptetStatus {
  const s = norm(raw);

  // ── negated states, resolved before anything else ──────────────────────────
  //
  // Czech negates with the prefix "ne", English with "un" — but every pattern
  // below is a SUBSTRING match, so the negation is completely invisible to it:
  //
  //   "Nevyřízená"  (NOT processed) matched `vyriz`  inside ne-VYRIZ-ena  → completed
  //   "Nezaplaceno" (NOT paid)      matched `zaplac` inside ne-ZAPLAC-eno → paid
  //   "unpaid"      (NOT paid)      matched `paid`   inside un-PAID       → paid
  //
  // All three then issued the reward. This is not theoretical: BOHEMIA's export
  // is UTF-8, so three orders standing at "Nevyřízená" were issued on production,
  // one of them already redeemed. The `nezaplac` and `unpaid` entries in the
  // cancelled branch below were dead code for the same reason — the paid branch
  // ran first and swallowed them.
  //
  // Each negation is routed to the bucket its meaning demands:
  //   not yet in a positive state → pending   (simply re-offered on the next import)
  //   explicitly not paid         → cancelled (the order will not be fulfilled)
  //
  // `\b` anchors both to a real word start, so neither can fire mid-word
  // ("stornovana" contains "n","e" but not at a boundary).
  //
  // "nevyzvednuto" (not collected) is deliberately absent: it matches none of the
  // positive patterns, so it already reaches the cancelled branch on its own.
  if (/\bne(vyriz|dokon|dorucen|odeslan)/.test(s))                               return "pending";
  if (/\bnezaplac/.test(s) || /\bunpaid/.test(s))                                return "cancelled";

  if (/(completed|dokon|vyriz|dorucen|delivered)/.test(s))                       return "completed";
  if (/(shipped|odeslan|dispatched)/.test(s))                                    return "shipped";
  if (/(zaplac|paid|pripravena|processing|vyrizuje)/.test(s))                    return "paid";
  if (/(storn|zrusen|cancel|vracen|returned|nevyzved|unpaid|nezaplac)/.test(s))  return "cancelled";
  return "pending";
}

// Returns true if the reward code should be issued NOW given the partner's threshold.
export function shouldIssue(status: ShoptetStatus, triggerThreshold: string): boolean {
  if (status === "completed") return true;                              // all thresholds
  if (status === "shipped")   return triggerThreshold !== "completed";  // 'paid' + 'shipped'
  if (status === "paid")      return triggerThreshold === "paid";       // 'paid' only
  return false;                                                         // pending, cancelled
}

// Maps ShoptetStatus → value accepted by update_partner_order_reward_status.
// RPC positive set: 'paid', 'delivered', 'completed'. 'shipped' is not accepted → 'delivered'.
export function toRpcStatus(s: ShoptetStatus): string {
  if (s === "completed") return "completed";
  if (s === "shipped")   return "delivered";
  if (s === "paid")      return "paid";
  return "cancelled";
}

/**
 * Parses a Shoptet order export into orders. Item-level exports are grouped by
 * order code so a single order with N products stays ONE order with N items —
 * never N separate orders.
 */
export function parseShoptetCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 1) {
    return { isItemLevel: false, orders: [], invalidRows: [], missingHeaders: ["empty_csv"], dataRowCount: 0 };
  }

  const delim = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delim);

  // Detect item columns FIRST, then exclude them from order-header detection.
  const colItemCode = findCol(headers, ITEM_HEADER_CANDIDATES.itemCode);
  const colItemName = findCol(headers, ITEM_HEADER_CANDIDATES.itemName);
  const colItemQty = findCol(headers, ITEM_HEADER_CANDIDATES.itemQty);
  const colItemUnitAfterDiscount = findCol(headers, ITEM_HEADER_CANDIDATES.itemUnitPriceAfterDiscount);
  const colItemUnitPlain = findCol(headers, ITEM_HEADER_CANDIDATES.itemUnitPrice);
  const colItemType = findCol(headers, ITEM_HEADER_CANDIDATES.itemType);

  // Confirmed rule: ratio rewards use the real after-discount price. Fall back to
  // the plain unit price only when the export does not carry the discounted one.
  const colItemUnit = colItemUnitAfterDiscount >= 0 ? colItemUnitAfterDiscount : colItemUnitPlain;

  const itemColumnIdx = new Set(
    [colItemCode, colItemName, colItemQty, colItemUnitAfterDiscount, colItemUnitPlain, colItemType].filter((i) => i >= 0),
  );

  // Item-level export = one CSV row per order item, order header data repeated.
  // Without the item code column we stay on the legacy one-row-per-order path.
  const isItemLevel = colItemCode >= 0;

  const colOrder = findCol(headers, HEADER_CANDIDATES.order, itemColumnIdx);
  const colTotal = findCol(headers, HEADER_CANDIDATES.total, itemColumnIdx);
  const colEmail = findCol(headers, HEADER_CANDIDATES.email, itemColumnIdx);
  const colStatus = findCol(headers, HEADER_CANDIDATES.status, itemColumnIdx);

  const missingHeaders: string[] = [];
  if (colOrder < 0) missingHeaders.push("order_code");
  if (colTotal < 0) missingHeaders.push("total");
  if (colEmail < 0) missingHeaders.push("email");

  const dataRows = lines.slice(1);
  if (missingHeaders.length > 0) {
    return { isItemLevel, orders: [], invalidRows: [], missingHeaders, dataRowCount: dataRows.length };
  }

  const orderMap = new Map<string, ImportRow>();
  const orderSequence: string[] = [];
  const invalidRows: Array<{ orderId: string | null }> = [];
  let lastOrderId = "";

  for (const line of dataRows) {
    const cols = parseCsvLine(line, delim);
    let orderId = (cols[colOrder] ?? "").trim();

    // Some item-level exports fill the order header columns only on the first row
    // of each order and leave them blank on continuation rows.
    if (!orderId && isItemLevel && lastOrderId) {
      orderId = lastOrderId;
    }

    const existingOrder = orderId ? orderMap.get(orderId) : undefined;

    if (!existingOrder) {
      const total = parseNumericCell(cols[colTotal] ?? "");
      const customerEmail = (cols[colEmail] ?? "").trim();
      const shoptetStatus: ShoptetStatus = colStatus >= 0 ? mapStatus(cols[colStatus] ?? "") : "pending";

      if (!orderId || !Number.isFinite(total) || total <= 0 || !customerEmail.includes("@")) {
        invalidRows.push({ orderId: orderId || null });
        continue;
      }

      orderMap.set(orderId, { orderId, total, customerEmail, shoptetStatus, items: [] });
      orderSequence.push(orderId);
    }

    lastOrderId = orderId;

    // Append the item carried by this row. Header data on continuation rows is
    // intentionally ignored — the first row of an order wins.
    if (isItemLevel) {
      const target = orderMap.get(orderId)!;
      const code = (cols[colItemCode] ?? "").trim();
      const itemType = colItemType >= 0 ? (cols[colItemType] ?? "") : "";

      if (code && !isNonProductItemType(itemType)) {
        const quantity = colItemQty >= 0 ? parseNumericCell(cols[colItemQty] ?? "") : 1;
        const unitPrice = colItemUnit >= 0 ? parseNumericCell(cols[colItemUnit] ?? "") : 0;
        target.items.push({
          code,
          name: colItemName >= 0 ? (cols[colItemName] ?? "").trim() : "",
          quantity: quantity > 0 ? quantity : 1,
          unit_price_czk: unitPrice,
        });
      }
    }
  }

  return {
    isItemLevel,
    orders: orderSequence.map((id) => orderMap.get(id)!),
    invalidRows,
    missingHeaders,
    dataRowCount: dataRows.length,
  };
}
