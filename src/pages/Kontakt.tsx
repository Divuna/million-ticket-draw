import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Header } from '@/components/Header';
import { Separator } from '@/components/ui/separator';
import { Building2, Mail, Phone, MapPin, FileText, User, Quote, Sparkles } from 'lucide-react';

const GOLD = 'hsl(var(--heading-gold))';

const Kontakt: React.FC = () => {
  return (
    <div className="min-h-screen bg-background pb-24">
      <Helmet>
        <title>Kontakt | OneMil</title>
        <meta name="description" content="Kontaktní informace a údaje o provozovateli aplikace OneMil - iCONIC POINT s.r.o." />
      </Helmet>

      <Header />

      {/* Ambient premium glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full bg-[radial-gradient(circle,rgba(255,138,0,0.10),transparent_60%)]" />
      </div>

      <main className="max-w-[980px] mx-auto px-4 sm:px-6 py-10 md:py-16 space-y-8">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <header className="text-center space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,138,0,0.3)] bg-[rgba(255,138,0,0.06)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FFB547]">
            <Sparkles className="w-3.5 h-3.5" /> OneMil
          </span>
          <h1 className="text-4xl md:text-5xl font-heading font-bold bg-gradient-to-r from-[hsl(var(--heading-gold))] via-[#FFB547] to-[hsl(var(--heading-gold))] bg-clip-text text-transparent leading-tight">
            Kontakt
          </h1>
          <p className="text-muted-foreground/80 text-[15px] md:text-base">
            Informace o provozovateli aplikace OneMil
          </p>
        </header>

        {/* ── Vzkaz zakladatele ────────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden rounded-3xl border border-[rgba(255,138,0,0.22)] bg-gradient-to-b from-[hsl(220_30%_11%)] via-[hsl(220_28%_8%)] to-[hsl(222_35%_6%)] shadow-[0_12px_48px_hsl(222_50%_3%/0.55)]"
          aria-labelledby="founder-heading"
        >
          {/* top accent line */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(255,181,71,0.6)] to-transparent" />

          <div className="p-6 sm:p-9 md:p-12">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              {/* Photo placeholder (no generated image) */}
              <div className="shrink-0 mx-auto sm:mx-0">
                <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-2xl bg-gradient-to-br from-[hsl(45_80%_45%)] via-[hsl(35_85%_38%)] to-[hsl(30_80%_30%)] p-[2px] shadow-[0_8px_30px_rgba(255,138,0,0.28)]">
                  <div className="w-full h-full rounded-2xl bg-[hsl(220_25%_10%)] flex flex-col items-center justify-center gap-1">
                    <span className="font-heading font-bold text-2xl md:text-3xl bg-gradient-to-br from-[#FFB547] to-[hsl(var(--heading-gold))] bg-clip-text text-transparent">
                      PD
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Foto brzy</span>
                  </div>
                </div>
              </div>

              <div className="text-center sm:text-left">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#FFB547] font-semibold mb-1">Vzkaz zakladatele</p>
                <h2 id="founder-heading" className="font-heading font-bold text-2xl md:text-3xl text-foreground">
                  Pavel Diviš
                </h2>
                <p className="text-muted-foreground/85 text-[15px] mt-1">Jednatel / zakladatel OneMil</p>
              </div>
            </div>

            <div className="mt-7 space-y-5 text-[15px] md:text-[16px] leading-[1.85] text-muted-foreground">
              <p>
                OneMil vzniká s jednoduchou myšlenkou: odměňovat lidi za běžné nákupy a dát jim šanci zažít
                něco navíc. Nechceme být jen další aplikace. Chceme vybudovat platformu, která bude lidi bavit,
                překvapovat a spojovat kolem soutěží, výher a odměn.
              </p>
              <p>
                Naším cílem je, aby se z OneMil postupně stala velká show — místo, kde běžný nákup může otevřít
                dveře k něčemu výjimečnému. Čeká nás dlouhá cesta, ale věříme, že když ji budeme stavět férově,
                s nadšením a společně s vámi, může z toho vzniknout něco opravdu velkého.
              </p>

              <blockquote className="relative mt-2 rounded-2xl border-l-2 border-[rgba(255,181,71,0.7)] bg-[rgba(255,138,0,0.05)] px-5 py-4">
                <Quote className="absolute -top-2 left-3 w-5 h-5 text-[rgba(255,181,71,0.55)]" />
                <p className="font-heading text-foreground/95 text-[16px] md:text-[18px] leading-relaxed italic">
                  „Chceme, aby OneMil nebyl jen o výhrách, ale o radosti, napětí a pocitu, že každý nákup může mít příběh.“
                </p>
              </blockquote>
            </div>
          </div>
        </section>

        {/* ── Firemní a právní údaje ───────────────────────────────────────── */}
        <article className="rounded-3xl border border-border/30 bg-gradient-to-b from-card/60 to-card/40 backdrop-blur-sm shadow-[0_8px_32px_hsl(222_50%_3%/0.4)]">
          <div className="px-6 sm:px-9 md:px-12 py-9 md:py-11 space-y-9">

            <div className="grid gap-5 sm:grid-cols-2">
              {/* Provozovatel */}
              <section className="rounded-2xl border border-border/20 bg-muted/20 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5" style={{ color: GOLD }} />
                  </div>
                  <h2 className="font-heading font-semibold text-base md:text-lg text-foreground">Provozovatel</h2>
                </div>
                <div className="space-y-1.5">
                  <p className="text-foreground font-medium text-lg">iCONIC POINT s.r.o.</p>
                  <div className="flex items-center gap-2 text-muted-foreground text-[15px]">
                    <FileText className="w-4 h-4 flex-shrink-0" style={{ color: `${GOLD}` }} />
                    <span>IČO: 177 95 851</span>
                  </div>
                </div>
              </section>

              {/* Sídlo */}
              <section className="rounded-2xl border border-border/20 bg-muted/20 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5" style={{ color: GOLD }} />
                  </div>
                  <h2 className="font-heading font-semibold text-base md:text-lg text-foreground">Sídlo</h2>
                </div>
                <p className="text-muted-foreground text-[15px] leading-[1.75]">
                  Na Folimance 2155/15, Vinohrady, 120 00 Praha 2
                </p>
              </section>

              {/* Obchodní rejstřík */}
              <section className="rounded-2xl border border-border/20 bg-muted/20 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5" style={{ color: GOLD }} />
                  </div>
                  <h2 className="font-heading font-semibold text-base md:text-lg text-foreground">Obchodní rejstřík</h2>
                </div>
                <p className="text-muted-foreground text-[15px] leading-[1.75]">
                  Zapsáno v obchodním rejstříku vedeném Městským soudem v Praze, oddíl C, vložka 376856
                </p>
              </section>

              {/* Jednatel */}
              <section className="rounded-2xl border border-border/20 bg-muted/20 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5" style={{ color: GOLD }} />
                  </div>
                  <h2 className="font-heading font-semibold text-base md:text-lg text-foreground">Jednatel</h2>
                </div>
                <p className="text-muted-foreground text-[15px]">Pavel Diviš</p>
              </section>
            </div>

            <Separator className="bg-gradient-to-r from-transparent via-border/40 to-transparent" />

            {/* Kontaktní údaje */}
            <section className="space-y-5">
              <h2 className="font-heading font-semibold text-lg md:text-xl text-foreground">Kontaktní údaje</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <a
                  href="mailto:podpora@onemil.cz"
                  className="flex items-center gap-4 p-5 bg-muted/30 rounded-xl border border-border/20 transition-all hover:bg-muted/40 hover:border-[rgba(255,138,0,0.35)]"
                >
                  <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5" style={{ color: GOLD }} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-medium">E-mail</p>
                    <span className="text-[hsl(var(--heading-gold))] font-medium text-[15px] md:text-base">podpora@onemil.cz</span>
                  </div>
                </a>

                <a
                  href="tel:+420776532562"
                  className="flex items-center gap-4 p-5 bg-muted/30 rounded-xl border border-border/20 transition-all hover:bg-muted/40 hover:border-[rgba(255,138,0,0.35)]"
                >
                  <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5" style={{ color: GOLD }} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-medium">Telefon</p>
                    <span className="text-[hsl(var(--heading-gold))] font-medium text-[15px] md:text-base">+420 776 532 562</span>
                  </div>
                </a>
              </div>
            </section>

          </div>
        </article>
      </main>
    </div>
  );
};

export default Kontakt;
