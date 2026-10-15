import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Facebook, Instagram } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useFooterLinks } from '@/hooks/useFooterLinks';
import { openConsentSettings } from '@/lib/consent';
import { InstallAppButton } from '@/components/InstallAppButton';
import onemilLogo from '@/assets/redesign/onemil-logo.png';
import avatarPeek from '@/assets/redesign/avatar/avatar-palec.png';

const linkClass = 'text-muted-foreground hover:text-neon-gold transition-colors duration-200';

/**
 * Sloupec patičky. V novém vzhledu (.om-redesign) se na mobilu sbalí do
 * rozbalovacího řádku; jinde (i na desktopu) je vždy rozbalený jako dosud.
 */
const FooterCol: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="om-ft-col space-y-4" data-open={open ? 'true' : 'false'}>
      <h4 className="font-semibold text-base text-foreground">
        <button
          type="button"
          className="om-ft-toggle w-full cursor-default text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {title}
          <span className="om-ft-sign hidden" aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
      </h4>
      <ul className="om-ft-links space-y-2.5 text-sm">{children}</ul>
    </div>
  );
};

export const Footer: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { links } = useFooterLinks();
  const { pathname } = useLocation();
  const isB2BPage = pathname.startsWith('/pro-eshopy') || pathname.startsWith('/partnerstvi');

  return (
    <footer className="om-footer relative mt-20 pt-10 bg-[hsl(220_50%_5%)]">
      <div className="om-ft-topline hidden" aria-hidden="true"><i /></div>
      <img src={avatarPeek} alt="" aria-hidden="true" className="om-ft-peek hidden" />
      <div className="relative px-4 sm:px-6 lg:px-8">
        <div className="om-ft-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 mb-10">
          {/* Company Info */}
          <div className="om-ft-about space-y-4">
            <h4 className="om-ft-brand font-semibold text-base text-foreground">OneMil</h4>
            <img src={onemilLogo} alt="OneMil" className="om-ft-logo hidden h-12 w-auto object-contain" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isB2BPage
                ? 'Vaše platforma pro soutěže a výhry. Získejte šanci vyhrát luxusní ceny a vouchery.'
                : 'Tvoje platforma pro soutěže a výhry. Získej šanci vyhrát luxusní ceny a vouchery.'}
            </p>
            <div className="flex space-x-3 pt-2">
              <a
                href="https://www.facebook.com/profile.php?id=61584025955397"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="OneMil Facebook"
                className="om-ft-soc w-8 h-8 bg-neon-gold/15 rounded-full flex items-center justify-center border border-neon-gold/40 hover:bg-neon-gold/25 transition-colors"
              >
                <Facebook className="w-4 h-4 text-neon-gold" />
              </a>
              <a
                href="https://www.instagram.com/onemil.cz/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="OneMil Instagram"
                className="om-ft-soc w-8 h-8 bg-neon-gold/15 rounded-full flex items-center justify-center border border-neon-gold/40 hover:bg-neon-gold/25 transition-colors"
              >
                <Instagram className="w-4 h-4 text-neon-gold" />
              </a>
            </div>
            <InstallAppButton />
          </div>

          {/* Information Links - from CMS */}
          <FooterCol title="Informace">
            {links.info.map((page) => (
              <li key={page.id}>
                <Link to={`/${page.section}/${page.slug}`} className={linkClass}>
                  {page.title}
                </Link>
              </li>
            ))}
          </FooterCol>

          {/* FAQ & Support - from CMS */}
          <FooterCol title="Podpora">
            {links.support.map((page) => (
              <li key={page.id}>
                <Link to={`/${page.section}/${page.slug}`} className={linkClass}>
                  {page.title}
                </Link>
              </li>
            ))}
          </FooterCol>

          {/* Legal Terms - from CMS (deduped + URL overrides) */}
          <FooterCol title="Právní podmínky">
            {(() => {
              // Allowed slugs with their final URL + display title.
              // Order here defines render order.
              const legalConfig: Array<{ slug: string; href: string; title: string }> = [
                { slug: 'autorska-prava', href: '/legal/autorska-prava', title: 'Autorská práva' },
                { slug: 'pravidla-souteze', href: '/pravidla-souteze', title: 'Pravidla soutěže' },
                { slug: 'vop', href: '/vop', title: 'Všeobecné obchodní podmínky' },
                { slug: 'gdpr', href: '/gdpr', title: 'Zásady zpracování osobních údajů (GDPR)' },
                { slug: 'cookies', href: '/legal/cookies', title: 'Zásady použití cookies' },
              ];
              return legalConfig.map((entry) => (
                <li key={entry.slug}>
                  <Link to={entry.href} className={linkClass}>
                    {entry.title}
                  </Link>
                </li>
              ));
            })()}
          </FooterCol>

          {/* Partner Section */}
          <FooterCol title="Pro partnery">
            <li>
              <Link to="/partner/login" className={linkClass}>
                Přihlášení partnera
              </Link>
            </li>
            <li>
              <Link to="/partner/register" className={linkClass}>
                Registrace e-shopu
              </Link>
            </li>
          </FooterCol>

          {/* Influencer Section */}
          <FooterCol title="Affiliate program">
            <li>
              <Link to="/influencer" className={linkClass}>
                Affiliate program
              </Link>
            </li>
            <li>
              <Link to="/influencer/how-to-earn" className={linkClass}>
                Jak vydělávat s OneMil
              </Link>
            </li>
            <li>
              <Link to="/affiliate/register" className={linkClass}>
                Registrace Affiliate partnera
              </Link>
            </li>
            <li>
              <Link to="/affiliate/login" className={linkClass}>
                Přihlášení Affiliate partnera
              </Link>
            </li>
          </FooterCol>
        </div>
      </div>

      {/* Company Info - Provozovatel */}
      <div className="om-ft-company relative border-t border-border/40 py-6 px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-1.5 text-sm text-muted-foreground">
          <p className="font-semibold text-heading-gold">Provozovatel: iCONIC POINT s.r.o.</p>
          <p>IČO: 177 95 851 | Sídlo: Na Folimance 2155/15, Vinohrady, 120 00 Praha 2</p>
          <p>Zapsáno v obchodním rejstříku vedeném Městským soudem v Praze, oddíl C, vložka 376856</p>
          <p>
            <span className="font-medium text-heading-gold">E-mail:</span> <a href="mailto:podpora@onemil.cz" className="text-heading-gold hover:underline">podpora@onemil.cz</a> |
            <span className="font-medium text-heading-gold"> Tel:</span> <a href="tel:+420731215816" className="text-heading-gold hover:underline">+420 731 215 816</a>
          </p>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="om-ft-bottom relative border-t border-border/40 py-4 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="text-sm text-muted-foreground">© 2024 iCONIC POINT s.r.o. Všechna práva vyhrazena.</div>
          <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <Link to="/kontakt" className="hover:text-neon-gold transition-colors">Kontakt</Link>
            <span className="text-border">•</span>
            <button
              type="button"
              onClick={openConsentSettings}
              className="hover:text-neon-gold transition-colors"
            >
              Nastavení cookies
            </button>
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
