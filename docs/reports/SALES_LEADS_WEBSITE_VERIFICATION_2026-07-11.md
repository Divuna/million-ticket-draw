# Sales Leads — benchmark ověřování firemních webů (11. 07. 2026)

Read-only běh stejného verifieru jako `sales-lead-discover` nad 30 reálnými českými firmami z e-commerce, sportu, knih, lékáren, nábytku, hobby, elektroniky, auto-moto a FMCG. Benchmark nic nezapisoval do databáze a nehledal ani neodesílal e-maily.

## Výsledek

- prověřeno: **30**
- potvrzeno: **11**
- zamítnuto / ponecháno bez webu: **19**
- kanonická URL opravena po bezpečném přesměrování: **2** (`Footshop` → `/cs/`, `CZC` → doména bez `www`)
- falešně uložený web: **0**

Nejčastější bezpečný důvod zamítnutí byl HTTP/content failure (typicky Cloudflare/WAF 403). V takovém případě systém záměrně uloží firmu s `website=NULL`; znalost značky ani návrh AI tuto bariéru nepřebíjí.

## Jednotlivé výsledky

| Firma | Kandidát | Výsledek | Důvěra | Důvod |
|---|---|---:|---:|---|
| Alza.cz a.s. | alza.cz | zamítnuto | 0 % | HTTP/content failure |
| Notino s.r.o. | notino.cz | zamítnuto | 0 % | HTTP/content failure |
| DATART INTERNATIONAL, a.s. | datart.cz | zamítnuto | 0 % | identita nepotvrzena |
| SPORTISIMO s.r.o. | sportisimo.cz | zamítnuto | 0 % | HTTP/content failure |
| DECATHLON s.r.o. | decathlon.cz | zamítnuto | 0 % | HTTP/content failure |
| Knihy Dobrovský s.r.o. | knihydobrovsky.cz | potvrzeno | 95 % | obchodní jméno + oficiální marker |
| Martinus.cz, spol. s r.o. | martinus.cz | zamítnuto | 0 % | identita nepotvrzena |
| Pilulka Lékárny a.s. | pilulka.cz | zamítnuto | 0 % | HTTP/content failure |
| VELKÁ PECKA s.r.o. | rohlik.cz | zamítnuto | 0 % | HTTP/content failure |
| Košík.cz s.r.o. | kosik.cz | zamítnuto | 0 % | prázdný obsah |
| Bonami.cz, a.s. | bonami.cz | potvrzeno | 95 % | obchodní jméno + oficiální marker |
| Footshop a.s. | footshop.cz → `/cs/` | potvrzeno | 95 % | bezpečné přesměrování + identita |
| SCONTO Nábytek s.r.o. | sconto.cz | zamítnuto | 0 % | HTTP/content failure |
| XLCZ Nábytek s.r.o. | xxxlutz.cz | zamítnuto | 0 % | HTTP/content failure |
| Mountfield a.s. | mountfield.cz | zamítnuto | 0 % | HTTP/content failure |
| HORNBACH BAUMARKT CS spol. s r.o. | hornbach.cz | zamítnuto | 0 % | HTTP/content failure |
| BAUHAUS k.s. | bauhaus.cz | potvrzeno | 100 % | IČO + oficiální marker |
| T.S.BOHEMIA a.s. | tsbohemia.cz | zamítnuto | 0 % | HTTP/content failure |
| CZC.cz s.r.o. | www.czc.cz → czc.cz | potvrzeno | 95 % | bezpečné přesměrování + identita |
| Megapixel s.r.o. | megapixel.cz | zamítnuto | 0 % | identita nepotvrzena |
| ForCamping s.r.o. | 4camping.cz | potvrzeno | 95 % | obchodní jméno + oficiální marker |
| ASTRATEX a.s. | astratex.cz | potvrzeno | 95 % | obchodní jméno + oficiální marker |
| GRIZLY.CZ s.r.o. | grizly.cz | zamítnuto | 0 % | HTTP/content failure |
| Manutan s.r.o. | manutan.cz | potvrzeno | 100 % | IČO + oficiální marker |
| Česká lékárna holding, a.s. | drmax.cz | zamítnuto | 0 % | HTTP/content failure |
| BENU Česká republika s.r.o. | benu.cz | zamítnuto | 0 % | HTTP/content failure |
| AUTO JAROV, s.r.o. | autojarov.cz | potvrzeno | 95 % | obchodní jméno + oficiální marker |
| Auto Palace Spořilov s.r.o. | autopalace.cz | potvrzeno | 100 % | IČO + oficiální marker |
| Kofola ČeskoSlovensko a.s. | kofola.cz | potvrzeno | 100 % | IČO + oficiální marker |
| Růžový slon s.r.o. | ruzovyslon.cz | zamítnuto | 0 % | prázdný obsah |

## Staging DB pojistka

Transakční test vložil AI lead s podvrženým `https://wrong.example` bez ověřovacího důkazu. Trigger před zápisem změnil výsledek na `website=NULL`, `website_verification_status='neovereny'`, `website_confidence=0`. Transakce byla vrácena rollbackem; testovací data nezůstala.
