import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Star, Users, TrendingUp, Gift, ChevronRight } from 'lucide-react';

const InfluencerLanding = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
        <div className="container mx-auto px-4 py-16 sm:py-24 relative z-10">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-neon-gold transition-colors mb-8"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Zpět na hlavní stránku
          </Link>

          <div className="max-w-3xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-secondary/30 bg-secondary/5">
              <Star className="w-4 h-4 text-secondary" />
              <span className="text-sm font-medium text-secondary">Influencer program</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold">
              Staňte se influencerem OneMil
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              Spolupracujte s OneMil a propagujte unikátní soutěže o luxusní ceny.
              Získejte exkluzivní benefity a odměny za každého přivedeného uživatele.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link to="/influencer/register">
                <Button size="lg" className="w-full sm:w-auto text-base px-8">
                  Registrovat se jako influencer
                  <ChevronRight className="ml-1 w-5 h-5" />
                </Button>
              </Link>
              <Link to="/influencer/how-to-earn">
                <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-8">
                  Jak to funguje
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Proč spolupracovat s OneMil?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Card className="border-border/40 bg-card/60">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <Users className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Rostoucí komunita</h3>
              <p className="text-muted-foreground text-sm">
                Připojte se k platformě s tisíci aktivních uživatelů a rozšiřte svůj dosah.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/60">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center mx-auto">
                <TrendingUp className="w-7 h-7 text-secondary" />
              </div>
              <h3 className="text-xl font-semibold">Atraktivní odměny</h3>
              <p className="text-muted-foreground text-sm">
                Získejte odměnu za každého nového uživatele, který se zaregistruje přes váš odkaz.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/60">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <Gift className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Exkluzivní obsah</h3>
              <p className="text-muted-foreground text-sm">
                Přístup k materiálům, bannerům a exkluzivním soutěžím pro vaše sledující.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* How it works */}
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Jak začít?</h2>
        <div className="max-w-2xl mx-auto space-y-6">
          {[
            { step: '1', title: 'Zaregistrujte se', desc: 'Vyplňte registrační formulář s údaji o vašem profilu a sociálních sítích.' },
            { step: '2', title: 'Počkejte na schválení', desc: 'Náš tým zkontroluje váš profil a schválí vaši registraci.' },
            { step: '3', title: 'Začněte propagovat', desc: 'Po schválení získáte přístup k materiálům a můžete začít sdílet.' },
          ].map((item) => (
            <div key={item.step} className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                <span className="text-primary font-bold">{item.step}</span>
              </div>
              <div>
                <h4 className="font-semibold text-lg">{item.title}</h4>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link to="/influencer/register">
            <Button size="lg" className="text-base px-8">
              Registrovat se nyní
              <ChevronRight className="ml-1 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default InfluencerLanding;
