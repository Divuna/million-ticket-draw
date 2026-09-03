import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShoppingBag,
  Coins,
  Trophy,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Store,
  Wrench,
  BadgeCheck,
  Percent,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import logo from '@/assets/logo-onemil.png';

// Feature flags — obsahové karty, které se zatím nezobrazují.
const SHOW_PARTNER_15MC_CARD = false;
const SHOW_TRIAL_CARD = true;
const SHOW_REWARD_EXPIRY_CLAIM = true;

const ORANGE_GRADIENT = 'linear-gradient(135deg, #FF8A00, #FFB547)';

function CtaButton({ to, children, className = '' }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <Button
      asChild
      className={`rounded-full px-8 py-6 text-base font-semibold text-black shadow-[0_10px_30px_rgba(255,138,0,0.35)] hover:brightness-110 transition-all ${className}`}
      style={{ background: ORANGE_GRADIENT }}
    >
      <Link to={to}>{children}</Link>
    </Button>
  );
}

export default function PartnerEshopLanding() {
  const [searchParams] = useSearchParams();
  const via = searchParams.get('via')?.trim();
  const registerPath = via ? `/partner/register?via=${encodeURIComponent(via)}` : '/partner/register';

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#111111] antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/pro-eshopy" className="flex items-center gap-3">
            <img src={logo} alt="OneMil logo" className="h-9 w-auto object-contain" />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/partner/login"
              className="hidden text-sm font-medium text-black/60 transition-colors hover:text-black sm:inline"
            >
              Přihlášení partnera
            </Link>
            <Button
              asChild
              className="rounded-full px-5 py-2 text-sm font-semibold text-black hover:brightness-110"
              style={{ background: ORANGE_GRADIENT }}
            >
              <Link to={registerPath}>Chci spolupracovat</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-white">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              'radial-gradient(600px 300px at 85% -10%, rgba(255,138,0,0.10), transparent 60%), radial-gradient(500px 260px at 5% 110%, rgba(255,138,0,0.06), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24 text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
            style={{ color: '#D97300' }}
          >
            <Store className="h-3.5 w-3.5" />
            Pro e-shopy
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Dejte zákazníkům víc než jen slevu.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-black/60">
            Zákazník po nákupu u vás získá MioCoiny, které může využít v soutěžích OneMil
            o prémiové ceny. Vy získáte důvod, proč se k vám vracet.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <CtaButton to={registerPath}>
              Zapojit e-shop zdarma <ArrowRight className="ml-2 h-5 w-5" />
            </CtaButton>
            <span className="text-sm font-medium text-black/50">Zapojení připravíme za vás.</span>
          </div>
        </div>
      </section>

      {/* Benefit strip */}
      <section className="border-y border-black/5 bg-[#FAFAF9]">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-8 sm:grid-cols-3">
          {[
            { icon: BadgeCheck, title: 'Zapojení zdarma', text: 'Žádné vstupní ani měsíční poplatky.' },
            { icon: Percent, title: 'Platíte jen za aktivované MioCoiny', text: 'Nevyužitá odměna vás nic nestojí.' },
            { icon: Wrench, title: 'Bez programování', text: 'Shoptet napojení zvládnete bez vývojáře.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3 rounded-2xl bg-white p-5 shadow-[0_8px_24px_rgba(17,17,17,0.05)]">
              <span
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-black"
                style={{ background: ORANGE_GRADIENT }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-sm text-black/55">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Jak to funguje */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Jak to funguje</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-black/55">
          Jednoduchý princip, který zákazník pochopí během vteřiny.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ShoppingBag, step: '1', title: 'Nákup u vás', text: 'Zákazník nakoupí ve vašem e-shopu jako obvykle.' },
            { icon: Coins, step: '2', title: 'Získá MioCoiny', text: 'Za objednávku od vás dostane odměnu v MioCoinech.' },
            { icon: Sparkles, step: '3', title: 'Využije v OneMil', text: 'MioCoiny uplatní a vstoupí do aktuálních soutěží.' },
            { icon: Trophy, step: '4', title: 'Soutěží o prémiové ceny', text: 'Hraje o prémiové ceny v soutěžích OneMil.' },
          ].map(({ icon: Icon, step, title, text }) => (
            <Card key={step} className="rounded-2xl border-black/5 bg-white shadow-[0_10px_30px_rgba(17,17,17,0.06)]">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-black"
                    style={{ background: ORANGE_GRADIENT }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-4xl font-extrabold text-orange-100">{step}</span>
                </div>
                <p className="mt-4 font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-black/55">{text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Model / billing */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <span
                className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: '#D97300' }}
              >
                <Coins className="h-3.5 w-3.5" />
                Férový model
              </span>
              <h2 className="mt-5 text-3xl font-bold tracking-tight">Platíte jen za to, co zákazníci skutečně využijí</h2>
              <ul className="mt-6 space-y-3">
                {[
                  'Zapojení zdarma',
                  'Platíte jen za aktivované MioCoiny',
                  '1 aktivovaný MioCoin = 1 Kč + DPH',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <span className="text-black/75">{item}</span>
                  </li>
                ))}
              </ul>

              {SHOW_TRIAL_CARD && (
                <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <p className="font-semibold text-emerald-900">
                    První 2 MioCoiny z každé aktivované odměny zdarma
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-emerald-800/80">
                    Po dobu 30 dní hradí OneMil první 2 MioCoiny z každé odměny, kterou zákazník
                    během zahajovací akce aktivuje.
                  </p>
                </div>
              )}

              {SHOW_REWARD_EXPIRY_CLAIM && (
                <div className="mt-4 rounded-2xl border border-black/5 bg-[#FAFAF9] p-5">
                  <p className="text-sm leading-relaxed text-black/65">
                    Zákazník má 90 dní na aktivaci odměny od jejího vydání. Pokud ji nevyužije,
                    nic za ni neplatíte.
                  </p>
                </div>
              )}

              {SHOW_PARTNER_15MC_CARD && (
                <div className="mt-4 rounded-2xl border border-black/5 bg-[#FAFAF9] p-5">
                  <p className="text-sm text-black/65">15 MioCoinů — karta se zatím nezobrazuje.</p>
                </div>
              )}
            </div>

            {/* Výpočtový příklad */}
            <Card className="rounded-3xl border-black/5 bg-white shadow-[0_18px_50px_rgba(17,17,17,0.08)]">
              <CardContent className="p-7">
                <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
                  Modelový příklad za měsíc
                </p>
                <div className="mt-5 space-y-3 text-sm">
                  {[
                    ['Průměrná objednávka', '300 Kč'],
                    ['Objednávky za měsíc', '1 368'],
                    ['Odměna za objednávku', '5 MioCoinů'],
                    ['Uplatněné objednávky', '821 (~60 %)'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between border-b border-black/5 pb-3">
                      <span className="text-black/55">{label}</span>
                      <span className="font-semibold">{value}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-b border-black/5 pb-3">
                    <span className="text-black/55">Potenciálně rozdané</span>
                    <span className="font-semibold">6 840 MC</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-black/5 pb-3">
                    <span className="text-black/55">Aktivované</span>
                    <span className="font-semibold text-emerald-700">4 105 MC</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-black/5 pb-3">
                    <span className="text-black/55">Nevyužité</span>
                    <span className="font-semibold">2 735 MC</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-semibold">Náklad partnera</span>
                    <span className="text-lg font-extrabold" style={{ color: '#D97300' }}>
                      4 105 Kč + DPH
                    </span>
                  </div>
                  <p className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800">
                    2 735 nevyužitých MioCoinů = 0 Kč účtováno
                  </p>
                  <p className="text-xs leading-relaxed text-black/40">
                    Modelový výpočet se zahajovací akce nijak nedotýká — benefit 2 MioCoinů zdarma
                    je samostatný a není započítán do nákladu výše.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Shoptet integrace */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span
              className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
              style={{ color: '#D97300' }}
            >
              <Wrench className="h-3.5 w-3.5" />
              Shoptet integrace
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight">Napojení bez programování</h2>
            <p className="mt-4 leading-relaxed text-black/60">
              Používáte Shoptet? Napojení zvládnete sami během několika minut — stačí vložit
              jednoduchý export a my se postaráme o zbytek. Krok za krokem vás provede připravený
              návod přímo v partnerském portálu.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Žádný vývojář není potřeba',
                'Automatické zpracování objednávek',
                'Přehled vydaných a aktivovaných odměn v portálu',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span className="text-black/75">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <Card className="rounded-3xl border-black/5 bg-white shadow-[0_18px_50px_rgba(17,17,17,0.08)]">
            <CardContent className="p-7">
              <div className="space-y-4">
                {[
                  ['1', 'Vložíte export z Shoptetu'],
                  ['2', 'My objednávky zpracujeme'],
                  ['3', 'Zákazníkům vydáme MioCoiny'],
                ].map(([step, text]) => (
                  <div
                    key={step}
                    className="flex items-center gap-4 rounded-2xl border border-black/5 bg-[#FAFAF9] p-4"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-black"
                      style={{ background: ORANGE_GRADIENT }}
                    >
                      {step}
                    </span>
                    <span className="font-medium text-black/75">{text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Objection */}
      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Vy prodáváte. Zapojení vyřešíme my.</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-black/55">
            Nemusíte nic programovat, nic nastavovat v systémech ani řešit odměny ručně.
            Celou technickou stránku připravíme za vás — vy se jen díváte, jak se zákazníci vrací.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div
          className="rounded-3xl px-6 py-14 text-center shadow-[0_18px_50px_rgba(255,138,0,0.15)]"
          style={{
            background:
              'linear-gradient(160deg, #FFF7ED 0%, #FFFFFF 55%, #FFF1E0 100%)',
            border: '1px solid rgba(255,138,0,0.18)',
          }}
        >
          <h2 className="text-3xl font-bold tracking-tight">Připraveni dát zákazníkům víc?</h2>
          <p className="mx-auto mt-3 max-w-xl text-black/55">
            Zapojení je zdarma a platíte jen za odměny, které zákazníci skutečně využijí.
          </p>
          <div className="mt-8">
            <CtaButton to={registerPath}>
              Zaregistrovat e-shop <ArrowRight className="ml-2 h-5 w-5" />
            </CtaButton>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <img src={logo} alt="OneMil logo" className="h-8 w-auto object-contain opacity-80" />
          <p className="text-xs text-black/40">
            MioCoin je interní kredit OneMil. Nelze jej vyplatit v penězích ani převést mimo OneMil.
          </p>
        </div>
      </footer>
    </div>
  );
}
