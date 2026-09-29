/**
 * Najde auth uživatele podle e-mailu přes Admin API se stránkováním.
 *
 * `auth.admin.listUsers()` vrací jen jednu stránku (výchozí 50, maximálně 1000
 * záznamů). Dřívější volání četla jen první stránku, takže nad 1000 účtů by
 * existující uživatel nebyl nalezen (pozvání subadmina / schválení firmy by
 * selhalo s „user not found by email“). Tady se prochází stránka po stránce,
 * dokud se uživatel nenajde nebo dokud nepřijde neúplná stránka.
 *
 * Porovnání e-mailu je bez ohledu na velikost písmen. Nic neloguje.
 */

export interface AuthAdminListClient {
  auth: {
    admin: {
      listUsers(params: { page: number; perPage: number }): Promise<{
        data: { users: Array<{ id: string; email?: string | null }> } | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export async function findAuthUserIdByEmail(
  client: AuthAdminListClient,
  email: string,
  perPage = 1000,
  maxPages = 200,
): Promise<string | null> {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === wanted);
    if (found) return found.id;
    if (users.length < perPage) return null;
  }
  throw new Error("listUsers failed: page limit reached");
}
