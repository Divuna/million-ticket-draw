import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Building2, Mail, Phone, MapPin, User, FileText } from 'lucide-react';

const Kontakt: React.FC = () => {
  return (
    <div className="min-h-screen bg-background pb-24">
      <Helmet>
        <title>Kontakt | OneMil</title>
        <meta name="description" content="Kontaktní informace a údaje o provozovateli aplikace OneMil - iCONIC POINT s.r.o." />
      </Helmet>
      
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Card className="border border-border">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Building2 className="w-8 h-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">Kontakt</CardTitle>
            <p className="text-muted-foreground mt-2">
              Informace o provozovateli aplikace OneMil
            </p>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Provozovatel */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg text-foreground">Provozovatel</h3>
              </div>
              <div className="ml-13 pl-[52px] space-y-2">
                <p className="text-foreground font-medium text-lg">iCONIC POINT s.r.o.</p>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  <span>IČO: 177 95 851</span>
                </div>
              </div>
            </div>

            {/* Sídlo */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg text-foreground">Sídlo</h3>
              </div>
              <div className="ml-13 pl-[52px]">
                <p className="text-muted-foreground">
                  Na Folimance 2155/15, Vinohrady, 120 00 Praha 2
                </p>
              </div>
            </div>

            {/* Obchodní rejstřík */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg text-foreground">Zápis v obchodním rejstříku</h3>
              </div>
              <div className="ml-13 pl-[52px]">
                <p className="text-muted-foreground">
                  Zapsáno v obchodním rejstříku vedeném Městským soudem v Praze, oddíl C, vložka 376856
                </p>
              </div>
            </div>

            {/* Jednatel */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg text-foreground">Jednatel</h3>
              </div>
              <div className="ml-13 pl-[52px]">
                <p className="text-muted-foreground">Pavel Diviš</p>
              </div>
            </div>

            {/* Kontaktní údaje */}
            <div className="border-t border-border pt-6 space-y-4">
              <h3 className="font-semibold text-lg text-foreground">Kontaktní údaje</h3>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <Mail className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">E-mail</p>
                    <a 
                      href="mailto:podpora@onemil.cz" 
                      className="text-primary font-medium hover:underline"
                    >
                      podpora@onemil.cz
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                  <Phone className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm text-muted-foreground">Telefon</p>
                    <a 
                      href="tel:+420776532562" 
                      className="text-primary font-medium hover:underline"
                    >
                      +420 776 532 562
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Odkazy na právní dokumenty */}
            <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
              <p>
                Pro více informací navštivte naše{' '}
                <a href="/terms" className="text-primary hover:underline">
                  Obchodní podmínky
                </a>
                {' '}nebo{' '}
                <a href="/privacy" className="text-primary hover:underline">
                  Zásady ochrany osobních údajů
                </a>.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default Kontakt;
