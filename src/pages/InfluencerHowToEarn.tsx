import React from 'react';
import { Link } from 'react-router-dom';
import './AuthVisual.css';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo-onemil.png';
import {
  ArrowLeft,
  ChevronRight,
  UserPlus,
  ClipboardCheck,
  Link2,
  LineChart,
  Megaphone,
  Handshake,
} from 'lucide-react';

const stepCard =
  'flex items-start gap-4 rounded-2xl border border-[#F3E4CF] bg-white p-4 shadow-[0_2px_10px_rgba(255,138,0,0.08)] sm:p-5';
const stepNumber =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FFD9A6] bg-[#FFF1DF] text-sm font-bold text-[#C96A00]';

const InfluencerHowToEarn = () => {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-[#FFF8EE] via-[#FFF4E7] to-white px-4 py-10 sm:py-14">
      {/* Ambient decorative glow — purely visual, does not affect layout flow */}
      <div
        aria-hidden="true"
        className="om-auth-blob-a pointer-events-none absolute -top-20 -right-14 h-64 w-64 rounded-full bg-[#FF8A00]/25 blur-[90px] sm:h-80 sm:w-80"
      />
      <div
        aria-hidden="true"
        className="om-auth-blob-b pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[#FFB547]/30 blur-[90px] sm:h-80 sm:w-80"
      />
      <div
        aria-hidden="true"
        className="om-auth-dotgrid pointer-events-none absolute inset-x-0 top-0 h-[420px]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center">
        <Link
          to="/"
          aria-label="Zpět na OneMil"
          className="om-auth-medallion om-auth-rise mb-5 block overflow-hidden rounded-[26px] shadow-[0_18px_40px_-14px_rgba(255,138,0,0.4)]"
        >
          <img
            src={logo}
            alt="OneMil — luxusní soutěže, skutečné výhry"
            className="h-20 w-20 object-cover sm:h-24 sm:w-24"
          />
        </Link>

        <Link
          to="/influencer"
          className="om-auth-rise mb-4 inline-flex items-center text-sm text-[#8A8A8A] transition-colors hover:text-[#1A1A1A]"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Zpět na Affiliate program
        </Link>

        <div className="om-auth-rise om-auth-rise-1 mb-10 text-center">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C2570A]">
            Affiliate program OneMil
          </p>
          <h1 className="font-heading text-2xl font-bold leading-tight text-[#1A1A1A] sm:text-[32px]">
            Jak vydělávat s OneMil
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#5B6572] sm:text-base">
            Podrobný přehled, jak Affiliate program funguje — od registrace po výplatu provizí.
          </p>
        </div>

        {/* Steps */}
        <div className="om-auth-rise om-auth-rise-2 mb-12 w-full space-y-4">
          <div className={stepCard}>
            <div className={stepNumber}>1</div>
            <div>
              <h3 className="font-heading text-base font-semibold text-[#1A1A1A]">
                <UserPlus className="mr-1.5 inline-block h-4 w-4 -translate-y-0.5 text-[#FF8A00]" />
                Zaregistrujte se a zvolte režim
              </h3>
              <p className="mt-0.5 text-sm text-[#5B6572]">
                V registraci vyberte, zda chcete přivádět <strong>zákazníky</strong> (režim
                Influencer), <strong>firmy a e-shopy</strong> (režim Obchodník), nebo oba
                zároveň — oba režimy fungují na jednom účtu.
              </p>
            </div>
          </div>

          <div className={stepCard}>
            <div className={stepNumber}>2</div>
            <div>
              <h3 className="font-heading text-base font-semibold text-[#1A1A1A]">
                <ClipboardCheck className="mr-1.5 inline-block h-4 w-4 -translate-y-0.5 text-[#FF8A00]" />
                Počkejte na schválení
              </h3>
              <p className="mt-0.5 text-sm text-[#5B6572]">
                Administrátor OneMil zkontroluje vaši registraci. O výsledku vás budeme
                informovat e-mailem na adresu, kterou jste zadali.
              </p>
            </div>
          </div>

          <div className={stepCard}>
            <div className={stepNumber}>3</div>
            <div>
              <h3 className="font-heading text-base font-semibold text-[#1A1A1A]">
                <Link2 className="mr-1.5 inline-block h-4 w-4 -translate-y-0.5 text-[#FF8A00]" />
                Získejte svůj doporučovací odkaz
              </h3>
              <p className="mt-0.5 text-sm text-[#5B6572]">
                Po schválení najdete v Affiliate dashboardu svůj doporučovací kód a dva
                odkazy — jeden pro zákazníky, druhý pro firmy — které můžete sdílet na
                svých kanálech nebo s kontakty.
              </p>
            </div>
          </div>

          <div className={stepCard}>
            <div className={stepNumber}>4</div>
            <div>
              <h3 className="font-heading text-base font-semibold text-[#1A1A1A]">
                <LineChart className="mr-1.5 inline-block h-4 w-4 -translate-y-0.5 text-[#FF8A00]" />
                Sledujte provize v dashboardu
              </h3>
              <p className="mt-0.5 text-sm text-[#5B6572]">
                Provize se počítají z reálné aktivity přivedených zákazníků a firem —
                z dokončených plateb zákazníků a ze zaplacených faktur firem. Přehled
                a stav výplaty vidíte přímo v Affiliate dashboardu.
              </p>
            </div>
          </div>
        </div>

        {/* Two modes recap */}
        <div className="om-auth-rise om-auth-rise-3 mb-12 grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="rounded-[28px] border border-[#F3E4CF] bg-white p-6 shadow-[0_20px_60px_-24px_rgba(26,20,10,0.25)]">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#FFD9A6] bg-[#FFF1DF]">
              <Megaphone className="h-6 w-6 text-[#C96A00]" />
            </div>
            <h3 className="font-heading text-lg font-bold text-[#1A1A1A]">Influencer</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#3A3A3A]">
              5&nbsp;% z obratu každého přivedeného zákazníka, opakovaně z každé jeho dokončené platby.
            </p>
          </div>
          <div className="rounded-[28px] border border-[#F3E4CF] bg-white p-6 shadow-[0_20px_60px_-24px_rgba(26,20,10,0.25)]">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#FFD9A6] bg-[#FFF1DF]">
              <Handshake className="h-6 w-6 text-[#C96A00]" />
            </div>
            <h3 className="font-heading text-lg font-bold text-[#1A1A1A]">Obchodník</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#3A3A3A]">
              5&nbsp;% z fakturace každé přivedené firmy, z každé faktury, kterou OneMil firmě
              vystaví a firma zaplatí.
            </p>
          </div>
        </div>

        {/* FAQ */}
        <div className="om-auth-rise om-auth-rise-3 mb-12 w-full">
          <h2 className="mb-6 text-center font-heading text-2xl font-bold text-[#1A1A1A]">Časté otázky</h2>
          <div className="space-y-4">
            {[
              {
                q: 'Kdo se může stát Affiliate partnerem?',
                a: 'Kdokoli, kdo chce doporučovat OneMil — tvůrci obsahu, agentury, obchodní zástupci i firmy s vlastní sítí kontaktů.',
              },
              {
                q: 'Je registrace zdarma?',
                a: 'Ano, registrace jako Affiliate partner je zcela zdarma. Neplatíte žádné poplatky.',
              },
              {
                q: 'Mohu být zároveň Influencer i Obchodník?',
                a: 'Ano, oba režimy lze zvolit současně při registraci a přepínat mezi nimi přímo v Affiliate dashboardu.',
              },
              {
                q: 'Jak a kdy dostanu vyplaceno?',
                a: 'Provize se počítají z reálné aktivity přivedených zákazníků a firem. Stav a historii výplat vidíte v Affiliate dashboardu.',
              },
            ].map((faq) => (
              <div
                key={faq.q}
                className="rounded-2xl border border-[#F3E4CF] bg-white p-5 shadow-[0_2px_10px_rgba(255,138,0,0.08)] sm:p-6"
              >
                <h4 className="font-heading font-semibold text-[#1A1A1A]">{faq.q}</h4>
                <p className="mt-1.5 text-sm text-[#5B6572]">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="om-auth-rise om-auth-rise-4 flex flex-col items-center gap-4 pb-4 text-center">
          <h2 className="font-heading text-2xl font-bold text-[#1A1A1A]">Připraveni začít?</h2>
          <p className="text-sm text-[#5B6572]">Zaregistrujte se a začněte spolupracovat s OneMil ještě dnes.</p>
          <Link to="/affiliate/register">
            <Button
              size="lg"
              className="om-auth-cta h-12 rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] px-8 text-base font-semibold text-[#1A1200] shadow-[0_10px_30px_-8px_rgba(255,138,0,0.55)] transition-all hover:shadow-[0_14px_36px_-6px_rgba(255,138,0,0.65)] hover:brightness-105 active:scale-[0.99]"
            >
              Registrovat se jako Affiliate partner
              <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default InfluencerHowToEarn;
