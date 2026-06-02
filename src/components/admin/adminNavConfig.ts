import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Trophy,
  Gift,
  Users,
  BarChart3,
  Bell,
  CreditCard,
  FileText,
  Award,
  Image,
  Handshake,
  Wrench,
  MessageSquare,
  BookOpen,
  UserX,
  Receipt,
  Link2,
  Megaphone,
  CalendarDays,
  Banknote,
  ListOrdered,
  Gamepad2,
  Map as MapIcon,
  LayoutList,
  FlaskConical,
  ShieldCheck,
  ScrollText,
  SlidersHorizontal,
  Package,
  GitBranch,
  TestTube2,
  Activity,
  LayoutTemplate,
  MoreHorizontal,
  Truck,
  Tag,
} from "lucide-react";

/**
 * Admin navigace: jeden záznam na sekci (řádek 1 + řádek 2 nástrojů).
 * Odvozené exporty: ADMIN_BOTTOM_NAV, ADMIN_SECTION_META, ADMIN_PERSISTENT_SUBNAV_SEGMENTS.
 */
export type AdminNavSectionId =
  | "dashboard"
  | "contests"
  | "vouchers"
  | "users"
  | "finance"
  | "wins"
  | "messages";

/** React Router `to` — Dashboard / Soutěže používají /admin?tab=… */
export type AdminBottomNavTo = string | { pathname: string; search: string };

/** Tab values supported by AdminDashboard (URL ?tab=). */
export const ADMIN_DASHBOARD_TABS = [
  "management",
  "contests",
  "ticketmap",
  "bonus-overview",
  "prizes",
  "distribution",
  "tests",
  "validations",
  "logs",
  "contest-control",
] as const;

export type AdminDashboardTabId = (typeof ADMIN_DASHBOARD_TABS)[number];

export const ADMIN_DASHBOARD_TAB_SET = new Set<string>(ADMIN_DASHBOARD_TABS);

export interface AdminSubNavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Active when pathname starts with path (after normalizing trailing slash). */
  matchPrefix?: boolean;
  /** Navigate to /admin?tab=… and match active state on dashboard. */
  dashboardTab?: AdminDashboardTabId;
}

/** Skupina položek v rozbalovacím menu druhé řady navigace. */
export type AdminContextMenuSection =
  | { items: AdminSubNavItem[] }
  | { label: string; items: AdminSubNavItem[] };

export type AdminContextSecondRowEntry =
  | { kind: "link"; item: AdminSubNavItem }
  | {
      kind: "menu";
      label: string;
      icon: LucideIcon;
      sections: AdminContextMenuSection[];
    };

/** Položky dashboardu (jeden zdroj pravdy pro flat seznam i strukturovanou navigaci). */
const DASH_NAV = {
  statistics: { path: "/admin/statistics", label: "Statistiky", icon: BarChart3 },
  notifications: { path: "/admin/notifications", label: "Notifikace", icon: Bell },
  banners: { path: "/admin/banners", label: "Bannery", icon: Image },
  content: { path: "/admin/content", label: "Obsah stránek", icon: BookOpen },
  management: { path: "/admin", dashboardTab: "management", label: "Správa soutěží", icon: Gamepad2 },
  contests: { path: "/admin", dashboardTab: "contests", label: "Seznam soutěží", icon: LayoutList },
  ticketmap: { path: "/admin", dashboardTab: "ticketmap", label: "Mapa tiketů", icon: MapIcon },
  bonusOverview: { path: "/admin", dashboardTab: "bonus-overview", label: "Přehled bonusů", icon: Gift },
  prizes: { path: "/admin", dashboardTab: "prizes", label: "Bonusové ceny", icon: Package },
  distribution: { path: "/admin", dashboardTab: "distribution", label: "Distribuce bonusů", icon: GitBranch },
  tests: { path: "/admin", dashboardTab: "tests", label: "Test Suite", icon: FlaskConical },
  validations: { path: "/admin", dashboardTab: "validations", label: "Validace", icon: ShieldCheck },
  logs: { path: "/admin", dashboardTab: "logs", label: "Sofinity logy", icon: ScrollText },
  contestControl: { path: "/admin", dashboardTab: "contest-control", label: "Contest control", icon: SlidersHorizontal },
  testsTools: { path: "/admin/tests", label: "Testy (nástroje)", icon: TestTube2 },
  eventQueue: { path: "/admin/event-queue", label: "Event queue", icon: ListOrdered },
} as const satisfies Record<string, AdminSubNavItem>;

const USERS_NAV = {
  users: { path: "/admin/users", label: "Uživatelé", icon: Users },
  onboarding: { path: "/admin/onboarding-incomplete", label: "Onboarding", icon: UserX },
  partners: { path: "/admin/partners", label: "Partneři", icon: Handshake },
  partnersPortal: { path: "/admin/partners-portal", label: "Partneři portál", icon: Handshake },
  partnerOffers: { path: "/admin/partner-offers", label: "Nabídky ke schválení", icon: Tag },
  invoices: { path: "/admin/invoices", label: "Faktury", icon: Receipt },
  influencers: { path: "/admin/influencers", label: "Affiliate partneři", icon: Megaphone },
  campaigns: { path: "/admin/influencer-campaigns", label: "Affiliate kampaně", icon: CalendarDays },
  commissions: { path: "/admin/influencer-commissions", label: "Affiliate výplaty", icon: Banknote },
  legal: { path: "/admin/legal-acceptances", label: "Souhlasy", icon: FileText },
  auditLogs: { path: "/admin/audit-logs", label: "Audit", icon: FileText },
  auditRepair: { path: "/admin/audit-repair", label: "Audit repair", icon: Wrench },
  onemilAudit: { path: "/admin/onemil-audit", label: "OneMil audit", icon: FileText },
} as const satisfies Record<string, AdminSubNavItem>;

/** ?tab= hodnoty pro /admin — provoz soutěží a bonusů u tiketů. */
const CONTESTS_DASHBOARD_TABS = new Set<string>([
  "management",
  "contests",
  "ticketmap",
  "bonus-overview",
  "prizes",
  "distribution",
]);

/** ?tab= hodnoty pro /admin — přehledy, monitoring, řízení platformy. */
const PLATFORM_DASHBOARD_TABS = new Set<string>([
  "statistics",
  "tests",
  "validations",
  "logs",
  "contest-control",
]);

type AdminNavSectionDefinition = {
  id: AdminNavSectionId;
  sectionTitle: string;
  mainNav: {
    label: string;
    icon: LucideIcon;
    to: AdminBottomNavTo;
  };
  subNavEntries: AdminContextSecondRowEntry[];
};

/**
 * Jediný kanonický seznam admin sekcí (řádek sekcí + nástroje pod sekcí), v pořadí zobrazení.
 */
export const ADMIN_NAV_SECTIONS: readonly AdminNavSectionDefinition[] = [
  {
    id: "dashboard",
    sectionTitle: "Přehled a platforma",
    mainNav: {
      label: "Dashboard",
      icon: LayoutDashboard,
      to: "/admin/statistics",
    },
    subNavEntries: [
      { kind: "link", item: DASH_NAV.statistics },
      {
        kind: "menu",
        label: "Obsah a komunikace",
        icon: LayoutTemplate,
        sections: [{ items: [DASH_NAV.notifications, DASH_NAV.banners, DASH_NAV.content] }],
      },
      {
        kind: "menu",
        label: "Monitoring",
        icon: Activity,
        sections: [{ items: [DASH_NAV.tests, DASH_NAV.validations, DASH_NAV.logs] }],
      },
      {
        kind: "menu",
        label: "Provoz a nástroje",
        icon: SlidersHorizontal,
        sections: [{ items: [DASH_NAV.contestControl, DASH_NAV.testsTools, DASH_NAV.eventQueue] }],
      },
    ],
  },
  {
    id: "contests",
    sectionTitle: "Soutěže a bonusy",
    mainNav: {
      label: "Soutěže",
      icon: Gamepad2,
      to: { pathname: "/admin", search: "?tab=management" },
    },
    subNavEntries: [
      {
        kind: "menu",
        label: "Soutěže a tikety",
        icon: Gamepad2,
        sections: [{ items: [DASH_NAV.management, DASH_NAV.contests, DASH_NAV.ticketmap] }],
      },
      {
        kind: "menu",
        label: "Bonusy u soutěží",
        icon: Package,
        sections: [{ items: [DASH_NAV.bonusOverview, DASH_NAV.prizes, DASH_NAV.distribution] }],
      },
    ],
  },
  {
    id: "vouchers",
    sectionTitle: "Vouchery a doporučení",
    mainNav: { label: "Vouchery", icon: Gift, to: "/admin/vouchers" },
    subNavEntries: [
      { kind: "link", item: { path: "/admin/vouchers", label: "Vouchery", icon: Gift } },
      { kind: "link", item: { path: "/admin/referrals", label: "Doporučení hráčů", icon: Link2 } },
      { kind: "link", item: { path: "/admin/referral-dashboard", label: "Přehled doporučení", icon: BarChart3 } },
    ],
  },
  {
    id: "users",
    sectionTitle: "Uživatelé a partneři",
    mainNav: { label: "Uživatelé", icon: Users, to: "/admin/users" },
    subNavEntries: [
      { kind: "link", item: USERS_NAV.users },
      { kind: "link", item: USERS_NAV.onboarding },
      { kind: "link", item: USERS_NAV.partners },
      { kind: "link", item: USERS_NAV.influencers },
      {
        kind: "menu",
        label: "Více",
        icon: MoreHorizontal,
        sections: [
          { label: "Partneři", items: [USERS_NAV.partnersPortal, USERS_NAV.partnerOffers] },
          { label: "Affiliate", items: [USERS_NAV.campaigns, USERS_NAV.commissions] },
          {
            label: "Audit a compliance",
            items: [USERS_NAV.legal, USERS_NAV.auditLogs, USERS_NAV.auditRepair, USERS_NAV.onemilAudit],
          },
        ],
      },
    ],
  },
  {
    id: "finance",
    sectionTitle: "Finance",
    mainNav: { label: "Finance", icon: CreditCard, to: "/admin/payments" },
    subNavEntries: [
      { kind: "link", item: { path: "/admin/payments", label: "Platby", icon: CreditCard } },
      { kind: "link", item: { path: "/admin/invoices", label: "Faktury", icon: Receipt } },
    ],
  },
  {
    id: "wins",
    sectionTitle: "Výhry a logistika",
    mainNav: { label: "Výhry", icon: Trophy, to: "/admin/winners" },
    subNavEntries: [
      { kind: "link", item: { path: "/admin/winners", label: "Správa výher", icon: Award } },
      { kind: "link", item: { path: "/admin/prize-delivery", label: "Předání výher", icon: Truck } },
    ],
  },
  {
    id: "messages",
    sectionTitle: "Zprávy",
    mainNav: { label: "Zprávy", icon: MessageSquare, to: "/admin/messages" },
    subNavEntries: [
      {
        kind: "link",
        item: { path: "/admin/messages", label: "Konverzace", icon: MessageSquare, matchPrefix: true },
      },
    ],
  },
];

/** Hlavní admin domény (řádek 1) — odvozeno z ADMIN_NAV_SECTIONS. */
export const ADMIN_BOTTOM_NAV: {
  id: AdminNavSectionId;
  label: string;
  icon: LucideIcon;
  to: AdminBottomNavTo;
}[] = ADMIN_NAV_SECTIONS.map((s) => ({
  id: s.id,
  label: s.mainNav.label,
  icon: s.mainNav.icon,
  to: s.mainNav.to,
}));

export const ADMIN_SECTION_META: Record<AdminNavSectionId, { title: string }> = Object.fromEntries(
  ADMIN_NAV_SECTIONS.map((s) => [s.id, { title: s.sectionTitle }]),
) as Record<AdminNavSectionId, { title: string }>;

/** Všechny skupiny nástrojů řádku 2 — vždy namontované; viditelnost řídí aktivní sekce. */
export const ADMIN_PERSISTENT_SUBNAV_SEGMENTS: {
  sectionId: AdminNavSectionId;
  entries: AdminContextSecondRowEntry[];
}[] = ADMIN_NAV_SECTIONS.map((s) => ({
  sectionId: s.id,
  entries: s.subNavEntries,
}));

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

/** NavLink `end` pro hlavní řádek — /admin/messages/:id zůstane pod „Zprávy“. */
export function adminBottomNavLinkEnd(to: AdminBottomNavTo): boolean {
  if (typeof to === "object") return true;
  return to !== "/admin/messages";
}

/**
 * Které primární admin doméně URL patří (řádek sekcí v admin navigaci).
 */
export function getAdminSectionFromPath(pathname: string, search: string = ""): AdminNavSectionId {
  const path = normalizePathname(pathname);
  if (!path.startsWith("/admin")) return "dashboard";

  if (path.startsWith("/admin/messages")) return "messages";
  if (path.startsWith("/admin/prize-delivery") || path.startsWith("/admin/winners")) return "wins";

  if (path.startsWith("/admin/payments") || path.startsWith("/admin/invoices")) return "finance";

  if (
    path.startsWith("/admin/vouchers") ||
    path.startsWith("/admin/referrals") ||
    path.startsWith("/admin/referral-dashboard")
  ) {
    return "vouchers";
  }

  if (
    path.startsWith("/admin/users") ||
    path.startsWith("/admin/onboarding-incomplete") ||
    path.startsWith("/admin/partners-portal") ||
    path.startsWith("/admin/partner-offers") ||
    path.startsWith("/admin/partners/") ||
    path === "/admin/partners" ||
    path.startsWith("/admin/influencers") ||
    path.startsWith("/admin/influencer-commissions") ||
    path.startsWith("/admin/influencer-campaigns") ||
    path.startsWith("/admin/legal-acceptances") ||
    path.startsWith("/admin/audit-logs") ||
    path.startsWith("/admin/audit-repair") ||
    path.startsWith("/admin/onemil-audit")
  ) {
    return "users";
  }

  if (
    path.startsWith("/admin/statistics") ||
    path.startsWith("/admin/notifications") ||
    path.startsWith("/admin/banners") ||
    path.startsWith("/admin/content")
  ) {
    return "dashboard";
  }

  if (path.startsWith("/admin/tests") || path.startsWith("/admin/event-queue")) {
    return "dashboard";
  }

  if (path.startsWith("/admin/contest/")) {
    return "contests";
  }

  if (path === "/admin") {
    const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const tab = q.get("tab") || "management";
    if (CONTESTS_DASHBOARD_TABS.has(tab)) return "contests";
    if (PLATFORM_DASHBOARD_TABS.has(tab)) return "dashboard";
    return "contests";
  }

  return "dashboard";
}

export function isAdminSubNavItemActive(
  item: AdminSubNavItem,
  pathname: string,
  search: string = "",
): boolean {
  const path = normalizePathname(pathname);
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const currentTab = q.get("tab") || "management";

  if (item.dashboardTab) {
    return path === "/admin" && currentTab === item.dashboardTab;
  }

  if (item.matchPrefix) {
    const p = item.path.endsWith("/") ? item.path.slice(0, -1) : item.path;
    return path === p || path.startsWith(`${p}/`);
  }

  return path === item.path;
}

export function adminSubNavItemKey(item: AdminSubNavItem, index: number): string {
  if (item.dashboardTab) return `dash-${item.dashboardTab}`;
  return `${item.path}-${item.label}-${index}`;
}

function flattenContextMenuSections(sections: AdminContextMenuSection[]): AdminSubNavItem[] {
  return sections.flatMap((s) => s.items);
}

/** True pokud je v daném rozbalovacím menu aktivní některá z položek. */
export function isContextMenuActive(
  sections: AdminContextMenuSection[],
  pathname: string,
  search: string,
): boolean {
  return flattenContextMenuSections(sections).some((item) =>
    isAdminSubNavItemActive(item, pathname, search),
  );
}
