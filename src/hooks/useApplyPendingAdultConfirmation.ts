import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Potvrzení věku 18+ při registraci.
 *
 * Ukládá se do EXISTUJÍCÍHO mechanismu souhlasů `user_legal_acceptances`
 * (stejná tabulka jako VOP / GDPR / marketing) — nezavádí se žádný paralelní
 * systém. Řádek s tímto `document_slug` = uživatel potvrdil, že mu bylo 18 let:
 *   - `adult_confirmed = true`  → existence řádku se slugem ADULT_CONFIRMATION_SLUG
 *   - čas potvrzení             → sloupec `accepted_at` (DEFAULT now())
 *   - verze potvrzovaného textu → sloupec `document_version`
 *
 * Bezpečnost (dáno RLS na `user_legal_acceptances`, beze změny):
 *   - INSERT má `WITH CHECK (auth.uid() = user_id)` → zápis je vždy svázaný
 *     s konkrétním přihlášeným uživatelem; nikdo nemůže vytvořit potvrzení
 *     za jiného uživatele,
 *   - tabulka nemá žádnou UPDATE ani DELETE policy → potvrzení nelze přepsat
 *     ani smazat (ani vlastní, ani cizí).
 */

/** Slug v `user_legal_acceptances` reprezentující potvrzení 18+. */
export const ADULT_CONFIRMATION_SLUG = 'adult-confirmation';

/** Verze potvrzovaného textu (měnit při každé změně znění níže). */
export const ADULT_CONFIRMATION_VERSION = '1.0';

/** Přesné znění, které uživatel potvrzuje — odpovídá verzi výše. */
export const ADULT_CONFIRMATION_TEXT = 'Potvrzuji, že mi bylo 18 let.';

/**
 * Marker přežívající přesměrování k OAuth poskytovateli a zpět.
 * Záměrně localStorage (ne sessionStorage) — přesměrování na Google / Apple /
 * Facebook a návrat nesmí potvrzení ztratit.
 */
export const PENDING_ADULT_CONFIRMATION_KEY = 'onemil_adult_confirmation_pending';

/** Označí, že uživatel potvrdil 18+ a zápis se má provést po přihlášení. */
export function markAdultConfirmationPending(): void {
  try {
    localStorage.setItem(PENDING_ADULT_CONFIRMATION_KEY, ADULT_CONFIRMATION_VERSION);
  } catch {
    // storage může být nedostupné (private mode) — zápis pak proběhne přímo po signUp
  }
}

function clearAdultConfirmationPending(): void {
  try {
    localStorage.removeItem(PENDING_ADULT_CONFIRMATION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Idempotentně zapíše potvrzení 18+ pro daného uživatele.
 * Pokud už řádek existuje, nic nevkládá (žádné duplicity).
 */
export async function recordAdultConfirmation(
  userId: string,
  version: string = ADULT_CONFIRMATION_VERSION,
): Promise<void> {
  const { data: existing } = await supabase
    .from('user_legal_acceptances')
    .select('id')
    .eq('user_id', userId)
    .eq('document_slug', ADULT_CONFIRMATION_SLUG)
    .limit(1)
    .maybeSingle();

  if (existing) return;

  await supabase.from('user_legal_acceptances').insert({
    user_id: userId,
    document_slug: ADULT_CONFIRMATION_SLUG,
    document_version: version,
  });
}

/**
 * Po přihlášení (typicky návrat z OAuth) uloží čekající potvrzení 18+.
 * Volá se jednou, jakmile je znám `userId`. Zápis je vždy vázaný na
 * přihlášeného uživatele — samotný klientský checkbox nestačí.
 */
export function useApplyPendingAdultConfirmation(userId: string | undefined): void {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!userId || appliedRef.current) return;

    let pending: string | null = null;
    try {
      pending = localStorage.getItem(PENDING_ADULT_CONFIRMATION_KEY);
    } catch {
      return;
    }
    if (!pending) return;

    appliedRef.current = true;

    (async () => {
      try {
        await recordAdultConfirmation(userId, pending || ADULT_CONFIRMATION_VERSION);
        clearAdultConfirmationPending();
      } catch {
        // non-blocking; marker zůstane a zápis se zkusí při příštím načtení
        appliedRef.current = false;
      }
    })();
  }, [userId]);
}
