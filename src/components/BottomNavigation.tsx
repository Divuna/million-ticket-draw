import { useNavigate, useLocation } from "react-router-dom";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useUnseenWinsCount } from "@/hooks/useUnseenWinsCount";
import { useUserRole } from "@/hooks/useUserRole";
import { isNativeApp } from "@/lib/nativeApp";
import {
  OneMilHomeIcon,
  OneMilTicketIcon,
  OneMilTrophyIcon,
  OneMilMedalIcon,
  OneMilMioCoinIcon,
  OneMilProfileIcon,
} from "@/components/icons/OneMilIcons";
import { MioBadge } from "@/components/brand/MioBadge";
import onemilEmblem from "@/assets/redesign/onemil-emblem.png";

/**
 * Zákaznické spodní menu.
 *
 * Pravidla (neměnit):
 * - Položka `Dobít` (`/top-up`) je jen pro web a PWA. V nativní Android/iOS
 *   aplikaci se nezobrazuje (Apple/Google pravidla) — detekce výhradně přes
 *   `isNativeApp()` ze `src/lib/nativeApp.ts`. Samotná stránka `/top-up` má
 *   vlastní guard, tohle je jen skrytí vstupu.
 * - Vstup do Zpráv je v `Můj profil`; badge nepřečtených zpráv se proto
 *   zobrazuje na položce `/profile`. Badge Výher zůstává na `/wins`.
 */
const CUSTOMER_NAV_ITEMS = [
  { path: "/", label: "Domů", icon: OneMilHomeIcon },
  { path: "/vouchers", label: "Vouchery", icon: OneMilTicketIcon },
  { path: "/games", label: "Soutěže", icon: OneMilTrophyIcon },
  { path: "/wins", label: "Výhry", icon: OneMilMedalIcon },
  { path: "/top-up", label: "Dobít", icon: OneMilMioCoinIcon },
  { path: "/profile", label: "Můj profil", icon: OneMilProfileIcon },
] as const;

export const BottomNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useUserRole();
  const { unreadCount } = useUnreadMessagesCount();
  const { unseenCount: unseenWinsCount } = useUnseenWinsCount();

  const onAdminShell = isAdmin && location.pathname.startsWith("/admin");

  // Dobíjení není v nativní aplikaci dostupné — položku vůbec nevykreslujeme.
  const navItems = CUSTOMER_NAV_ITEMS.filter(
    (item) => !(item.path === "/top-up" && isNativeApp()),
  );

  // Admin naviguje výhradně přes AdminLayout (AdminPrimaryNav + AdminContextSubNav) — žádná druhá lišta.
  if (onAdminShell) {
    return null;
  }

  // Nový vizuál (spodní lišta „Tmavá s korunkou“): rudá záře pod aktivní položkou.
  const activeIndex = navItems.findIndex((item) => item.path === location.pathname);
  const glowAt = activeIndex >= 0 ? ((activeIndex + 0.5) / navItems.length) * 100 : -1;

  return (
    <div
      className="om-bottom-nav ios-pwa-bottom-nav fixed bottom-0 left-0 right-0 z-50 grid"
      style={{
        gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
        paddingBottom: "calc(0.45rem + env(safe-area-inset-bottom, 0px))",
        background:
          glowAt >= 0
            ? `radial-gradient(60% 120% at ${glowAt}% 0%, rgba(181,18,43,0.45), rgba(181,18,43,0) 70%), #121216`
            : "#121216",
      }}
      role="navigation"
      aria-label="Hlavní menu"
    >
      <span aria-hidden="true" className="om-bottom-nav-hairline" />
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        // Zprávy mají vstup v profilu → badge nepřečtených zpráv patří na /profile.
        const showMessagesBadge = item.path === "/profile" && unreadCount > 0;
        const showWinsBadge = item.path === "/wins" && unseenWinsCount > 0;
        const badgeCount =
          item.path === "/profile" ? unreadCount : item.path === "/wins" ? unseenWinsCount : 0;

        return (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            aria-current={isActive ? "page" : undefined}
            className={`om-bottom-nav-item relative flex flex-col items-center justify-center gap-1 pt-[18px] pb-1 text-[10.5px] tracking-wide transition-colors duration-200 ${
              isActive ? "om-bottom-nav-item--active" : ""
            }`}
          >
            {isActive && (
              <>
                <img src={onemilEmblem} alt="" aria-hidden="true" className="om-bottom-nav-crown" />
                <span aria-hidden="true" className="om-bottom-nav-glow" />
              </>
            )}
            <div className="relative flex h-[26px] items-center justify-center">
              {item.path === "/top-up" ? (
                <MioBadge width={36} />
              ) : (
                <Icon size={22} color={isActive ? "#F2C14E" : "#8E8F98"} strokeWidth={isActive ? 2.1 : 1.9} />
              )}

              {(showMessagesBadge || showWinsBadge) && (
                <span className="om-bottom-nav-badge">{badgeCount}</span>
              )}
            </div>

            {item.label}
          </button>
        );
      })}
    </div>
  );
};
