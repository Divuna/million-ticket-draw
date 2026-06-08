import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { usePendingOffersCount } from "@/hooks/usePendingOffersCount";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  ADMIN_PERSISTENT_SUBNAV_SEGMENTS,
  ADMIN_SECTION_META,
  adminSubNavItemKey,
  getAdminSectionFromPath,
  isAdminSubNavItemActive,
  isContextMenuActive,
  type AdminContextMenuSection,
  type AdminContextSecondRowEntry,
  type AdminNavSectionId,
  type AdminSubNavItem,
} from "./adminNavConfig";

const linkButtonClass = (active: boolean) =>
  `
  inline-flex items-center no-underline relative h-9 shrink-0 rounded-full px-3.5 gap-2 text-[13px] font-semibold tracking-tight transition-all duration-200
  ${
    active
      ? "bg-primary/18 text-primary border border-primary/35 shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_4px_14px_hsl(var(--primary)/0.12)] ring-2 ring-primary/25"
      : "text-muted-foreground/90 border border-transparent hover:bg-muted/60 hover:text-foreground hover:border-border/40"
  }
`;

const menuTriggerClass = (active: boolean) =>
  `
  relative h-9 shrink-0 rounded-full px-3 gap-1.5 text-[13px] font-semibold tracking-tight transition-all duration-200
  ${
    active
      ? "bg-primary/18 text-primary border border-primary/35 shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_4px_14px_hsl(var(--primary)/0.12)] ring-2 ring-primary/25"
      : "text-muted-foreground/90 border border-transparent hover:bg-muted/60 hover:text-foreground hover:border-border/40"
  }
`;

/**
 * Řádek 2: nástroje aktivní sekce. Vždy vykreslen v AdminLayout; segmenty jsou v DOMu,
 * neaktivní skupiny jsou skryté (hidden + aria-hidden).
 */
function subNavItemTo(item: AdminSubNavItem): string | { pathname: string; search: string } {
  if (item.dashboardTab) {
    return { pathname: "/admin", search: `?tab=${encodeURIComponent(item.dashboardTab)}` };
  }
  return item.path;
}

export const AdminContextSubNav: React.FC = () => {
  const location = useLocation();
  const { unreadCount } = useUnreadMessagesCount();
  const { pendingCount: pendingOffersCount } = usePendingOffersCount();
  const [pendingPartnerRegistrationsCount, setPendingPartnerRegistrationsCount] = useState(0);
  const [pendingCompanyLeadsCount, setPendingCompanyLeadsCount] = useState(0);

  const activeSection = getAdminSectionFromPath(location.pathname, location.search);
  const meta = ADMIN_SECTION_META[activeSection];

  useEffect(() => {
    let cancelled = false;

    const loadPendingPartnerRegistrationsCount = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          if (!cancelled) setPendingPartnerRegistrationsCount(0);
          return;
        }

        const res = await supabase.functions.invoke("get-pending-partner-registrations", {
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        });

        if (res.error) throw res.error;

        const data = res.data as { success?: boolean; registrations?: unknown[] };
        if (!cancelled) {
          setPendingPartnerRegistrationsCount(data.success ? data.registrations?.length ?? 0 : 0);
        }
      } catch (error) {
        console.error("Error loading pending partner registrations count:", error);
        if (!cancelled) setPendingPartnerRegistrationsCount(0);
      }
    };

    loadPendingPartnerRegistrationsCount();

    return () => {
      cancelled = true;
    };
  }, []);

  // Poll pending company leads count every 60 seconds
  useEffect(() => {
    let cancelled = false;

    const loadPendingCompanyLeadsCount = async () => {
      try {
        const { count, error } = await supabase
          .from("affiliate_company_leads")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_admin_approval");
        if (!cancelled && !error) {
          setPendingCompanyLeadsCount(count ?? 0);
        }
      } catch {
        // best-effort — silent fail
      }
    };

    loadPendingCompanyLeadsCount();
    const interval = setInterval(loadPendingCompanyLeadsCount, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const renderMenuSections = (sections: AdminContextMenuSection[], menuKey: string) =>
    sections.map((sec, si) => (
      <React.Fragment key={`${menuKey}-sec-${si}`}>
        {si > 0 && <DropdownMenuSeparator />}
        {"label" in sec && sec.label ? (
          <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">
            {sec.label}
          </DropdownMenuLabel>
        ) : null}
        {sec.items.map((item, ii) => {
          const Icon = item.icon;
          const active = isAdminSubNavItemActive(item, location.pathname, location.search);
          const to = subNavItemTo(item);
          const isOfferItem = item.path === "/admin/partner-offers";
          const showOfferDot = isOfferItem && pendingOffersCount > 0;
          return (
            <DropdownMenuItem
              key={adminSubNavItemKey(item, ii)}
              asChild
              className={active ? "bg-primary/10 text-primary focus:bg-primary/15 focus:text-primary" : undefined}
            >
              <Link to={to}>
                <Icon className="h-4 w-4 shrink-0 mr-2 opacity-80" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {showOfferDot && (
                  <span className="ml-2 min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1">
                    {pendingOffersCount > 99 ? "99+" : pendingOffersCount}
                  </span>
                )}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </React.Fragment>
    ));

  const renderSecondRowEntry = (
    entry: AdminContextSecondRowEntry,
    segmentId: AdminNavSectionId,
    index: number,
  ) => {
    if (entry.kind === "link") {
      const item = entry.item;
      const Icon = item.icon;
      const active = isAdminSubNavItemActive(item, location.pathname, location.search);
      const showBadge = item.path === "/admin/messages" && unreadCount > 0;
      const showPendingPartnerBadge =
        item.path === "/admin/partners" && pendingPartnerRegistrationsCount > 0;
      const showPendingCompanyLeadsBadge =
        item.path === "/admin/company-leads" && pendingCompanyLeadsCount > 0;
      const to = subNavItemTo(item);
      const end = !item.matchPrefix;
      return (
        <NavLink
          key={`${segmentId}-${adminSubNavItemKey(item, index)}`}
          to={to}
          end={end}
          aria-current={active ? "page" : undefined}
          className={() => linkButtonClass(isAdminSubNavItemActive(item, location.pathname, location.search))}
        >
          <Icon
            className={`h-4 w-4 shrink-0 ${active ? "opacity-100 text-primary" : "opacity-80"}`}
            aria-hidden
          />
          <span className="whitespace-nowrap">{item.label}</span>
          {showBadge && (
            <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-0.5">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          {showPendingPartnerBadge && (
            <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-0.5">
              {pendingPartnerRegistrationsCount > 99 ? "99+" : pendingPartnerRegistrationsCount}
            </span>
          )}
          {showPendingCompanyLeadsBadge && (
            <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-0.5">
              {pendingCompanyLeadsCount > 99 ? "99+" : pendingCompanyLeadsCount}
            </span>
          )}
        </NavLink>
      );
    }

    const MenuIcon = entry.icon;
    const menuActive = isContextMenuActive(entry.sections, location.pathname, location.search);
    const menuId = `${segmentId}-ctx-${entry.label}-${index}`;
    // Show dot on trigger if this menu contains partner-offers item and there are pending offers
    const menuContainsPendingOffers =
      pendingOffersCount > 0 &&
      entry.sections.some((sec) =>
        sec.items.some((it) => it.path === "/admin/partner-offers"),
      );

    return (
      <DropdownMenu key={menuId}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className={menuTriggerClass(menuActive)}>
            <MenuIcon
              className={`h-4 w-4 shrink-0 ${menuActive ? "opacity-100 text-primary" : "opacity-80"}`}
              aria-hidden
            />
            <span className="whitespace-nowrap">{entry.label}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
            {menuContainsPendingOffers && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-destructive border-2 border-background" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[min(100vw-2rem,17.5rem)] z-[60]">
          {renderMenuSections(entry.sections, menuId)}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="flex items-center gap-3 py-2.5 min-h-[2.75rem]">
      <div className="hidden sm:flex flex-shrink-0 items-center self-stretch pr-4 border-r border-border/60">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/90 leading-tight max-w-[11rem]">
          {meta.title}
        </p>
      </div>
      <div className="relative flex-1 min-w-0 min-h-[2.25rem] overflow-x-auto pb-0.5 -mx-1 px-1 [scrollbar-width:thin]">
        {ADMIN_PERSISTENT_SUBNAV_SEGMENTS.map((seg) => (
          <div
            key={seg.sectionId}
            id={`admin-subnav-tools-${seg.sectionId}`}
            data-admin-subnav-segment={seg.sectionId}
            data-active={activeSection === seg.sectionId ? "true" : "false"}
            className={cn(
              "flex items-center gap-2 w-max sm:flex-wrap sm:max-w-full sm:gap-1.5",
              activeSection !== seg.sectionId && "hidden",
            )}
            aria-hidden={activeSection !== seg.sectionId}
          >
            {seg.entries.map((e, i) => renderSecondRowEntry(e, seg.sectionId, i))}
          </div>
        ))}
      </div>
    </div>
  );
};
