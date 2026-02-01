UPDATE settings 
SET value = '## Dokumentace API OneMil (v1)

**Verze:** 1.0  
**Poslední aktualizace:** dnes

---

## 1. K čemu slouží OneMil API

OneMil API slouží k připsání MioCoinů zákazníkům po dokončení objednávky ve vašem e-shopu.

OneMil se stará o soutěže, losování a výhry. **Vy pouze odešlete informaci o objednávce.**

---

## 2. Jak OneMil funguje v praxi

1. Zákazník dokončí objednávku v e-shopu
2. Váš systém zavolá OneMil API
3. OneMil připíše MioCoiny zákazníkovi
4. Zákazník může MioCoiny využít v aplikaci OneMil

> Vy nelosujete, neřešíte výhry, pouze předáte data.

---

## 3. Co potřebujete, než začnete

- Aktivní partnerský účet v OneMil
- API klíč (Partner portál → API klíče)
- Možnost odeslat HTTP požadavek ze serveru (ne z prohlížeče)

> ⚠️ **Důležité:** API klíč nikdy nezveřejňujte a neukládejte do klientské části webu.

---

## 4. Základní princip integrace

Integrace je velmi jednoduchá:

1. Po zaplacení objednávky
2. Odešlete 1× POST request
3. S informacemi o objednávce a zákazníkovi

**To je vše.**

---

## 5. Autentizace

Každý požadavek musí obsahovat hlavičku:

```
X-API-Key: VÁŠ_API_KLÍČ
```

---

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

### Význam polí

| Pole | Popis |
|------|-------|
| `order_id` | Vaše interní číslo objednávky |
| `customer_email` | E-mail zákazníka |
| `amount` | Počet MioCoinů k připsání |

### Úspěšná odpověď

```json
{
  "success": true,
  "issued_miocoins": 100
}
```

---

## 7. Jak poznám, že integrace funguje

V Partner portálu sledujte stav:

> ✅ **Integrace API: aktivní**  
> → proběhlo alespoň jedno reálné API volání za posledních 30 dní  
> *(testovací volání se nepočítají)*

Také uvidíte záznamy v sekci **API aktivita**.

---

## 8. Nejčastější chyby

| Chyba | Řešení |
|-------|--------|
| ❌ Špatný API klíč | Zkontrolujte hlavičku `X-API-Key` |
| ❌ Volání z prohlížeče | API musí běžet na serveru |
| ❌ Pouze testovací volání | Integrace zůstane „neaktivní" |

> ℹ️ **Nebojte se:** Nic tím nerozbíjíte. API je bezpečné.

---

## 9. Podpora

Pokud si nejste jistí nebo něco nefunguje, kontaktujte nás:

📧 **podpora@onemil.cz**

Rádi vám s integrací pomůžeme.',
    updated_at = now()
WHERE key = 'partner_api_documentation';