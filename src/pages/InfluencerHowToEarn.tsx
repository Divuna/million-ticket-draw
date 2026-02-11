import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Share2, UserPlus, Coins, BarChart3, ChevronRight } from 'lucide-react';

const InfluencerHowToEarn = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10 sm:py-16 max-w-4xl">
        <Link
          to="/influencer"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors mb-8"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Zpět na Pro influencery
        </Link>

        <div className="space-y-4 mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold">Jak vydělávat s OneMil</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Zjistěte, jak můžete spolupracovat s OneMil a získávat odměny za propagaci
            našich soutěží o luxusní ceny.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-8 mb-16">
          <Card className="border-border/40 bg-card/60 overflow-hidden">
            <CardContent className="p-6 sm:p-8 flex gap-5 items-start">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Share2 className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">1. Sdílejte soutěže</h3>
                <p className="text-muted-foreground">
                  Po schválení vašeho profilu získáte přístup ke sdíleným odkazům a materiálům.
                  Sdílejte soutěže OneMil na svých sociálních sítích a oslovte své sledující.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/60 overflow-hidden">
            <CardContent className="p-6 sm:p-8 flex gap-5 items-start">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center shrink-0">
                <UserPlus className="w-6 h-6 text-secondary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">2. Přivádějte uživatele</h3>
                <p className="text-muted-foreground">
                  Za každého nového uživatele, který se zaregistruje přes váš odkaz,
                  získáte odměnu. Čím více lidí přivedete, tím více vyděláte.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/60 overflow-hidden">
            <CardContent className="p-6 sm:p-8 flex gap-5 items-start">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Coins className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">3. Získejte odměny</h3>
                <p className="text-muted-foreground">
                  Za aktivitu vašich přizvaných uživatelů dostáváte provize.
                  Podrobnosti o výplatách a provizích budou upřesněny po schválení vaší registrace.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/60 overflow-hidden">
            <CardContent className="p-6 sm:p-8 flex gap-5 items-start">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center shrink-0">
                <BarChart3 className="w-6 h-6 text-secondary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">4. Sledujte statistiky</h3>
                <p className="text-muted-foreground">
                  V influencer dashboardu uvidíte přehled vašich přizvaných uživatelů,
                  výdělků a statistik. Dashboard bude dostupný po schválení registrace.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* FAQ */}
        <div className="space-y-6 mb-16">
          <h2 className="text-2xl font-bold">Časté otázky</h2>
          <div className="space-y-4">
            {[
              {
                q: 'Kdo se může stát influencerem?',
                a: 'Každý, kdo má aktivní profil na sociálních sítích a zajímá se o spolupráci s OneMil. Vhodné pro tvůrce obsahu, bloggery, streameři a další.',
              },
              {
                q: 'Jak dlouho trvá schválení?',
                a: 'Schválení registrace obvykle trvá 1–3 pracovní dny. O výsledku vás budeme informovat e-mailem.',
              },
              {
                q: 'Je registrace zdarma?',
                a: 'Ano, registrace jako influencer je zcela zdarma. Neplatíte žádné poplatky.',
              },
              {
                q: 'Jaké materiály dostanu?',
                a: 'Po schválení získáte přístup k bannerům, odkazům, promo kódům a dalším materiálům pro propagaci.',
              },
            ].map((faq, i) => (
              <Card key={i} className="border-border/40 bg-card/60">
                <CardContent className="p-5">
                  <h4 className="font-semibold mb-2">{faq.q}</h4>
                  <p className="text-muted-foreground text-sm">{faq.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center space-y-4 pb-8">
          <h2 className="text-2xl font-bold">Připraveni začít?</h2>
          <p className="text-muted-foreground">
            Zaregistrujte se a začněte spolupracovat s OneMil ještě dnes.
          </p>
          <Link to="/influencer/register">
            <Button size="lg" className="text-base px-8">
              Registrovat se jako influencer
              <ChevronRight className="ml-1 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default InfluencerHowToEarn;
