import { useNavigate, useLocation } from "react-router-dom";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useUnseenWinsCount } from "@/hooks/useUnseenWinsCount";
import { useUserRole } from "@/hooks/useUserRole";
import {
  OneMilHomeIcon,
  OneMilTicketIcon,
  OneMilTrophyIcon,
  OneMilMedalIcon,
  OneMilMessageIcon,
  OneMilProfileIcon,
} from "@/components/icons/OneMilIcons";

const CUSTOMER_NAV_ITEMS = [
  { path: "/", label: "Domů", icon: OneMilHomeIcon },
  { path: "/vouchers", label: "Vouchery", icon: OneMilTicketIcon },
  { path: "/games", label: "Soutěže", icon: OneMilTrophyIcon },
  { path: "/wins", label: "Výhry", icon: OneMilMedalIcon },
  { path: "/messages", label: "Zprávy", icon: OneMilMessageIcon },
  { path: "/profile", label: "Můj profil", icon: OneMilProfileIcon },
] as const;

export const BottomNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useUserRole();
  const { unreadCount } = useUnreadMessagesCount();
  const { unseenCount: unseenWinsCount } = useUnseenWinsCount();

  const onAdminShell = isAdmin && location.pathname.startsWith("/admin");

  // Admin naviguje výhradně přes AdminLayout (AdminPrimaryNav + AdminContextSubNav) — žádná druhá lišta.
  if (onAdminShell) {
    return null;
  }

  return (
    <div
      className="ios-pwa-bottom-nav fixed bottom-0 left-0 right-0 z-50 flex justify-around bg-[#0B0F19] border-t border-white/10 py-2 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      role="navigation"
      aria-label="Hlavní menu"
    >
      {CUSTOMER_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        const showMessagesBadge = item.path === "/messages" && unreadCount > 0;
        const showWinsBadge = item.path === "/wins" && unseenWinsCount > 0;
        const badgeCount =
          item.path === "/messages" ? unreadCount : item.path === "/wins" ? unseenWinsCount : 0;

        return (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex flex-col items-center justify-center gap-0.5 px-2.5 py-1.5 min-w-[3.75rem] rounded-2xl text-[11px] font-medium tracking-wide transition-all duration-200 ease-out
              ${
                isActive
                  ? "text-white bg-white/[0.14] shadow-[0_0_0_1px_rgba(255,138,0,0.45),0_8px_24px_rgba(255,138,0,0.18)] ring-2 ring-[rgba(255,181,71,0.8)] ring-offset-2 ring-offset-[#0B0F19]"
                  : "text-white/55 hover:text-white/92 hover:bg-white/[0.06] active:scale-[0.98]"
              }`}
          >
            <div className={`relative ${isActive ? "scale-105" : ""} transition-transform duration-200`}>
              <Icon size={22} strokeWidth={isActive ? 2.25 : 2} />

              {(showMessagesBadge || showWinsBadge) && (
                <span
                  className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold 
                    rounded-full px-[6px] py-[1px] shadow-lg"
                >
                  {badgeCount}
                </span>
              )}
            </div>

            {item.label}
          </button>
        );
      })}
    </div>
  );
};
