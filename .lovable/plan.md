## Co je špatně u soutěže `e594d0bd-56d1-4192-abe6-138c54b09f40`

Zkontroloval jsem DB:

- `main_image` ✅ uložen
- `main_prize_secondary_image` ❌ **NULL** (Detailní obrázek se neuložil)
- `banner_image` ❌ **NULL** (Banner se neuložil)
- `contest_media` ❌ **0 řádků** (žádná galerie, žádné pozadí)

Soutěž vznikla, ale 5 ze 6 grafik se ztratilo. Toast „chyby při vytváření" pochází z bloku flush galerie, když insert do `contest_media` selže.

## Tři reálné příčiny

### 1. Tabulka `contest_media` nemá ŽÁDNOU RLS policy

RLS je zapnuté, ale nula policies → každý INSERT z klienta vrací `permission denied`. Proto se galerie (vč. pozadí) **nikdy** neuloží — bug existoval celou dobu a tichoval. Tohle je hlavní příčina.

### 2. Detail + Banner se ukládají pouze pokud `form.detail_image_file` / `form.banner_image_file` jsou v `form` stavu

V handleru je:
```ts
if (form.detail_image_file) { ... upload ... }
if (form.banner_image_file) { ... upload ... }
```
Žádná validace, že soubor existuje. Když je `null`, prostě se to **tiše přeskočí** bez toast/warningu.

### 3. Galerie typu „Pozadí" — soubor zmizí když user neklikne „Přidat do galerie"

UI má samostatný file input pro pozadí. Když user vybere soubor a rovnou klikne „Vytvořit soutěž" (místo „Přidat do galerie"), soubor se nikam neuloží — žádný auto-add.

## Plán opravy

### Krok 1 — SQL migrace: RLS policies na `contest_media`

```sql
ALTER TABLE public.contest_media ENABLE ROW LEVEL SECURITY;

-- Public read (potřeba pro ContestDetail)
CREATE POLICY "contest_media_public_select"
  ON public.contest_media FOR SELECT
  TO anon, authenticated USING (true);

-- Admin write/update/delete
CREATE POLICY "contest_media_admin_insert"
  ON public.contest_media FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
           OR public.has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "contest_media_admin_update"
  ON public.contest_media FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "contest_media_admin_delete"
  ON public.contest_media FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'superadmin'::app_role));

GRANT SELECT ON public.contest_media TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.contest_media TO authenticated;
```

### Krok 2 — Frontend: `src/components/AdminContestManagement.tsx`

- **Auto-flush** vybraného souboru/URL z formuláře „Přidat nové médium" do galerie těsně před Save — aby se neztratil když user neklikne explicitně „Přidat do galerie". Funguje pro typy `image`, `background` i `video`.
- **Konkrétní DB error message** v toastu když selže flush galerie (místo obecného „Galerie částečně uložena").
- **Toast** když selže update detail/banner v `additionalUpdates` (dnes jen `console.error` = tichá ztráta).
- (Volitelně) Warning toast při vytváření, když chybí detail nebo banner — neblokující, jen aby admin viděl, že to bylo prázdné.

### Krok 3 — Oprava existující soutěže `e594d0bd…`

Po nasazení Krok 1+2: otevřít tu soutěž v adminu (Edit), znovu nahrát detail + banner + položky galerie. Tentokrát to projde, protože RLS bude povolovat insert.

## Co se NEMĚNÍ

- Žádná změna `contests` schématu, RPC `admin_manage_contest`, `buy_ticket_atomic`, walletu, ticketové ekonomiky.
- Žádná změna existujících RLS policies — jen se **doplní** chybějící na `contest_media`.
- Žádná změna `ContestDetail.tsx` (customer side).

## Soubory k úpravě

- `supabase/migrations/20260502_contest_media_rls_policies.sql` — nový (Krok 1)
- `src/components/AdminContestManagement.tsx` — Krok 2

## Test po nasazení

1. Aplikovat SQL migraci.
2. Vytvořit testovací soutěž, nahrát všechny 3 hlavní obrázky + 2 položky galerie (1× pozadí, 1× YouTube).
3. Ověřit v DB: všechna 3 image pole vyplněná, `contest_media` má 2 řádky.
4. Otevřít detail soutěže jako customer — pozadí se aplikuje, video je v galerii.
5. Pokud cokoli selže, toast ukáže konkrétní chybu z DB.
