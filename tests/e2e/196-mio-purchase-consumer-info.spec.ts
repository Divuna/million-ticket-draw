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
import { readFileSync, readdirSync } from 'node:fs';

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

  test('196f: viditelné texty nákupní cesty používají veřejný název MIO', () => {
    // Jen viditelné řetězce v JSX/toastech/aria — technické identifikátory (MioCoin*, miocoin_*) zůstávají.
    const visible = (src: string) =>
      [...src.matchAll(/>([^<>{}]*)</g), ...src.matchAll(/(?:alt|aria-label)="([^"]*)"/g), ...src.matchAll(/toast\.[a-z]+\("([^"]*)"/g)]
        .map((m) => m[1])
        .join(' ');
    for (const f of ['src/components/MioCoinTopUpSection.tsx', 'src/components/Header.tsx', 'src/hooks/useMioCoinCheckout.ts']) {
      expect(visible(read(f)), f).not.toMatch(/MioCoin/);
    }
    const panel = read('src/components/MioCoinTopUpSection.tsx');
    expect(panel).toContain('Dobijte si MIO');
    expect(panel).toContain('Dobíjejte si MIO pro');
    expect(read('src/components/Header.tsx')).toContain('aria-label="Rychlé dobití MIO"');
    expect(read('src/pages/PaymentSuccess.tsx')).not.toContain('MioCoiny byly připsány');
    const ef = read('supabase/functions/create-stripe-checkout/index.ts');
    expect(ef).toContain("name: 'OneMil MIO',");
    expect(ef).toContain('description: `${totalCoins} MIO pro OneMil`,');
    // cena a bonusy beze změny
    expect(ef).toContain('50: 50,\n  300: 310,\n  500: 525,\n  1200: 1280,');
    expect(ef).toContain('const unitAmountHalere = priceInCzk * 100');
  });

  test('196g: zákaznická aplikace, widget a zákaznické DB texty nepoužívají veřejně „MioCoin“', () => {
    // Zákaznické soubory (admin, partnerský portál, affiliate a testy jsou mimo rozsah).
    // Mimo rozsah: admin, partnerský portál, affiliate, interní testy, technické mapy a nepoužívané AdminContestView.
    const EXCLUDED = /\/Admin|\/admin\/|\/partner\/|\/tests\/|ContestDetailAdmin|useAdminPermissions|Partner(?!Register)|Affiliate|InfluencerPromo|paymentReporting|usePlacementBanners|shoptetGuide|partnerRewardCodeStats/;
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(tsx?|js)$/.test(e.name) ? [`${dir}/${e.name}`] : []);
    const offenders: string[] = [];
    for (const f of walk('src').filter((f) => !EXCLUDED.test(f))) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      code.split('\n').forEach((raw, i) => {
        const line = raw.replace(/(^|\s)\/\/.*$/, '');
        if (/^\s*import\s|console\.|from ['"]/.test(line)) return;
        // „MioCoin“ jako samostatné slovo (ne součást identifikátoru jako useMioCoinCheckout, <MioCoin, @/components/MioCoin)
        for (const m of line.matchAll(/(?<![A-Za-z_./<@])MioCoin(?![A-Z_(])([a-zěščřžýáíéůú]*)(.?)/g)) {
          if (m[1] === '' && /[:;]/.test(m[2])) continue; // const MioCoin: … / export default MioCoin;
          offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
        }
      });
    }
    expect(offenders).toEqual([]);

    const widget = read('public/shoptet-widget.js');
    expect(widget).toContain("return 'MIO';");
    expect(widget.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')).not.toMatch(/'[^']*MioCoin[^']*'/);

    const mig = read('supabase/migrations/20260928100000_public_name_mio_customer_texts.sql');
    for (const s of ["'''Nedostatek MIO'''", "'''MIO uplatněna'''", "''' MIO'''", "'Máte připravené MIO</h1>'", "'Váš MIO kód'", "'Uplatnit MIO</a>'", "'''Máte připravené MIO od OneMil'''"]) {
      expect(mig).toContain(s);
    }
    expect(mig).not.toContain('process_event_queue_miocoin(');
    expect(read('supabase/functions/generate-contest-description/index.ts')).toContain('`- Cena tiketu: ${ticket_price} MIO`');
    expect(read('supabase/functions/generate-poster/index.ts')).toContain('`- Ticket price: ${contest.ticket_price} MIO`');
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
