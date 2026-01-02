import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Zásady ochrany osobních údajů | OneMil</title>
        <meta name="description" content="Zásady ochrany osobních údajů aplikace OneMil. Informace o zpracování osobních údajů v souladu s GDPR." />
      </Helmet>

      <div className="container max-w-3xl mx-auto px-4 py-8">
        <Link to="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zpět na úvod
          </Button>
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Zásady ochrany osobních údajů</h1>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">
            Poslední aktualizace: {new Date().toLocaleDateString('cs-CZ')}
          </p>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">1. Správce osobních údajů</h2>
            <p className="text-muted-foreground">
              Správcem vašich osobních údajů je společnost provozující aplikaci OneMil (dále jen „Správce"). 
              V případě dotazů ohledně zpracování osobních údajů nás kontaktujte na e-mailu: <a href="mailto:podpora@onemil.cz" className="text-primary hover:underline">podpora@onemil.cz</a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">2. Jaké údaje zpracováváme</h2>
            <p className="text-muted-foreground mb-4">V rámci poskytování služeb zpracováváme následující osobní údaje:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Identifikační údaje:</strong> jméno, příjmení, přezdívka</li>
              <li><strong>Kontaktní údaje:</strong> e-mailová adresa, telefonní číslo</li>
              <li><strong>Přihlašovací údaje:</strong> údaje z OAuth poskytovatelů (Google, Apple, Facebook)</li>
              <li><strong>Údaje o účtu:</strong> datum narození, adresa pro doručení výher</li>
              <li><strong>Údaje o aktivitě:</strong> historie soutěží, zakoupené lístky, získané výhry</li>
              <li><strong>Technické údaje:</strong> IP adresa, typ zařízení, identifikátor pro push notifikace</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">3. Účel zpracování</h2>
            <p className="text-muted-foreground mb-4">Vaše osobní údaje zpracováváme pro následující účely:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Poskytování služeb aplikace OneMil a správa uživatelského účtu</li>
              <li>Organizace spotřebitelských soutěží a předání výher</li>
              <li>Zasílání informací o soutěžích a novinkách (s vaším souhlasem)</li>
              <li>Zlepšování našich služeb a uživatelské zkušenosti</li>
              <li>Plnění právních povinností</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">4. Právní základ zpracování</h2>
            <p className="text-muted-foreground mb-4">Osobní údaje zpracováváme na základě:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Plnění smlouvy:</strong> pro poskytování služeb a správu účtu</li>
              <li><strong>Oprávněný zájem:</strong> pro zlepšování služeb a prevenci podvodů</li>
              <li><strong>Souhlas:</strong> pro marketingovou komunikaci</li>
              <li><strong>Právní povinnost:</strong> pro splnění zákonných požadavků</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">5. Doba uchování údajů</h2>
            <p className="text-muted-foreground">
              Osobní údaje uchováváme po dobu trvání vašeho účtu a poté po dobu nezbytnou pro splnění 
              právních povinností (zejména daňových a účetních), obvykle 10 let od ukončení smluvního vztahu. 
              Po smazání účtu budou vaše osobní údaje trvale odstraněny do 30 dnů, s výjimkou údajů, 
              které jsme povinni uchovávat ze zákona.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">6. Sdílení údajů</h2>
            <p className="text-muted-foreground mb-4">Vaše osobní údaje můžeme sdílet s:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Poskytovateli platebních služeb (Stripe) pro zpracování plateb</li>
              <li>Poskytovateli cloudových služeb (Supabase) pro ukládání dat</li>
              <li>Poskytovateli notifikačních služeb (OneSignal) pro zasílání upozornění</li>
              <li>Doručovacími společnostmi pro předání fyzických výher</li>
              <li>Státními orgány v případě zákonné povinnosti</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">7. Vaše práva</h2>
            <p className="text-muted-foreground mb-4">V souladu s GDPR máte následující práva:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Právo na přístup:</strong> získat informace o zpracování vašich údajů</li>
              <li><strong>Právo na opravu:</strong> požádat o opravu nepřesných údajů</li>
              <li><strong>Právo na výmaz:</strong> požádat o smazání vašich údajů</li>
              <li><strong>Právo na omezení zpracování:</strong> požádat o omezení zpracování</li>
              <li><strong>Právo na přenositelnost:</strong> získat své údaje ve strukturovaném formátu</li>
              <li><strong>Právo vznést námitku:</strong> namítat proti zpracování na základě oprávněného zájmu</li>
              <li><strong>Právo odvolat souhlas:</strong> kdykoli odvolat udělený souhlas</li>
            </ul>
            <p className="text-muted-foreground mt-4">
              Pro uplatnění svých práv nás kontaktujte na <a href="mailto:podpora@onemil.cz" className="text-primary hover:underline">podpora@onemil.cz</a>. 
              Máte také právo podat stížnost u Úřadu pro ochranu osobních údajů (www.uoou.cz).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">8. Zabezpečení údajů</h2>
            <p className="text-muted-foreground">
              Přijímáme technická a organizační opatření k ochraně vašich osobních údajů před 
              neoprávněným přístupem, ztrátou nebo zneužitím. Data jsou šifrována při přenosu 
              i v klidu a přístup k nim mají pouze oprávněné osoby.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">9. Cookies a sledování</h2>
            <p className="text-muted-foreground">
              Aplikace OneMil používá nezbytné cookies pro zajištění funkčnosti a bezpečnosti. 
              Analytické cookies používáme pouze s vaším souhlasem pro zlepšování služeb.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">10. Změny zásad</h2>
            <p className="text-muted-foreground">
              Tyto zásady můžeme příležitostně aktualizovat. O významných změnách vás budeme informovat 
              prostřednictvím aplikace nebo e-mailu. Doporučujeme pravidelně kontrolovat aktuální znění.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">11. Kontakt</h2>
            <p className="text-muted-foreground">
              V případě dotazů ohledně ochrany osobních údajů nás kontaktujte na e-mailu: {' '}
              <a href="mailto:podpora@onemil.cz" className="text-primary hover:underline">podpora@onemil.cz</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
