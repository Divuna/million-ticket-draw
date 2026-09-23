import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const TermsConditions = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Obchodní podmínky | OneMil</title>
        <meta name="description" content="Obchodní podmínky aplikace OneMil. Pravidla spotřebitelských soutěží a používání interního kreditu MIO." />
      </Helmet>

      <div className="container max-w-3xl mx-auto px-4 py-8">
        <Link to="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zpět na úvod
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Obchodní podmínky</h1>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">
            Poslední aktualizace: {new Date().toLocaleDateString('cs-CZ')}
          </p>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">1. Úvodní ustanovení</h2>
            <p className="text-muted-foreground mb-4">
              Tyto obchodní podmínky (dále jen „Podmínky") upravují práva a povinnosti uživatelů 
              mobilní a webové aplikace OneMil (dále jen „Aplikace") provozované společností:
            </p>
            <div className="bg-muted/50 rounded-lg p-4 text-muted-foreground space-y-1 mb-4">
              <p className="font-medium text-foreground">iCONIC POINT s.r.o.</p>
              <p>IČO: 177 95 851</p>
              <p>Sídlo: Na Folimance 2155/15, Vinohrady, 120 00 Praha 2</p>
              <p>Zapsáno v obchodním rejstříku vedeném Městským soudem v Praze, oddíl C, vložka 376856</p>
              <p>Jednatel: Pavel Diviš</p>
            </div>
            <p className="text-muted-foreground">
              (dále jen „Provozovatel"). Používáním Aplikace vyjadřujete souhlas s těmito Podmínkami.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">2. Popis služby</h2>
            <p className="text-muted-foreground mb-4">
              OneMil je partnerská odměnová a spotřebitelská platforma. Aplikace umožňuje:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Získávat a používat interní kredit MIO</li>
              <li>Pořizovat za MIO garantované nákupní benefity</li>
              <li>Získat s garantovaným nákupním benefitem 1 soutěžní tiket zdarma jako bonus</li>
              <li>Účastnit se spotřebitelských soutěží o věcné ceny</li>
              <li>Využívat vouchery a partnerské nabídky</li>
              <li>Spravovat uživatelský účet, peněženku a historii</li>
            </ul>
            <p className="text-muted-foreground mt-4 font-semibold">
              OneMil pořádá spotřebitelské soutěže ve smyslu § 2881 a násl. občanského zákoníku.
              Výhry nejsou peněžité a nelze je směnit za peníze.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">3. Registrace a uživatelský účet</h2>
            <p className="text-muted-foreground mb-4">Pro používání Aplikace je nutná registrace. Uživatel:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Musí být starší 18 let</li>
              <li>Je povinen uvádět pravdivé a aktuální údaje</li>
              <li>Odpovídá za bezpečnost svého účtu a přihlašovacích údajů</li>
              <li>Nesmí sdílet přístupové údaje s třetími osobami</li>
              <li>Může mít pouze jeden uživatelský účet</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">4. MIO – interní kredit OneMil</h2>
            <p className="text-muted-foreground mb-4">
              MIO je interní digitální kredit OneMil používaný výhradně v rámci Aplikace OneMil:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>MIO lze získat placeným dobitím prostřednictvím platební brány nebo jako odměnu podle aktuální nabídky OneMil</li>
              <li>MIO lze použít pouze uvnitř OneMil</li>
              <li>MIO lze použít zejména na garantované nákupní benefity, vouchery a další vybrané funkce OneMil</li>
              <li>MIO <strong>nelze</strong> vybrat ani vyplatit jako peníze</li>
              <li>MIO <strong>nelze</strong> převádět mimo OneMil</li>
              <li>MIO nemá žádnou hodnotu mimo Aplikaci</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              Bonusové MIO získané v rámci soutěže podléhá stejným pravidlům
              a může být použit pouze uvnitř OneMil.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">5. Pravidla soutěží</h2>
            <p className="text-muted-foreground mb-4">Spotřebitelské soutěže v Aplikaci OneMil:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Mají pevně stanovený počet tiketů</li>
              <li>Tikety se otevírají postupně v pořadí 1, 2, 3 a dále</li>
              <li>Každý tiket má přiřazeno unikátní číslo</li>
              <li>Hlavní výhru získává držitel posledního tiketu soutěže</li>
              <li>Bonusové výherní pozice jsou stanoveny předem, ale jejich konkrétní čísla nejsou účastníkům předem zobrazována</li>
              <li>Výsledky jsou zveřejněny v Aplikaci a oznámeny výhercům</li>
              <li>Jeden uživatel může vlastnit více tiketů v jedné soutěži</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">6. Výhry a jejich předání</h2>
            <p className="text-muted-foreground mb-4">
              Konkrétní podmínky předání výhry stanovují pravidla dané soutěže.
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Výherce je o výhře informován prostřednictvím Aplikace; pravidla konkrétní soutěže mohou stanovit i další způsob kontaktu</li>
              <li>Výherce poskytne údaje nezbytné pro předání konkrétní výhry</li>
              <li>Věcné výhry nelze směnit za peníze</li>
              <li>Způsob předání, lhůty, související náklady a postup při nepřevzetí musí být uvedeny v pravidlech konkrétní soutěže</li>
              <li>Účast v soutěžích je určena pouze uživatelům starším 18 let</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">7. Platební podmínky</h2>
            <p className="text-muted-foreground mb-4">Placené dobití MIO:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Platby jsou zpracovávány prostřednictvím platební brány Stripe</li>
              <li>Akceptujeme platební karty (Visa, Mastercard)</li>
              <li>Ceny jsou uvedeny včetně DPH</li>
              <li>Po úspěšné platbě je MIO připsáno na účet</li>
              <li>Daňový doklad je k dispozici v historii plateb</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">8. Reklamace a vrácení</h2>
            <p className="text-muted-foreground">
              Reklamace, odstoupení od smlouvy a případné vrácení platby za placené dobití MIO
              se posuzují podle platných právních předpisů a okolností konkrétního případu.
              V případě problému s platbou nebo službou kontaktujte zákaznickou podporu na{" "}
              <a href="mailto:podpora@onemil.cz" className="text-primary hover:underline">podpora@onemil.cz</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">9. Zakázané činnosti</h2>
            <p className="text-muted-foreground mb-4">Uživatelům je zakázáno:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Vytvářet více účtů nebo používat účty jiných osob</li>
              <li>Pokoušet se o manipulaci s průběhem nebo výsledky soutěží</li>
              <li>Využívat automatizované nástroje nebo boty</li>
              <li>Narušovat funkčnost nebo bezpečnost Aplikace</li>
              <li>Šířit nepravdivé informace o Aplikaci nebo soutěžích</li>
              <li>Prodávat nebo převádět účet či MIO třetím osobám</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              Porušení těchto pravidel může vést k zablokování účtu bez náhrady.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">10. Odpovědnost</h2>
            <p className="text-muted-foreground">
              Provozovatel nenese odpovědnost za škody způsobené nesprávným používáním Aplikace, 
              výpadky služeb třetích stran, nebo za ztráty vzniklé v důsledku nedodržení těchto Podmínek 
              uživatelem. Provozovatel si vyhrazuje právo dočasně omezit přístup k Aplikaci z důvodu 
              údržby nebo technických problémů.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">11. Zrušení účtu</h2>
            <p className="text-muted-foreground">
              Uživatel může kdykoli požádat o zrušení účtu v nastavení Aplikace nebo kontaktováním
              podpory. Vypořádání případného nevyužitého MIO při zrušení účtu se řídí jeho původem,
              aktuálními podmínkami služby a platnými právními předpisy. Více informací naleznete na stránce{" "}
              <Link to="/delete-account" className="text-primary hover:underline">Smazání účtu</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">12. Změny podmínek</h2>
            <p className="text-muted-foreground">
              Provozovatel si vyhrazuje právo tyto Podmínky kdykoli změnit. O změnách budou uživatelé 
              informováni prostřednictvím Aplikace. Pokračováním v používání Aplikace po oznámení 
              změn uživatel vyjadřuje souhlas s novými Podmínkami.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">13. Rozhodné právo</h2>
            <p className="text-muted-foreground">
              Tyto Podmínky se řídí právním řádem České republiky. Případné spory budou řešeny 
              příslušnými soudy České republiky. Pro mimosoudní řešení spotřebitelských sporů je 
              příslušná Česká obchodní inspekce (www.coi.cz).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">14. Kontakt</h2>
            <p className="text-muted-foreground mb-4">
              V případě dotazů nás kontaktujte:
            </p>
            <div className="bg-muted/50 rounded-lg p-4 text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">iCONIC POINT s.r.o.</p>
              <p>E-mail: <a href="mailto:podpora@onemil.cz" className="text-primary hover:underline">podpora@onemil.cz</a></p>
              <p>Telefon: <a href="tel:+420731215816" className="text-primary hover:underline">+420 731 215 816</a></p>
              <p>Adresa: Na Folimance 2155/15, Vinohrady, 120 00 Praha 2</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsConditions;
