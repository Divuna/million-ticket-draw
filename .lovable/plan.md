# Proč admin nevidí zprávy

`src/pages/AdminMessages.tsx` má dva filtry, které schovávají většinu konverzací:

1. **Řádky 163–166**: pokud thread nemá ani jeden `admin` řádek s přesným obsahem `SUPPORT REQUEST` (tzv. marker, který vkládá edge function `support-handoff` po kliknutí na CTA „Předat podpoře"), thread se z výpisu vyhodí (`return null`).
2. **Řádky 214–220**: zobrazí se pouze `support_active` thready (poslední marker, po kterém ještě nepřišla žádná „nemarkerová" admin odpověď).

Z DB ověřeno:
- Uživatel `c23507eb…` má 10 zpráv, 0 markerů → admin ho nevidí.
- Uživatel `3d7a6784…` má 295 zpráv, 0 markerů → admin ho nevidí.
- Partneři a influenceři (`PartnerMessages.tsx`, `InfluencerMessages.tsx`) nikdy `support-handoff` nevolají → jejich konverzace v admin výpisu **nikdy** nejsou, ani staré doručené.

RLS i grants pro `messages` jsou v pořádku (`authenticated` má `arwdDxtm`, `messages_select_admin` přes `user_roles`). Insert/select funguje, je to čistě UI filtr.

# Co změnit

Pouze `src/pages/AdminMessages.tsx` — žádná DB, RLS, RPC, edge function ani jiný soubor.

1. Odstranit „marker required" guard (řádky 163–166) — thread se vytvoří pro každého uživatele, který má aspoň jednu zprávu.
2. Pole `support_active` a `support_active_at` ponechat, ale počítat je defenzivně (když markery nejsou, `support_active = false`, `support_active_at = null`). Stávající červený „Support" badge a řazení podle support_active tak dál fungují u skutečných tiketů.
3. Místo `activeSupport` (jen support_active) renderovat **všechny** thready. Řadit:
   - nejdřív `support_active` (nejstarší marker první — beze změny),
   - pak zbytek podle stávající `baseSorted` heuristiky (unread + role + datum).
4. Empty-state text upravit z „Žádné otevřené požadavky na podporu." na „Žádné zprávy."

Co se nemění: RLS, grants, `support-handoff`, `ai-chat`, marker logika v `useUnreadMessagesCount`, partner/influencer flow, realtime subscription, role badge styly, červený support badge pro `support_active`.

# Dopady

- Admin uvidí konverzace všech uživatelů (i čistě AI chaty), partnerů a influencerů, včetně starých.
- Otevřené support tikety (`support_active`) zůstávají červené a nahoře.
- Žádné změny v databázi ani v jiných stránkách.

Po schválení přepnu do build módu a změnu provedu.
