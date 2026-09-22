import React from 'react';
import { Link } from 'react-router-dom';
import './AuthVisual.css';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo-onemil.png';
import {
  ArrowLeft,
  ChevronRight,
  Megaphone,
  Coins,
  Users,
  Handshake,
  UserPlus,
  ClipboardCheck,
  Link2,
  LineChart,
} from 'lucide-react';

const InfluencerLanding = () => {
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

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center">
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

        <div className="om-auth-rise om-auth-rise-1 mb-6 text-center">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C2570A]">
            Affiliate program OneMil
          </p>
          <h1 className="font-heading text-2xl font-bold leading-tight text-[#1A1A1A] sm:text-[32px]">
            Doporučujte OneMil a vydělávejte
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#5B6572] sm:text-base">
            Affiliate program má dva režimy spolupráce: přivádíte zákazníky, nebo přivádíte firmy
            a e-shopy. Oba lze kombinovat na jednom účtu.
          </p>
        </div>

        <div className="om-auth-rise om-auth-rise-2 mb-8 flex flex-col gap-3 sm:flex-row">
          <Link to="/affiliate/register">
            <Button
              size="lg"
              className="om-auth-cta h-12 w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] px-8 text-base font-semibold text-[#1A1200] shadow-[0_10px_30px_-8px_rgba(255,138,0,0.55)] transition-all hover:shadow-[0_14px_36px_-6px_rgba(255,138,0,0.65)] hover:brightness-105 active:scale-[0.99] sm:w-auto"
            >
              Zaregistrovat se do Affiliate programu
              <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          </Link>
          <Link to="/influencer/how-to-earn">
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full rounded-xl border-[#E7E1D8] bg-white px-8 text-base font-semibold text-[#2B2B2B] hover:border-[#FF8A00]/50 hover:bg-[#FFF7EC] hover:text-[#2B2B2B] sm:w-auto"
            >
              Jak to funguje
            </Button>
          </Link>
        </div>

        {/* Benefit chips — same visual language as /affiliate/login, /affiliate/register */}
        <div className="om-auth-rise om-auth-rise-2 mb-10 grid w-full max-w-md grid-cols-3 gap-2">
          <div className="om-auth-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <Megaphone className="h-5 w-5 text-[#FF8A00]" />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Doporučení</span>
          </div>
          <div className="om-auth-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <Coins className="h-5 w-5 text-[#FF8A00]" />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Odměny</span>
          </div>
          <div className="om-auth-chip flex flex-col items-center gap-1.5 rounded-2xl border border-[#FFE3C2] bg-white/80 px-2 py-3 text-center shadow-[0_2px_10px_rgba(255,138,0,0.08)]">
            <Users className="h-5 w-5 text-[#FF8A00]" />
            <span className="text-[11px] font-medium text-[#4A4A4A]">Síť</span>
          </div>
        </div>

        {/* Two modes */}
        <div className="om-auth-rise om-auth-rise-3 mb-12 grid w-full grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="rounded-[28px] border border-[#F3E4CF] bg-white p-6 shadow-[0_20px_60px_-24px_rgba(26,20,10,0.25)] sm:p-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#FFD9A6] bg-[#FFF1DF]">
              <Megaphone className="h-7 w-7 text-[#C96A00]" />
            </div>
            <h2 className="font-heading text-xl font-bold text-[#1A1A1A]">Influencer</h2>
            <p className="mt-1 text-sm text-[#5B6572]">Přivádíte zákazníky</p>
            <p className="mt-4 text-sm leading-relaxed text-[#3A3A3A]">
              Sdílíte svůj osobní odkaz se svým publikem. Z každého placeného dobití,
              které přivedený zákazník provede, získáváte provizi — opakovaně, dokud
              je aktivní. Bonusová, partnerská a API dobití se do provize nepočítají.
            </p>
            <p className="mt-4 text-sm font-semibold text-[#1A1A1A]">
              Aktuální sazba: 5&nbsp;% z placených dobití přivedeného zákazníka
            </p>
          </div>

          <div className="rounded-[28px] border border-[#F3E4CF] bg-white p-6 shadow-[0_20px_60px_-24px_rgba(26,20,10,0.25)] sm:p-8">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#FFD9A6] bg-[#FFF1DF]">
              <Handshake className="h-7 w-7 text-[#C96A00]" />
            </div>
            <h2 className="font-heading text-xl font-bold text-[#1A1A1A]">Obchodník</h2>
            <p className="mt-1 text-sm text-[#5B6572]">Přivádíte firmy a e-shopy</p>
            <p className="mt-4 text-sm leading-relaxed text-[#3A3A3A]">
              Doporučujete OneMil firmám a e-shopům. Jakmile je přivedená firma
              schválena, OneMil jí fakturuje aktivované MioCoiny a vy získáváte
              provizi z každé faktury, kterou firma skutečně zaplatí.
            </p>
            <p className="mt-4 text-sm font-semibold text-[#1A1A1A]">
              Aktuální sazba: 5&nbsp;% z částky bez DPH, kterou OneMil firmě
              vyfakturuje a firma zaplatí
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="om-auth-rise om-auth-rise-3 mb-12 w-full">
          <h2 className="mb-6 text-center font-heading text-2xl font-bold text-[#1A1A1A]">Jak začít</h2>
          <div className="mx-auto max-w-2xl space-y-4">
            {[
              { icon: UserPlus, title: 'Zaregistrujte se', desc: 'Vyberte režim Influencer, Obchodník, nebo oba — lze je kombinovat na jednom účtu.' },
              { icon: ClipboardCheck, title: 'Počkejte na schválení', desc: 'Administrátor zkontroluje a schválí vaši registraci.' },
              { icon: Link2, title: 'Získejte svůj odkaz', desc: 'Po schválení najdete v Affiliate dashboardu svůj doporučovací kód a odkazy pro zákazníky i firmy.' },
              { icon: LineChart, title: 'Sledujte provize', desc: 'Provize se počítají z placených dobití zákazníků a ze skutečně zaplacených faktur firem — přehled najdete přímo v dashboardu.' },
            ].map((item, i) => (
              <div
                key={item.title}
                className="flex items-start gap-4 rounded-2xl border border-[#F3E4CF] bg-white p-4 shadow-[0_2px_10px_rgba(255,138,0,0.08)] sm:p-5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FFD9A6] bg-[#FFF1DF] text-sm font-bold text-[#C96A00]">
                  {i + 1}
                </div>
                <div>
                  <h3 className="font-heading text-base font-semibold text-[#1A1A1A]">{item.title}</h3>
                  <p className="mt-0.5 text-sm text-[#5B6572]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="om-auth-rise om-auth-rise-4 flex flex-col items-center gap-4 text-center">
          <Link to="/affiliate/register">
            <Button
              size="lg"
              className="om-auth-cta h-12 rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] px-8 text-base font-semibold text-[#1A1200] shadow-[0_10px_30px_-8px_rgba(255,138,0,0.55)] transition-all hover:shadow-[0_14px_36px_-6px_rgba(255,138,0,0.65)] hover:brightness-105 active:scale-[0.99]"
            >
              Registrovat se nyní
              <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          </Link>
          <p className="text-sm text-[#8A8A8A]">
            Už máte účet?{' '}
            <Link to="/affiliate/login" className="font-medium text-[#C2570A] hover:underline">
              Přihlaste se
            </Link>
          </p>
          <Link
            to="/"
            className="inline-flex items-center text-sm text-[#8A8A8A] transition-colors hover:text-[#1A1A1A]"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Zpět na hlavní stránku
          </Link>
        </div>
      </div>
    </div>
  );
};

export default InfluencerLanding;
