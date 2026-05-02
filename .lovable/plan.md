## Cíl

Sjednotit zakládání nové soutěže do **jednoho kroku** — admin bude moci v záložce **Grafika** přidávat fotky + YouTube videa do galerie hlavní výhry už při zakládání nové soutěže, ne až po jejím prvním uložení.

## Současný stav (proč je to dvoukrokové)

V `src/components/AdminContestManagement.tsx` (řádek ~1805) galerie ukáže:

```tsx
{!editingContest ? (
  <p>Galerii lze spravovat po uložení soutěže.</p>
) : (
  // existing media list + "Add new media" UI
)}
```

Důvod je technický: galerie zapisuje rovnou do tabulky `contest_media` a potřebuje `contest_id` (FK). U nové soutěže žádné `contest_id` ještě neexistuje. Přidávání médií jede přes `supabase.from("contest_media").insert(...)` okamžitě po výběru souboru.

## Návrh řešení — „pending media" buffer

Přidávání médií u **nové soutěže** se buffuje na klientovi a propíše do DB až po vytvoření soutěže (kdy už máme `contestId`). Editace existující soutěže zůstává beze změny (insert hned).

### Změny v `src/components/AdminContestManagement.tsx`

1. **Nový state pro pending položky** (jen u nové soutěže):
   ```ts
   type PendingMedia = {
     id: string;              // temp-uuid
     type: "image" | "video" | "background";
     file: File | null;       // pokud upload
     url: string;             // pokud externí URL nebo YouTube
     sort_order: number;
   };
   const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
   ```

2. **Render galerie i pro novou soutěž** — odstranit „Galerii lze spravovat po uložení soutěže." Místo toho ukázat:
   - Stejné UI pro výběr typu (image / video / background) + soubor / URL + sort_order.
   - Seznam médií složený z `editingContest ? galleryMedia : pendingMedia` (a pro existující soutěž i nadále z DB).
   - Tlačítko Smazat u pending položky odmaže jen z lokálního pole.

3. **Upravit `handleAddMedia`** — větvit podle existence `contestId`:
   - **Existující soutěž**: stávající chování (upload do `contest-images` + insert do `contest_media`).
   - **Nová soutěž**: nepoužít DB. Soubor držet jako `File` v `pendingMedia` (lokálně), URL jen uložit jako string. Upload na storage proběhne až po vytvoření soutěže (krok 5).

4. **Pravidlo „jeden background"** — vynutit i v pending bufferu (před přidáním nového typu `background` smazat existující pending background).

5. **Po úspěšném vytvoření soutěže** v hlavním save handleru (po obdržení `contestId` z RPC `admin_manage_contest`, řádek ~1185):
   ```ts
   for (const item of pendingMedia) {
     let url = item.url;
     if (item.file) {
       url = await uploadGalleryFile(item.file); // contest-images bucket
     }
     await supabase.from("contest_media").insert({
       contest_id: contestId,
       type: item.type,
       url,
       sort_order: item.sort_order,
     });
   }
   setPendingMedia([]);
   ```
   - Při chybě některé položky pokračovat dál (toast s počtem úspěšných / neúspěšných), aby se nezablokovalo dokončení jinak úspěšného create.

6. **Draft persistence** — `pendingMedia` neukládat do `localStorage` jako `File` (Files nejdou serializovat). Ukládat jen URL položky, položky se souborem se po reloadu neobnoví (uživatel je musí přidat znovu). Tohle je konzistentní s tím, jak se to dělá s `main_image_file` / `banner_image_file` (taky se nezachovávají v draftu).

7. **Reset pending médií** ve stejných místech, kde se reset uje formulář (`clearDraft`, po úspěšném create, při zavření modálu novou soutěží).

## Co se NEMĚNÍ

- Žádná DB migrace ani změna schématu `contest_media`.
- Žádná změna RLS, RPC `admin_manage_contest`, walletu, ticketové ekonomiky.
- Beze změny zůstává editace existujících soutěží — galerie se tam nadále ukládá okamžitě (jako dnes).
- Beze změny zůstávají pravidla pro 3 hlavní obrázky (main / detail / banner) a předchozí oprava bucketu pro banner (`contest-banners`) — ta zůstává součástí stejné „cleanup" iterace.

## Test po nasazení

1. Otevřít „Vytvořit novou soutěž", vyplnit povinná pole, v záložce Grafika nahrát 3 hlavní obrázky **a** přidat 2 fotky + 1 YouTube video do galerie.
2. Kliknout Vytvořit soutěž.
3. Ověřit:
   - Soutěž je založená s `contestId`.
   - V `contests` tabulce sedí `main_image`, `main_prize_secondary_image`, `banner_image`.
   - V `contest_media` jsou 3 řádky pro tuto soutěž (2 image + 1 video).
4. Otevřít detail soutěže jako zákazník — galerie ukazuje vše, video se přehrává.
5. Otevřít soutěž v adminu (edit) — galerie načte všech 6 položek (3 hlavní + 3 v `contest_media`).
