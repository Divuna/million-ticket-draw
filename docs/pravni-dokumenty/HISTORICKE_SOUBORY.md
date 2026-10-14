# Historické právní soubory — NEAUTORITATIVNÍ

Soubory níže **zůstávají na svých místech**, protože je nelze bezpečně přesunout ani smazat, dokud
není jasné, kdo na ně odkazuje. Pro AI i pro člověka ale platí:

> **Z těchto souborů se nesmí čerpat aktuální právní znění a nesmí sloužit jako šablona.**
> Autoritativní je výhradně `docs/pravni-dokumenty/`.

Zjištěno read-only auditem 7. 9. 2026 na `main` `5b19bfec`.

---

## Právní PDF v kořeni repozitáře

Všechna tři vznikla jedním commitem `3e6886a9` (1. 5. 2026) a jsou to exporty tehdejšího CMS textu.

| Soubor | md5 (12) | Velikost | Obsah |
|---|---|---|---|
| `OneMil_Pravidla_souteze.pdf` | `10f72c01510c` | 3 330 B | **šablona s nevyplněnými placeholdery** |
| `OneMil_VOP.pdf` | `937c591a0cab` | 2 566 B | shodné s CMS `legal/vop` |
| `OneMil_GDPR_FINAL.pdf` | `2190268c16f3` | 3 937 B | shodné s CMS `legal/gdpr` |

### ⚠️ `OneMil_Pravidla_souteze.pdf` — vážný nález

Extrahovaný text obsahuje doslova:

```
2. Název soutěže
[NÁZEV SOUTĚŽE]

3. Doba trvání
Soutěž probíhá od [DATUM] do [DATUM] nebo do vyprodání všech ticketů.
```

Tentýž soubor (shodné md5 `10f72c01510c`) je zároveň nahraný jako `rules_pdf_url` u **všech**
produkčních soutěží, které PDF mají — u obou aktivních i u čekajících. Znamená to, že závazná
pravidla, která dnes zákazník u soutěže otevře, jsou **nevyplněná šablona**.

Ochrana z 7. 9. 2026 (`trg_contest_active_requires_rules_pdf`) hlídá, že PDF **existuje** — ne že
je správné. Tenhle nález se jí tedy neřeší a zůstává otevřený.

Kvůli tomu vznikla [`SABLONA_PRAVIDEL_SOUTEZE.md`](SABLONA_PRAVIDEL_SOUTEZE.md): každá soutěž musí
mít vlastní vyplněná pravidla, ne sdílený generický soubor.

## Duplicitní kopie

| Soubor | Poznámka |
|---|---|
| `test grafika/OneMil_Pravidla_souteze.pdf` | **byte-identická kopie** kořenového PDF (`10f72c01510c`), přidaná commitem `5e6c5e5f` (21. 5. 2026). Není to jiná verze, jen zapomenutá kopie v pracovní složce. |

## Auditní dokumenty — ne právní znění

Následující zůstávají v `docs/launch-readiness/` a jsou **záměrně** neautoritativní pro znění:

- `LEGAL_REVIEW_PACKET.md`
- `OWNER_LEGAL_DECISION_SHEET.md`
- `L03_GDPR_ADMIN_EDITABILITY.md`
- `LAUNCH_TODO.md`

Popisují, co se našlo a co je potřeba schválit. **Nikdy nepopisují, co právně platí.**

## Ostatní

| Soubor | Poznámka |
|---|---|
| `docs/advertising/LEGAL_WORDING_DO_DONT.md` | pravidla veřejné terminologie pro reklamu (zákaz „casino / hazard / sázení / jackpot" apod.). Není to právní znění, ale **závazné pravidlo formulací** — zůstává v platnosti. |

---

## Co s nimi dál

Přesun nebo smazání kořenových PDF je **samostatný krok** a vyžaduje schválení Pavla: nejdřív se
musí ověřit, že na ně neodkazuje žádná stránka, e-mail ani externí odkaz. Do té doby zůstávají
tam, kde jsou, označené tímto dokumentem.
