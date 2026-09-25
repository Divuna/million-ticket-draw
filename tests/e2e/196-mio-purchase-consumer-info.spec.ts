/**
 * Spec 196 — spotřebitelská informace k nákupu MIO (25. 9. 2026, schváleno Pavlem).
 *
 * Statický kontrakt bez sítě:
 * - před Stripe checkoutem je přesný informační text (panel dobíjení i rychlé dobití v hlavičce),
 * - žádný povinný checkbox ani vzdání se práva — souhlas s okamžitým použitím zůstává vypnutý,
 * - zdroj VOP už netvrdí „Zakoupený kredit nelze vrátit.“ a obsahuje nové znění bodu 8,
 * - refundační logika se nemění (tok prepare → Stripe → record → finalize/reverse).
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const INFO =
  'Zakoupené MIO můžete používat ihned. U nevyužité placené části MIO můžete do 14 dnů od nákupu požádat o vrácení odpovídající zaplacené částky. Bonusová MIO se peněžně neproplácejí. Podrobnosti najdete ve Všeobecných obchodních podmínkách.';

const VOP_SECTION_8 =
  'MIO je interní digitální kredit platformy OneMil a není možné jej vyplatit v hotovosti ani převést mimo OneMil. U nevyužité placené části MIO může spotřebitel do 14 dnů od nákupu požádat o vrácení odpovídající zaplacené částky. Pokud byla část placených MIO již použita, OneMil vrátí pouze částku odpovídající zbývající nevyužité placené části. Bonusová, partnerská a jiná bezplatně získaná MIO nejsou placenou částí a samostatně se peněžně neproplácejí. Žádost lze uplatnit na podpora@onemil.cz. Tím nejsou dotčena další zákonná práva spotřebitele.';

test.describe('196 spotřebitelská informace k nákupu MIO (kontrakt)', () => {
  test('196a: informační text je přesný a bez checkboxu', async () => {
    const src = read('src/components/MioPurchaseInfo.tsx');
    const lead = src.match(/MIO_PURCHASE_INFO_LEAD =\s*"([^"]+)"/)?.[1];
    const link = src.match(/MIO_PURCHASE_INFO_LINK = "([^"]+)"/)?.[1];
    expect(`${lead} ${link}.`).toBe(INFO);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/Checkbox|checked|required/);
    expect(code).toContain('to="/vop"');
  });

  test('196b: text je v obou místech, odkud se spouští checkout', () => {
    for (const f of ['src/components/MioCoinTopUpSection.tsx', 'src/components/Header.tsx']) {
      const src = read(f);
      expect(src, f).toContain('useMioCoinCheckout');
      expect(src, f).toContain('<MioPurchaseInfo');
    }
  });

  test('196c: souhlas s okamžitým použitím zůstává vypnutý a infrastruktura zachovaná', () => {
    const mig = read('supabase/migrations/20260924100000_refund_block_wallet_lots.sql');
    expect(mig).toContain("('immediate_use_consent_required', 'false')");
    const hook = read('src/hooks/useMioCoinCheckout.ts');
    expect(hook).toContain('get_immediate_use_consent_config');
    expect(read('src/components/ImmediateUseConsentDialog.tsx')).toContain('immediate-use-consent-checkbox');
  });

  test('196d: zdroj VOP má nové znění bodu 8 a neobsahuje „nelze vrátit“', () => {
    const vop = read('docs/pravni-dokumenty/VSEOBECNE_OBCHODNI_PODMINKY/VSEOBECNE_OBCHODNI_PODMINKY.md');
    const body = vop.replace(/<!--[\s\S]*?-->/, '');
    expect(body).not.toContain('Zakoupený kredit nelze vrátit.');
    expect(body).not.toContain('MioCoin');
    expect(body).toContain(`8. Vrácení platby za MIO\n${VOP_SECTION_8}`);
  });

  test('196e: aktivní nákupní cesta netvrdí ztrátu práva na odstoupení', () => {
    for (const f of [
      'src/hooks/useMioCoinCheckout.ts',
      'src/components/MioCoinTopUpSection.tsx',
      'src/components/Header.tsx',
      'src/components/MioPurchaseInfo.tsx',
      'supabase/functions/create-stripe-checkout/index.ts',
    ]) {
      const src = read(f).toLowerCase();
      expect(src, f).not.toMatch(/ztrácí(te)? právo|vzdáváte se práva|nelze odstoupit|nelze vrátit/);
    }
  });
});
