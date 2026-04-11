import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useUnseenWinsCount } from "@/hooks/useUnseenWinsCount";
import { usePendingOffersCount } from "@/hooks/usePendingOffersCount";
import {
  ADMIN_BOTTOM_NAV,
  adminBottomNavLinkEnd,
  getAdminSectionFromPath,
} from "./adminNavConfig";

/** Řádek 1: sekce (Dashboard, Soutěže, …). Vždy vykreslen v AdminLayout. */
export const AdminPrimaryNav: React.FC = () => {
  const location = useLocation();
  const { unreadCount } = useUnreadMessagesCount();
  const { unseenCount: unseenWinsCount } = useUnseenWinsCount();
  const { pendingCount: pendingOffersCount } = usePendingOffersCount();

  const activeSection = getAdminSectionFromPath(location.pathname, location.search);

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border/50 min-h-[2.75rem] overflow-x-auto -mx-1 px-1 [scrollbar-width:thin]">
      <div className="flex items-center gap-1.5 w-max sm:flex-wrap sm:w-auto pr-2">
        {ADMIN_BOTTOM_NAV.map((entry) => {
          const Icon = entry.icon;
          const active = entry.id === activeSection;
          const showMessagesBadge = entry.id === "messages" && unreadCount > 0;
          const showWinsBadge = entry.id === "wins" && unseenWinsCount > 0;
          const showOffersBadge = entry.id === "users" && pendingOffersCount > 0;
          const badgeCount =
            entry.id === "messages" ? unreadCount :
            entry.id === "wins" ? unseenWinsCount :
            entry.id === "users" ? pendingOffersCount : 0;
          return (
            <NavLink
              key={entry.id}
              to={entry.to}
              end={adminBottomNavLinkEnd(entry.to)}
              aria-current={active ? "page" : undefined}
              className={() =>
                `inline-flex items-center relative h-8 shrink-0 rounded-full px-3 gap-1.5 text-[12px] font-semibold tracking-tight transition-all duration-200 no-underline
                    ${
                      active
                        ? "bg-muted/80 text-foreground border border-border/60 shadow-sm"
                        : "text-muted-foreground/90 border border-transparent hover:bg-muted/50 hover:text-foreground"
                    }`
              }
            >
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${active ? "opacity-100 text-primary" : "opacity-75"}`}
                aria-hidden
              />
              <span className="whitespace-nowrap">{entry.label}</span>
              {(showMessagesBadge || showWinsBadge || showOffersBadge) && (
                <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] flex items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground px-0.5">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
};
