/**
 * Jediný zdroj service-role klíče pro všechny Edge Functions.
 *
 * OneMil už nečte legacy secret `SUPABASE_SERVICE_ROLE_KEY`. Každý
 * server-side Supabase klient musí projít tímto helperem, který čte nový
 * secret `SUPABASE_SECRET_KEYS` (JSON slovník) a vrátí položku "default":
 *
 *   SUPABASE_SECRET_KEYS = { "default": "sb_secret_..." }
 *
 * Záměrně NEEXISTUJE fallback na `SUPABASE_SERVICE_ROLE_KEY` — chybějící
 * nebo poškozený `SUPABASE_SECRET_KEYS` musí funkci bezpečně shodit chybou,
 * ne tiše sklouznout na starý (potenciálně rotovaný/zneplatněný) klíč.
 *
 * Samotná hodnota klíče se nikdy nikam neloguje — chybové zprávy popisují
 * jen DRUH problému (chybí env var / neplatný JSON / chybí klíč "default"),
 * nikdy obsah `SUPABASE_SECRET_KEYS`.
 */

const SECRET_KEYS_ENV_VAR = "SUPABASE_SECRET_KEYS";
const DEFAULT_SECRET_KEY_NAME = "default";

/** Vyhozena, když SUPABASE_SECRET_KEYS chybí, je neplatné, nebo nemá požadovaný klíč. */
export class MissingSupabaseSecretKeyError extends Error {
  constructor(reason: string) {
    // `reason` smí popisovat jen DRUH chyby, nikdy obsah env var ani klíč samotný.
    super(`Supabase secret key unavailable: ${reason}`);
    this.name = "MissingSupabaseSecretKeyError";
  }
}

/**
 * Vrátí hodnotu pojmenovaného klíče z `SUPABASE_SECRET_KEYS` (výchozí:
 * "default"). Vyhodí `MissingSupabaseSecretKeyError`, pokud env var chybí,
 * není platný JSON, není objekt, nebo daný klíč neobsahuje neprázdný
 * řetězec. Nikdy nespadne zpět na `SUPABASE_SERVICE_ROLE_KEY`.
 */
export function getSupabaseSecretKey(keyName: string = DEFAULT_SECRET_KEY_NAME): string {
  const raw = Deno.env.get(SECRET_KEYS_ENV_VAR);

  if (!raw) {
    throw new MissingSupabaseSecretKeyError(`${SECRET_KEYS_ENV_VAR} is not set`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // `raw` se sem záměrně nedává — je to obsah secretu.
    throw new MissingSupabaseSecretKeyError(`${SECRET_KEYS_ENV_VAR} is not valid JSON`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new MissingSupabaseSecretKeyError(`${SECRET_KEYS_ENV_VAR} must be a JSON object`);
  }

  const value = (parsed as Record<string, unknown>)[keyName];
  if (typeof value !== "string" || value.length === 0) {
    throw new MissingSupabaseSecretKeyError(`${SECRET_KEYS_ENV_VAR} has no non-empty "${keyName}" key`);
  }

  return value;
}

/**
 * Service-role ekvivalent pro server-side Supabase klienty. Alias pro
 * `getSupabaseSecretKey("default")` — čitelnější název v místech volání,
 * které dřív četly `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`.
 */
export function getSupabaseServiceRoleKey(): string {
  return getSupabaseSecretKey(DEFAULT_SECRET_KEY_NAME);
}
