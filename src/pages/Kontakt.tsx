import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Header } from '@/components/Header';
import { BottomNavigation } from '@/components/BottomNavigation';
import { Separator } from '@/components/ui/separator';
import { Building2, Mail, Phone, MapPin, FileText, User } from 'lucide-react';

const Kontakt: React.FC = () => {
  return (
    <div className="min-h-screen bg-background pb-24">
      <Helmet>
        <title>Kontakt | OneMil</title>
        <meta name="description" content="Kontaktní informace a údaje o provozovateli aplikace OneMil - iCONIC POINT s.r.o." />
      </Helmet>
      
      <Header />

      <main className="max-w-[950px] mx-auto px-6 py-12 md:py-16">
        <article className="rounded-2xl border border-border/30 bg-gradient-to-b from-card/60 to-card/40 backdrop-blur-sm shadow-[0_8px_32px_hsl(222_50%_3%/0.4)]">
          {/* Header Section */}
          <header className="px-8 md:px-12 pt-10 md:pt-14 pb-8">
            <h1 className="text-3xl md:text-4xl font-heading font-bold bg-gradient-to-r from-[hsl(var(--heading-gold))] via-[hsl(45_85%_60%)] to-[hsl(var(--heading-gold))] bg-clip-text text-transparent leading-tight">
              Kontakt
            </h1>
            <p className="mt-3 text-muted-foreground/80 text-[15px] md:text-base leading-relaxed">
              Informace o provozovateli aplikace OneMil
            </p>
          </header>
          
          <Separator className="mx-8 md:mx-12 bg-gradient-to-r from-transparent via-border/40 to-transparent" />
          
          {/* Content Section */}
          <div className="px-8 md:px-12 py-10 md:py-12 space-y-10">
            
            {/* Provozovatel */}
            <section className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-border/20">
                <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-[hsl(var(--heading-gold))]" />
                </div>
                <h2 className="font-heading font-semibold text-lg md:text-xl text-foreground">
                  Provozovatel
                </h2>
              </div>
              <div className="pl-0 md:pl-[52px] space-y-3">
                <p className="text-foreground font-medium text-lg">iCONIC POINT s.r.o.</p>
                <div className="flex items-center gap-3 text-muted-foreground text-[15px] md:text-base">
                  <FileText className="w-4 h-4 flex-shrink-0 text-[hsl(var(--heading-gold))]/70" />
                  <span>IČO: 177 95 851</span>
                </div>
              </div>
            </section>

            {/* Sídlo */}
            <section className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-border/20">
                <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-[hsl(var(--heading-gold))]" />
                </div>
                <h2 className="font-heading font-semibold text-lg md:text-xl text-foreground">
                  Sídlo
                </h2>
              </div>
              <div className="pl-0 md:pl-[52px]">
                <p className="text-muted-foreground text-[15px] md:text-base leading-[1.85]">
                  Na Folimance 2155/15, Vinohrady, 120 00 Praha 2
                </p>
              </div>
            </section>

            {/* Obchodní rejstřík */}
            <section className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-border/20">
                <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-[hsl(var(--heading-gold))]" />
                </div>
                <h2 className="font-heading font-semibold text-lg md:text-xl text-foreground">
                  Zápis v obchodním rejstříku
                </h2>
              </div>
              <div className="pl-0 md:pl-[52px]">
                <p className="text-muted-foreground text-[15px] md:text-base leading-[1.85]">
                  Zapsáno v obchodním rejstříku vedeném Městským soudem v Praze, oddíl C, vložka 376856
                </p>
              </div>
            </section>

            {/* Jednatel */}
            <section className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-border/20">
                <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-[hsl(var(--heading-gold))]" />
                </div>
                <h2 className="font-heading font-semibold text-lg md:text-xl text-foreground">
                  Jednatel
                </h2>
              </div>
              <div className="pl-0 md:pl-[52px]">
                <p className="text-muted-foreground text-[15px] md:text-base">Pavel Diviš</p>
              </div>
            </section>

            {/* Kontaktní údaje */}
            <section className="space-y-6 pt-4">
              <h2 className="font-heading font-semibold text-lg md:text-xl text-foreground pb-3 border-b border-border/20">
                Kontaktní údaje
              </h2>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-4 p-5 bg-muted/30 rounded-xl border border-border/20 transition-colors hover:bg-muted/40">
                  <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-[hsl(var(--heading-gold))]" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-medium">E-mail</p>
                    <a 
                      href="mailto:podpora@onemil.cz" 
                      className="text-[hsl(var(--heading-gold))] font-medium hover:underline text-[15px] md:text-base"
                    >
                      podpora@onemil.cz
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-5 bg-muted/30 rounded-xl border border-border/20 transition-colors hover:bg-muted/40">
                  <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-[hsl(var(--heading-gold))]" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-medium">Telefon</p>
                    <a 
                      href="tel:+420776532562" 
                      className="text-[hsl(var(--heading-gold))] font-medium hover:underline text-[15px] md:text-base"
                    >
                      +420 776 532 562
                    </a>
                  </div>
                </div>
              </div>
            </section>

            {/* Odkazy na právní dokumenty */}
            <div className="bg-muted/20 rounded-xl p-5 border border-border/20 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                Pro více informací navštivte naše{' '}
                <a href="/terms" className="text-[hsl(var(--heading-gold))] hover:underline font-medium">
                  Obchodní podmínky
                </a>
                {' '}nebo{' '}
                <a href="/privacy" className="text-[hsl(var(--heading-gold))] hover:underline font-medium">
                  Zásady ochrany osobních údajů
                </a>.
              </p>
            </div>
          </div>
        </article>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default Kontakt;