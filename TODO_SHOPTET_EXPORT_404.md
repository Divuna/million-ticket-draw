# Shoptet export 404 — dočasný pracovní záznam

Aktuální problém k dořešení v novém chatu:

- Partner testovacího e-shopu: `eshop2@onemil.cz`
- Partner ID: `2f707490-f599-44c1-b802-b7ee7ff87501`
- Shoptet: `809915.myshoptet.com`
- Shoptet napojení v OneMilu je aktivní, import je zapnutý, reward trigger je `paid`, reward mode `whole_shop`, konverze 100 Kč = 3,7 MioCoinu.
- OneMil import opakovaně končí `fetch_failed_http_404`.
- Ověřeno: OneMil URL při submit/approve nijak nemění. Vault ji uchová a importer ji jen načte a zavolá.
- Ověřeno: stejný importní systém ve stejné produkci funguje pro BOHEMIA, takže problém není obecně v importu OneMilu.
- Shoptet sám generuje permanentní odkaz pro režim `Jen nové nebo změněné` jako `ordersFeed.csv`, ale tento odkaz vrací 404 i při přímém otevření v anonymním prohlížeči.
- Zabezpečení exportu `onemil` je v Shoptetu aktivní (zeleně).
- Vlastní typ exportu `OneMil - CSV` existuje.
- Při kontrole šablony bylo zjištěno, že sekce `Obsažené sloupce` byla prázdná (`Žádné položky`). To je nyní hlavní podezření, proč feed nefunguje / nemá co exportovat.

Co už bylo v šabloně doplněno:
- Skupina `Objednávka`: `Kód`, `Status` — uživatel potvrdil uložení.

Co se má doplnit dál, ale po jednom kroku:
- `Celková cena objednávky`: vybrat správné pole pro celkovou cenu objednávky — přesný název zatím nehádat, nechat uživatele ukázat nabídku vlastností.
- `Základní informace o zákazníkovi`: vybrat skutečný e-mail zákazníka.
- `Položky objednávky`: podle aktuálního parseru OneMil jsou relevantní `typ`, `název`, `množství`, `kód`, `cena s daní za jednotku po slevě`; tyto položky jsou potřeba pro produktová pravidla a odměny za vybrané produkty.

Důležité:
- Nic nemaž v produkci a nevydávej ručně MioCoiny bez výslovného schválení.
- Nehádej názvy polí v Shoptetu. Vždy nechat uživatele ukázat dostupné vlastnosti a zvolit přesnou položku podle aktuálního OneMil parseru.
- Po dokončení šablony znovu vygenerovat / otevřít permanentní odkaz, ověřit že už nevrací 404, potom teprve znovu spustit / ověřit import objednávky.
- Pokud se endpoint stále vrací 404 i po správně vyplněné šabloně, pokračovat diagnostikou přes Shoptet `Přístupový log` a detail exportní šablony; nic v OneMilu neměnit bez důkazu.

Poslední dokončený krok před přechodem do nového chatu:
- `Objednávka -> Kód` a `Objednávka -> Status` byly v šabloně uloženy.
- Další krok: otevřít skupinu `Celková cena objednávky` a podle zobrazených vlastností určit správné pole pro celkovou cenu.
