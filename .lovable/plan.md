
# Plán: Přepsání dokumentace API do správného Markdown formátu

## Zjištěný problém

Obsah dokumentace v databázi (`settings.partner_api_documentation`) je psán jako **prostý text**, nikoliv jako Markdown. Renderer v kódu je již správně nastaven pro Markdown, ale nemá co zobrazit, protože:

- Nadpisy jsou psané jako `1. K čemu slouží...` místo `## 1. K čemu slouží...`
- Seznamy nemají odrážky (`-`) ani čísla (`1.`, `2.`)
- Kódové bloky nejsou obaleny značkami `` ``` ``

## Řešení

Aktualizuji hodnotu v tabulce `settings` (klíč `partner_api_documentation`) na správně strukturovaný Markdown text.

## Změny obsahu

### Před (prostý text):
```text
1. K čemu slouží OneMil API

OneMil API slouží k připsání...
```

### Po (Markdown):
```text
## 1. K čemu slouží OneMil API

OneMil API slouží k připsání...

## 2. Jak OneMil funguje v praxi

1. Zákazník dokončí objednávku v e-shopu
2. Váš systém zavolá OneMil API
3. OneMil připíše MioCoiny zákazníkovi

## 6. Ukázkový request

### Endpoint

`POST /api/partner/issue-miocoins`

### Body požadavku

```json
{
  "order_id": "OBJ-123456",
  "customer_email": "zakaznik@email.cz",
  "amount": 100
}
```
```

## Co bude změněno

1. **Nadpisy sekcí** (`## 1.`, `## 2.`, ...) - zobrazí se zlatě s čarou pod sebou
2. **Pod-nadpisy** (`### Endpoint`, `### Body požadavku`) - menší zlaté nadpisy
3. **Číslované seznamy** (kroky workflow) - zlaté čísla s mezerami
4. **Kódové bloky** (JSON ukázky) - zvýrazněné v šedém boxu
5. **Callout bloky** (varování ⚠️) - zůstanou jako speciální boxy

## Technické detaily

- **Tabulka**: `settings`
- **Klíč**: `partner_api_documentation`
- **Operace**: UPDATE hodnoty na nový Markdown text
- **Žádné změny kódu** - renderer je již připraven
