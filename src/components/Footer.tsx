import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Twitter, Instagram } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';

export const Footer: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  return (
    <footer className="mt-20 pt-10 bg-[hsl(220_50%_5%)]">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 mb-10">
          {/* Company Info */}
          <div className="space-y-4">
            <h4 className="font-semibold text-base text-foreground">OneMil</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Vaše platforma pro soutěže a výhry. Získejte šanci vyhrát luxusní ceny a vouchery.
            </p>
            <div className="flex space-x-3 pt-2">
              <a href="#" className="w-8 h-8 bg-neon-gold/15 rounded-full flex items-center justify-center border border-neon-gold/40 hover:bg-neon-gold/25 transition-colors">
                <Facebook className="w-4 h-4 text-neon-gold" />
              </a>
              <a href="#" className="w-8 h-8 bg-neon-gold/15 rounded-full flex items-center justify-center border border-neon-gold/40 hover:bg-neon-gold/25 transition-colors">
                <Twitter className="w-4 h-4 text-neon-gold" />
              </a>
              <a href="#" className="w-8 h-8 bg-neon-gold/15 rounded-full flex items-center justify-center border border-neon-gold/40 hover:bg-neon-gold/25 transition-colors">
                <Instagram className="w-4 h-4 text-neon-gold" />
              </a>
            </div>
          </div>

          {/* Information Links */}
          <div className="space-y-4">
            <h4 className="font-semibold text-base text-foreground">Informace</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/info/o-spolecnosti" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  O společnosti
                </Link>
              </li>
              <li>
                <Link to="/info/jak-to-funguje" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Jak to funguje
                </Link>
              </li>
              <li>
                <Link to="/info/nase-mise" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Naše mise
                </Link>
              </li>
            </ul>
          </div>

          {/* FAQ & Support */}
          <div className="space-y-4">
            <h4 className="font-semibold text-base text-foreground">Podpora</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/support/faq" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Často kladené otázky
                </Link>
              </li>
              <li>
                <Link to="/support/napoveda" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Centrum nápovědy
                </Link>
              </li>
              <li>
                <Link to="/support/kontakt" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Kontaktujte nás
                </Link>
              </li>
              <li>
                <Link to="/support/nahlasit-problem" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Nahlásit problém
                </Link>
              </li>
              <li>
                <Link to="/support/zivy-chat" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Živý chat
                </Link>
              </li>
          </ul>
          </div>

          {/* Legal Terms */}
          <div className="space-y-4">
            <h4 className="font-semibold text-base text-foreground">Právní podmínky</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Obchodní podmínky
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Zásady ochrany osobních údajů
                </Link>
              </li>
              <li>
                <Link to="/legal/pravidla-soutezi" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Pravidla soutěží
                </Link>
              </li>
              <li>
                <Link to="/legal/cookies" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Zásady použití cookies
                </Link>
              </li>
              <li>
                <Link to="/legal/autorska-prava" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Autorská práva
                </Link>
              </li>
              <li>
                <Link to="/delete-account" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Smazání účtu
                </Link>
              </li>
            </ul>
          </div>

          {/* Partner Section */}
          <div className="space-y-4">
            <h4 className="font-semibold text-base text-foreground">Pro partnery</h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/partner/login" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Přihlášení partnera
                </Link>
              </li>
              <li>
                <Link to="/partner/register" className="text-muted-foreground hover:text-primary transition-colors duration-200">
                  Registrace e-shopu
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Company Info - Provozovatel */}
      <div className="border-t border-border/40 py-6 px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-1.5 text-sm text-muted-foreground">
          <p className="font-semibold text-heading-gold">Provozovatel: iCONIC POINT s.r.o.</p>
          <p>IČO: 177 95 851 | Sídlo: Na Folimance 2155/15, Vinohrady, 120 00 Praha 2</p>
          <p>Zapsáno v obchodním rejstříku vedeném Městským soudem v Praze, oddíl C, vložka 376856</p>
          <p>
            <span className="font-medium text-foreground">Jednatel:</span> Pavel Diviš | 
            <span className="font-medium text-foreground"> E-mail:</span> <a href="mailto:podpora@onemil.cz" className="text-primary hover:underline">podpora@onemil.cz</a> | 
            <span className="font-medium text-foreground"> Tel:</span> <a href="tel:+420776532562" className="text-primary hover:underline">+420 776 532 562</a>
          </p>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-border/40 py-4 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="text-sm text-muted-foreground">© 2024 iCONIC POINT s.r.o. Všechna práva vyhrazena.</div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/kontakt" className="hover:text-primary transition-colors">Kontakt</Link>
            <span className="text-border">•</span>
            <span>Česká republika</span>
            <span className="text-border">•</span>
            <span>
              {isAdmin && "Admin režim"}
              {!isAdmin && user && "Přihlášený uživatel"}
              {!user && "Návštěvník"}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
