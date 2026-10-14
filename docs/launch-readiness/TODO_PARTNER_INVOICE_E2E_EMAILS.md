# TODO — partnerské faktury / E2E e-maily

- Skutečná faktura schválená 17. 7. 2026 měla správné období `2026-06-29 – 2026-07-05`.
- Opakované e-maily s obdobím `2026-06-01 – 2026-06-07` pocházejí ze stagingového E2E testu `44-partner-invoice-pdf-email.spec.ts`, kde je období pevně zadané.
- E2E test při každém běhu odesílá skutečný e-mail na `eshop@onemil.cz`.
- Později upravit test tak, aby běžné automatické běhy neodesílaly skutečný e-mail, případně aby bylo skutečné odeslání povolené jen ručním přepínačem.
- Neměnit nyní produkční fakturační proces.
