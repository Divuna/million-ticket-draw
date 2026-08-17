/**
 * "Jak propojit Shoptet s OneMil" — the single source of the guide's content.
 *
 * The partner portal page and the downloadable PDF are BOTH rendered from this
 * module, so the two can never drift apart. If you change a step here, regenerate
 * the PDF (`npm run build:partner-guide-pdf`) in the same commit.
 *
 * The screenshots come from the OneMil_Shoptet_navod_balicek package and are used
 * as delivered. They are already anonymised: the Shoptet permanent export link, the
 * widget snippet (which carries the partner uuid), the shop name and the export URL
 * field are blurred or masked at the source. Never swap in an un-anonymised capture,
 * and never write a real export link, hash or partner id into this file.
 */

export interface GuideShot {
  /** Path under /public, so it resolves the same in the app and in the PDF build. */
  src: string;
  /** Alt text and the caption shown under the image. */
  alt: string;
  /** Optional short note printed under the shot. */
  note?: string;
}

export interface GuideStep {
  number: number;
  title: string;
  /** Body paragraphs. `**bold**` marks the parts a partner has to click or type. */
  body: string[];
  /** The "what now" line that closes the step and points at the next one. */
  next?: string;
  shots: GuideShot[];
}

export const SHOPTET_GUIDE_TITLE = 'Jak propojit Shoptet s OneMil';

export const SHOPTET_GUIDE_INTRO =
  'Postupujte krok za krokem. Po dokončení každého kroku vám návod rovnou řekne, kam pokračovat dál.';

/** Public path of the generated PDF. Kept here so the page and the build script agree. */
export const SHOPTET_GUIDE_PDF_PATH = '/navody/OneMil-navod-Shoptet.pdf';

export const SHOPTET_GUIDE_IMAGE_BASE = '/navody/shoptet';

export const SHOPTET_GUIDE_STEPS: GuideStep[] = [
  {
    number: 1,
    title: 'Povolte OneMilu přístup k exportu',
    body: [
      'V administraci Shoptetu otevřete **Nastavení → Administrace → Zabezpečení exportů** a klikněte na **Přidat**.',
      'Do názvu zadejte **onemil**. Datum platnosti nemusíte nastavovat, pokud nechcete přístup časově omezit.',
      'Po uložení zkontrolujte, že je přístup **aktivní a svítí zeleně**.',
    ],
    next:
      'Hotovo? Nyní přejděte k vytvoření exportu objednávek. Export objednávek slouží k tomu, aby OneMil mohl bezpečně načítat nové objednávky a podle nich vytvářet MioCoin odměny.',
    shots: [
      {
        src: `${SHOPTET_GUIDE_IMAGE_BASE}/02-shoptet-zabezpeceni-exportu.png`,
        alt: 'Shoptet — Nastavení → Administrace → Zabezpečení exportů s tlačítkem Přidat',
        note: 'Přístup s názvem onemil je aktivní — ve sloupci Aktivní svítí zelené kolečko.',
      },
    ],
  },
  {
    number: 2,
    title: 'Vytvořte export objednávek',
    body: [
      'V Shoptetu otevřete **Objednávky → Export objednávek → Vytvořit vlastní typ exportu**.',
      'Nastavte formát **CSV**, název **OneMil**, přístup pro partnera **onemil** a volbu **Jen nové nebo změněné**.',
      'Nastavení uložte.',
    ],
    next:
      'Export je připravený. Teď z něj potřebujeme získat odkaz, přes který bude OneMil objednávky načítat.',
    shots: [
      {
        src: `${SHOPTET_GUIDE_IMAGE_BASE}/03-shoptet-pridat-sablonu-exportu.png`,
        alt: 'Shoptet — dialog Přidat šablonu exportu objednávek s formátem CSV a polem Jméno',
        note: 'Vyberte Prázdný, formát CSV a zadejte jméno OneMil.',
      },
      {
        src: `${SHOPTET_GUIDE_IMAGE_BASE}/04-shoptet-export-objednavek-permanentni-odkaz.png`,
        alt: 'Shoptet — stránka Export objednávek s vybraným vlastním exportem OneMil',
        note: 'Vlastní export OneMil je vybraný, přístup pro partnera je onemil a je zvoleno Jen nové nebo změněné.',
      },
    ],
  },
  {
    number: 3,
    title: 'Zkopírujte permanentní odkaz exportu',
    body: [
      'Na stejné stránce najděte část **Permanentní odkaz zvoleného exportu**.',
      'Celý odkaz zkopírujte.',
    ],
    next: 'Teď se vraťte do OneMilu. Odkaz vložíte do nastavení propojení Shoptetu.',
    shots: [
      {
        src: `${SHOPTET_GUIDE_IMAGE_BASE}/04-shoptet-export-objednavek-permanentni-odkaz.png`,
        alt: 'Shoptet — část Permanentní odkaz zvoleného exportu ve spodní části stránky',
        note:
          'Odkaz je na snímku záměrně rozmazaný. Je to přístupový údaj k vašim objednávkám — nikam ho nezveřejňujte a posílejte ho jen do OneMilu.',
      },
    ],
  },
  {
    number: 4,
    title: 'Odešlete propojení v OneMilu',
    body: [
      'V partnerském účtu OneMil otevřete sekci **Napojení e-shopu / Shoptet**.',
      'Do pole **URL Shoptet exportu objednávek** vložte zkopírovaný odkaz.',
      'Vyberte, kdy má zákazník získat MioCoiny, například **Po zaplacení objednávky**.',
      'Klikněte na **Odeslat ke schválení**.',
    ],
    next: 'Tím je nastavení z vaší strany hotové. Teď už jen čekáte na kontrolu OneMilem.',
    shots: [
      {
        src: `${SHOPTET_GUIDE_IMAGE_BASE}/05-onemil-vlozit-url-exportu.png`,
        alt: 'OneMil — sekce Napojení e-shopu / Shoptet s vyplněným polem URL Shoptet exportu objednávek',
        note: 'Vložený odkaz se nikdy nezobrazuje zpět — proto je v poli skrytý.',
      },
      {
        src: `${SHOPTET_GUIDE_IMAGE_BASE}/01-onemil-shoptet-nastaveni.png`,
        alt: 'OneMil — rozbalená nabídka Kdy vydat odměnu s volbou Po zaplacení objednávky',
        note: 'V nabídce Kdy vydat odměnu vyberte například Po zaplacení objednávky.',
      },
    ],
  },
  {
    number: 5,
    title: 'Počkejte na schválení',
    body: [
      'Po odeslání se zobrazí stav **Odesláno ke schválení**.',
      'OneMil propojení zkontroluje a schválí **nejpozději do 24 hodin**, zpravidla dříve.',
      'Po schválení se stav změní na **Aktivní**.',
    ],
    next:
      'E-shop je nyní propojený s OneMilem. Zbývá poslední krok — zobrazit MioCoiny zákazníkům přímo v e-shopu.',
    shots: [
      {
        src: `${SHOPTET_GUIDE_IMAGE_BASE}/06-onemil-odeslano-ke-schvaleni.png`,
        alt: 'OneMil — stav napojení Odesláno ke schválení',
        note: 'Čeká na kontrolu OneMilem.',
      },
      {
        src: `${SHOPTET_GUIDE_IMAGE_BASE}/07-onemil-napojeni-aktivni.png`,
        alt: 'OneMil — stav napojení Aktivní',
        note: 'Schváleno — napojení je aktivní.',
      },
    ],
  },
  {
    number: 6,
    title: 'Zapněte zobrazení MioCoinů v e-shopu',
    body: [
      'V OneMilu se po aktivaci zobrazí sekce **Zobrazení MioCoinů v e-shopu**.',
      'Klikněte na **Kopírovat kód**.',
      'V Shoptetu otevřete **Vzhled a obsah → Editor HTML kódu → Zápatí (před koncovým tagem BODY)**.',
      'Vložte zkopírovaný kód a uložte.',
    ],
    next:
      'Hotovo. Od této chvíle se budou MioCoiny zákazníkům zobrazovat automaticky podle vašeho aktuálního nastavení v OneMilu.',
    shots: [
      {
        src: `${SHOPTET_GUIDE_IMAGE_BASE}/08-onemil-html-kod-widgetu.png`,
        alt: 'OneMil — sekce Zobrazení MioCoinů v e-shopu s tlačítkem Kopírovat kód',
        note: 'Kód na snímku je rozmazaný — obsahuje identifikátor vašeho partnerského účtu.',
      },
    ],
  },
];

/** What the customer sees once the code is in place — shown at the end of the guide. */
export const SHOPTET_GUIDE_RESULT_TITLE = 'Jak to uvidí zákazník';

export const SHOPTET_GUIDE_RESULTS: GuideShot[] = [
  {
    src: `${SHOPTET_GUIDE_IMAGE_BASE}/09-shoptet-vypis-produktu-miocoiny.png`,
    alt: 'Shoptet — MioCoiny ve výpisu produktů',
    note: 'MioCoiny ve výpisu produktů.',
  },
  {
    src: `${SHOPTET_GUIDE_IMAGE_BASE}/10-shoptet-detail-produktu-miocoiny.png`,
    alt: 'Shoptet — MioCoiny v detailu produktu',
    note: 'MioCoiny v detailu produktu.',
  },
  {
    src: `${SHOPTET_GUIDE_IMAGE_BASE}/11-shoptet-doprava-platba-miocoiny.png`,
    alt: 'Shoptet — celková MioCoin odměna v části Doprava a platba',
    note: 'V objednávce zákazník vidí také celkový počet MioCoinů, které za celý nákup získá.',
  },
];
