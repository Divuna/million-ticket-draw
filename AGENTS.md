# AGENTS.md — provozní pravidla pro AI pracovníky OneMil

Platí pro **všechny** AI pracovníky na tomto repozitáři (Codex, Cursor, Claude Code a další,
kteří tento soubor podporují). Stejná závazná pravidla jsou i v `CLAUDE.md` a `.cursorrules` —
jsou to tři kopie téhož, ne tři různé režimy.

Tento soubor **není** nový znalostní systém. Je to jen provozní pravidlo, které odkazuje na
existující zdroje pravdy. Nezakládej další kontextové, stavové ani business soubory.

---

## 1. Co si načíst PŘED zahájením práce (povinné)

Vždy, ještě před první změnou:

- **`onemil_state.md`** — aktuální skutečný stav systému: co je hotové, co je nasazené, co je
  otevřené. Autoritativní pro současný provoz.
- **`ONEMIL_BUSINESS_CONTEXT.md`** — jediný hlavní obchodní a produktový zdroj pravdy
  (B2B model, partneři, MioCoiny, soutěže, influenceři, agentury).
- **`CLAUDE.md`** — trvalé technické a bezpečnostní invarianty, které nesmíš porušit.

Podle potřeby dále:

- **`onemil_history.md`** — historie, dřívější rozhodnutí a kontext (proč je něco tak, jak to je).
- `COMPANY_CONTEXT.md`, `PAPERCLIP_SETUP_CONTEXT.md`, `.cursor/SYSTEM_MAP.md`,
  `.cursor/PROJECT_CONTEXT.md` — když je téma vyžaduje.

Pokud si starší dokumentace odporuje, platí `onemil_state.md` a **skutečný stav ověřený**
v GitHubu / Supabase / v produkci. Neopisuj tvrzení, která sis neověřil.

---

## 2. POVINNÉ UZAVŘENÍ KAŽDÉHO DOKONČENÉHO ÚKOLU

**Po každé skutečně dokončené, ověřené a mergnuté změně musíš ještě před ukončením práce
zkontrolovat, zda změna ovlivnila dokumentaci projektu.**

Pokud ano, aktualizuj **ve stejném pracovním toku** existující zdroje pravdy:

- **`onemil_state.md`** — aktuální skutečný stav systému: co je hotové, co je nasazené a co
  zůstává otevřené.
- **`onemil_history.md`** — stručný historický záznam dokončené práce, důležitých rozhodnutí,
  oprav a nalezených problémů.
- **`CLAUDE.md`** — **pouze** nové trvalé technické nebo bezpečnostní invarianty, které musí
  znát budoucí AI pracovníci.
- **`ONEMIL_BUSINESS_CONTEXT.md`** — **pouze** pokud vznikla nebo byla Pavlem potvrzena nová
  obchodní, produktová, partnerská nebo marketingová skutečnost.

### Pravidla

- **Neaktualizuj dokumentaci mechanicky po každé malé změně.** Jen tehdy, když se změnil
  skutečný stav, chování systému, architektura, produktové pravidlo, bezpečnostní invariant,
  nebo vznikl důležitý otevřený problém.
- **Nikdy nevytvářej nový podobný state/context/business soubor** bez výslovného schválení Pavla.
- **`ONEMIL_BUSINESS_CONTEXT.md` zůstává jediný hlavní obchodní a produktový zdroj pravdy.**
- **Historické záznamy nepřepisuj tak, aby se měnila historie.** Nové skutečnosti přidávej jako
  novější stav; starý zápis byl v době vzniku pravdivý.
- **Dokumentace musí popisovat pouze skutečně ověřený stav**, ne plán ani domněnku.
- **Pokud změna ještě není nasazená, musí být jasně označená jako nenasazená.**
- **Pokud existuje otevřený problém, který se nemá právě opravovat, zaznamenej ho jako
  `OPEN ISSUE`** — včetně toho, co přesně je špatně a co by oprava obnášela.
- **Dokumentační aktualizace je součástí definice „hotovo“.** Úkol není kompletně uzavřený,
  dokud tato kontrola neproběhne.

### Praktická kontrola na konci úkolu

Polož si tyto otázky. Pokud je odpověď na kteroukoli „ano“, dokumentaci aktualizuj:

1. Změnilo se, co je nasazené nebo jak se systém reálně chová?
2. Vznikl nový trvalý invariant, který by budoucí agent mohl omylem porušit?
3. Potvrdil Pavel novou obchodní nebo produktovou skutečnost?
4. Našel jsem problém, který teď vědomě neopravuji?

---

## 3. Co pravidlo NEMĚNÍ

Zůstávají v platnosti všechna dosavadní pravidla z `CLAUDE.md` a `.cursorrules`, zejména:
produkční migrace, změny RLS, zásahy do peněženek, plateb a soutěžní logiky a destruktivní
operace nad produkčními daty **vyžadují výslovné schválení Pavla**. Uzavření dokumentace tato
omezení nijak neobchází.
