import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Trash2, Mail, Clock, AlertTriangle } from 'lucide-react';

const DeleteAccount: React.FC = () => {
  return (
    <div className="min-h-screen bg-background pb-24">
      <Helmet>
        <title>Smazání účtu | OneMil</title>
        <meta name="description" content="Informace o smazání účtu v aplikaci OneMil. Zjistěte, jak můžete smazat svůj účet a osobní údaje." />
      </Helmet>
      
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Card className="border border-border">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
                <Trash2 className="w-8 h-8 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-2xl">Smazání účtu</CardTitle>
            <p className="text-muted-foreground mt-2">
              Informace o tom, jak smazat váš účet a osobní údaje
            </p>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Option 1: In-app deletion */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary font-bold">1</span>
                </div>
                <h3 className="font-semibold text-lg text-foreground">Smazání přímo v aplikaci</h3>
              </div>
              <div className="ml-13 pl-[52px]">
                <p className="text-muted-foreground leading-relaxed">
                  Svůj účet můžete smazat přímo v aplikaci OneMil. Postupujte následovně:
                </p>
                <ol className="list-decimal list-inside mt-3 space-y-2 text-muted-foreground">
                  <li>Přihlaste se do aplikace OneMil</li>
                  <li>Přejděte do sekce <strong className="text-foreground">Profil</strong></li>
                  <li>Vyberte možnost <strong className="text-foreground">Nastavení účtu</strong></li>
                  <li>Klikněte na tlačítko <strong className="text-foreground">Smazat účet</strong></li>
                  <li>Potvrďte smazání účtu</li>
                </ol>
              </div>
            </div>

            {/* Option 2: Email request */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary font-bold">2</span>
                </div>
                <h3 className="font-semibold text-lg text-foreground">Žádost prostřednictvím e-mailu</h3>
              </div>
              <div className="ml-13 pl-[52px]">
                <p className="text-muted-foreground leading-relaxed">
                  Pokud nemáte přístup k aplikaci nebo preferujete jinou metodu, můžete nám zaslat žádost o smazání účtu na e-mail:
                </p>
                <div className="mt-3 p-4 bg-muted/50 rounded-lg flex items-center gap-3">
                  <Mail className="w-5 h-5 text-primary flex-shrink-0" />
                  <a 
                    href="mailto:podpora@onemil.cz?subject=Žádost o smazání účtu" 
                    className="text-primary font-medium hover:underline"
                  >
                    podpora@onemil.cz
                  </a>
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  V e-mailu prosím uveďte e-mailovou adresu spojenou s vaším účtem.
                </p>
              </div>
            </div>

            {/* Data deletion notice */}
            <div className="border-t border-border pt-6 space-y-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-foreground">Doba zpracování</h4>
                  <p className="text-muted-foreground text-sm mt-1">
                    Po potvrzení vaší žádosti budou všechny vaše osobní údaje trvale smazány do <strong className="text-foreground">30 dnů</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-foreground">Upozornění</h4>
                  <p className="text-muted-foreground text-sm mt-1">
                    Smazání účtu je nevratné. Po smazání ztratíte přístup ke všem vašim datům, včetně:
                  </p>
                  <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground space-y-1">
                    <li>Zůstatku MioCoinů a bonusů</li>
                    <li>Zakoupených tiketů a historie soutěží</li>
                    <li>Voucherů a výher</li>
                    <li>Historie zpráv a oznámení</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* GDPR notice */}
            <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
              <p>
                Vaše právo na smazání osobních údajů je zaručeno v souladu s nařízením GDPR. 
                Pro více informací o zpracování osobních údajů navštivte naši stránku{' '}
                <a href="/privacy" className="text-primary hover:underline">
                  Zásady ochrany osobních údajů
                </a>.
              </p>
            </div>

            {/* Provozovatel */}
            <div className="border-t border-border pt-6">
              <p className="text-sm text-muted-foreground text-center">
                <span className="font-medium text-foreground">Provozovatel:</span> iCONIC POINT s.r.o., IČO: 177 95 851
              </p>
            </div>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default DeleteAccount;
