import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useUnseenWinsCount } from "@/hooks/useUnseenWinsCount";
import { usePendingOffersCount } from "@/hooks/usePendingOffersCount";
import { useBobEnabled } from "@/hooks/useBobEnabled";
import { useUserRole } from "@/hooks/useUserRole";
import { useAdminPermissions } from "@/hooks/useAdminPermissions";
import {
  ADMIN_BOTTOM_NAV,
  adminBottomNavLinkEnd,
  getAdminSectionFromPath,
} from "./adminNavConfig";

// Phase 2: which top-level sections a non-superadmin may see, by held permission.
// Only sections that contain a safe permitted item are listed; every other
// section (contests, users, finance, wins, messages) is hidden from non-superadmin.
const SECTION_VISIBLE_FOR_PERMISSION: Record<string, (can: (k: string) => boolean) => boolean> = {
  dashboard: (can) => can("content.manage") || can("banners.manage") || can("notifications.manage"),
  vouchers: (can) => can("vouchers.manage"),
};

/** Řádek 1: sekce (Dashboard, Soutěže, …). Vždy vykreslen v AdminLayout. */
export const AdminPrimaryNav: React.FC = () => {
  const location = useLocation();
  const { unreadCount } = useUnreadMessagesCount();
  const { unseenCount: unseenWinsCount } = useUnseenWinsCount();
  const { pendingCount: pendingOffersCount } = usePendingOffersCount();
  const { bobEnabled } = useBobEnabled();
  const { isSuperAdmin } = useUserRole();
  const { can, loading: permLoading } = useAdminPermissions();

  const activeSection = getAdminSectionFromPath(location.pathname, location.search);

  // Superadmin sees every section; non-superadmin only sections with a held permission.
  const visibleNav = isSuperAdmin
    ? ADMIN_BOTTOM_NAV
    : permLoading
    ? []
    : ADMIN_BOTTOM_NAV.filter((e) => SECTION_VISIBLE_FOR_PERMISSION[e.id]?.(can) ?? false);

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border/50 min-h-[2.75rem] overflow-x-auto -mx-1 px-1 [scrollbar-width:thin]">
      <div className="flex items-center gap-1.5 w-max sm:flex-wrap sm:w-auto pr-2">
        {visibleNav.map((entry) => {
          const Icon = entry.icon;
          const active = entry.id === activeSection;
          const showMessagesBadge = entry.id === "messages" && unreadCount > 0;
          const bobOffOnMessages = entry.id === "messages" && !bobEnabled;
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
              title={bobOffOnMessages ? "Bob je vypnutý – zprávy jdou přímo adminovi." : undefined}
              data-testid={bobOffOnMessages ? "admin-nav-messages-bob-off" : undefined}
              className={() =>
                `inline-flex items-center relative h-8 shrink-0 rounded-full px-3 gap-1.5 text-[12px] font-semibold tracking-tight transition-all duration-200 no-underline
                    ${
                      active
                        ? "bg-muted/80 text-foreground border border-border/60 shadow-sm"
                        : "text-muted-foreground/90 border border-transparent hover:bg-muted/50 hover:text-foreground"
                    }
                    ${
                      bobOffOnMessages
                        ? "border-[hsl(35,90%,55%,0.55)] bg-[hsl(35,90%,55%,0.08)] text-[hsl(35,90%,72%)] shadow-[0_0_14px_hsl(35,90%,55%,0.28)]"
                        : ""
                    }`
              }
            >
              <Icon
                className={`h-3.5 w-3.5 shrink-0 ${
                  bobOffOnMessages ? "opacity-100 text-[hsl(35,90%,62%)]" : active ? "opacity-100 text-primary" : "opacity-75"
                }`}
                aria-hidden
              />
              <span className="whitespace-nowrap">{entry.label}</span>
              {bobOffOnMessages && (
                <span className="relative flex h-2 w-2 ml-0.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(35,90%,55%)] opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(35,90%,58%)] shadow-[0_0_6px_hsl(35,90%,55%,0.9)]" />
                </span>
              )}
              {(showMessagesBadge || showWinsBadge || showOffersBadge) && (
                <span
                  data-testid={entry.id === "messages" ? "admin-messages-unread-badge" : undefined}
                  className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] flex items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground px-0.5"
                >
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
