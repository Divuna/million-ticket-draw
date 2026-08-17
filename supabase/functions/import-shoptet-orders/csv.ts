// Single Shoptet CSV parser, shared by every function that needs it.
//
// The implementation lives in `../_shared/shoptetCsv.ts` so that other Edge
// Functions (e.g. submit-shoptet-connection) can import it without depending on
// a sibling function folder. This file stays as the stable import path used by
// import-shoptet-orders and the Playwright specs — never re-implement the logic.
export * from "../_shared/shoptetCsv.ts";
