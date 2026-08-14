# Prompt Rules – OneMil

## Základní pravidla

- Seed prompt do Lovable: vždy max. 3 body (účel, frontend, databáze).
- Navazující prompty: řeší jen jednu konkrétní funkci nebo část UI.
- Nikdy nenechávat Lovable domýšlet názvy tabulek nebo rout – vše musí být předem určené.
- SQL dotazy: vždy používat `STRING_AGG`, aby výstup šel zkopírovat jako jedna buňka.
- Každý skutečný projektový krok → aktualizace aktuálního stavového souboru + zápis do `onemil_history.md`, pokud jde o významnou změnu systému.
- Integrace s **Sofinity** → posílat všechny eventy (`user_registered`, `voucher_purchased`, `coin_redeemed`, `contest_closed`, `prize_won`).

## Jak připravovat prompty pro Claude Code a Codex

Cíl: co nejméně tokenů/kreditů při zachování přesnosti a bezpečnosti. Prompt nemá opakovat celý kontext projektu, který už je v repozitáři.

### 1. Jeden prompt = jeden skutečný úkol

- Preferuj úzký prompt nad širokým auditem + implementací + deployem najednou.
- Pokud je potřeba diagnostika, nejdřív samostatný read-only krok. Teprve podle výsledku dát změnový prompt.
- Do jednoho promptu neslučovat nesouvisející opravy.
- Když úkol lze vyřešit jednou konkrétní změnou, nepožadovat plošný audit celého projektu.

### 2. Povinná struktura dobrého změnového promptu

Prompt má pokud možno obsahovat jen:

1. **Cíl** – jeden jasný výsledný stav.
2. **Kontext** – pouze soubory/funkce/stav, které jsou pro úkol skutečně relevantní.
3. **Co zachovat** – existující funkční mechanismy, které se nesmí přepisovat nebo duplikovat.
4. **Co změnit** – přesný rozsah zásahu.
5. **Co nesmí dělat** – jen důležitá bezpečnostní a rozsahová omezení.
6. **Ověření** – konkrétní test nebo důkaz, že změna funguje.
7. **Výstup** – stručně vyžádat jen informace, které Pavel potřebuje k rozhodnutí o dalším kroku.

### 3. Neopakovat kontext, který už agent může načíst

- Před promptem odkazuj na aktuální `main` a existující zdroje pravdy místo kopírování dlouhé historie.
- Claude Code má používat `CLAUDE.md` jako trvalé projektové instrukce.
- Codex má nejdřív načíst relevantní dokumentaci a existující implementaci; pokud bude v repozitáři zaveden `AGENTS.md`, používat ho pro trvalá pravidla Codexu.
- Stejnou instrukci uvést jen jednou. Neopakovat ji několika různými formulacemi.
- Nevkládat dlouhé vysvětlení problému, pokud jej lze přesně určit názvem funkce, souboru, commitu, chybou nebo aktuálním stavem.

### 4. Nejdřív ověřit, potom měnit

- Pokud neznáme skutečnou příčinu, prompt musí být `read-only` a nesmí nic opravovat.
- Pokud je příčina ověřená, další prompt už nemá znovu dělat širokou diagnostiku; má řešit pouze potvrzenou příčinu.
- Před změnou ověřit aktuální `origin/main`, aby agent neopravoval zastaralou lokální kopii.
- Při napojování nového mechanismu vždy nejdřív zjistit, zda už stejná funkce v OneMilu existuje. Existující funkční logiku preferovat a neduplikovat.

### 5. Kdy použít plánování

- U jednoduché opravy, dokumentační změny nebo jednoho jasného endpointu nevyžadovat dlouhý plán – agent má rovnou provést omezený úkol.
- U složité migrace, zásahu přes více částí systému, bezpečnostní změny nebo nejasné architektury nejdřív použít plánovací režim.
- Claude Code: pro složité úlohy preferovat jeho Plan mode před neoficiálními triky typu `ultrathink`.
- Codex: u většího úkolu začít plánováním/Ask režimem a teprve po potvrzení rozsahu přejít na změnu.

### 6. Model a spotřeba

- Model ani speciální mód nepřepínat automaticky jen proto, že prompt je delší.
- Silnější/plánovací režim používat jen tam, kde složitost skutečně vyžaduje hlubší návrh.
- Největší úspora má vznikat omezením rozsahu promptu a opakovaného kontextu, ne snižováním kvality ověření.
- `ultrathink` není projektové pravidlo OneMil a nepřidává se automaticky.
- Neopírat workflow o neověřené aliasy typu `OpusPlan`; pokud chce Pavel měnit model/režim, nejdřív ověřit aktuální podporu v používané verzi nástroje.

### 7. Kdy doporučit novou session

Asistent má Pavla sám upozornit, že je vhodnější nová Claude Code/Codex session, když nastane alespoň jedna z těchto situací:

- předchozí větší úkol je dokončený a začíná jiný problém,
- konverzace obsahuje mnoho již neplatných diagnóz a oprav,
- agent začne znovu objevovat už vyřešené věci nebo pracovat proti starému stavu,
- nový úkol se týká jiné části systému a stará historie mu nepomáhá,
- kontext je zjevně tak dlouhý, že prompt musí opakovaně vysvětlovat, co už bylo dokončeno.

Před novou session musí být významný aktuální stav zapsaný v repozitáři (`CLAUDE.md`, relevantní stavový/context soubor a případně `onemil_history.md`), aby nová session nezačínala naslepo.

Pokud aktuální Claude Code verze podporuje bezpečné zkomprimování historie, lze ho použít při pokračování stejného úkolu; pro nový samostatný problém je ale preferovaná nová session.

### 8. Jak má ChatGPT připravovat prompt pro Pavla

- ChatGPT má vždy nejdřív sám využít dostupný GitHub/Supabase konektor a ověřit fakta, která může zjistit bez Pavla.
- Prompt vypisovat jen tehdy, když Pavel opravdu musí něco vložit do Claude Code/Codexu.
- Prompt má být co nejkratší, ale nesmí vynechat hranice, jejichž absence by mohla způsobit chybný nebo nebezpečný zásah.
- Pokud je úkol pokračováním právě dokončeného kroku, nepřepisovat znovu celý předchozí kontext; uvést jen novou skutečnost a požadovaný krok.
- Nežádat agent po každé malé změně o celý `build + lint + všechny E2E testy`; vyžádat nejmenší relevantní testy a širší ověření jen tam, kde je to potřebné.
- Produkční/destruktivní změny (peníze, platby, peněženky, soutěžní logika, RLS, produkční migrace, mazání dat) musí zůstat za výslovným Pavlovým schválením.

## Doporučená šablona pro běžný Codex / Claude Code prompt

Použij ji jen jako strukturu, ne jako text, který se musí celý kopírovat:

- **Cíl:** co má být po dokončení pravda.
- **Ověř:** jen relevantní současný stav.
- **Změň:** přesně vymezený zásah.
- **Neměň:** nejdůležitější okolní funkční části.
- **Otestuj:** nejmenší spolehlivý důkaz.
- **Na konci:** jen informace potřebné pro další rozhodnutí.

## Zdrojové principy

Pravidla výše vycházejí z oficiálních doporučení OpenAI a Anthropic ověřených 12. 8. 2026:

- OpenAI: Codex prompty strukturovat podobně jako GitHub issue – cíl, kontext, omezení a jasná definice hotového výsledku.
- OpenAI: preferovat štíhlejší prompty, každou instrukci uvést jednou a odstraňovat opakovaný/nepotřebný kontext.
- OpenAI: používat `AGENTS.md` pro trvalé instrukce Codexu a spolehlivé testovací postupy.
- Anthropic: `CLAUDE.md` je projektová paměť automaticky načítaná Claude Code; instrukce mají být konkrétní a strukturované.
- Anthropic: u složitých úloh používat plánovací režim namísto spoléhání na neoficiální klíčová slova.