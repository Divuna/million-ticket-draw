import { useEffect } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { AdminContextSubNav } from "@/components/admin/AdminContextSubNav";
import { AdminPrimaryNav } from "@/components/admin/AdminPrimaryNav";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";

/**
 * Persistent shell for all /admin/* routes — only the outlet content swaps on
 * navigation. Visual-only light/dark redesign (see .admin-theme in
 * index.css): a dark left navigation rail on desktop/laptop (AdminPrimaryNav,
 * same permission-filtered entries/badges as before — only its layout
 * classes changed) collapses to the same horizontal strip it always was on
 * narrow screens, and the rest of the shell (Header, AdminContextSubNav,
 * page content) sits on a light card-based surface. No role/permission/
 * routing/data logic changed here.
 *
 * The theme class is toggled on document.body (not just the wrapper div)
 * because Radix Dialog/AlertDialog/Popover/Select portal directly under
 * <body> — without this, a dialog opened from an admin page would still pick
 * up the global dark theme instead of this light one (same technique as
 * AffiliatePortalLayout / PartnerPortalLayout).
 */
export function AdminLayout() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  useEffect(() => {
    document.body.classList.add("admin-theme");
    return () => document.body.classList.remove("admin-theme");
  }, []);

  // Wait for role resolution to avoid flicker/false redirects during refresh.
  if (roleLoading) return null;

  // Non-admins (including guests) must never see the admin shell.
  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="admin-theme min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <aside
          className="w-full md:w-60 md:shrink-0 md:sticky md:top-0 md:h-screen bg-sidebar text-sidebar-foreground border-b md:border-b-0 md:border-r border-sidebar-border flex flex-col"
          aria-label="Administrační navigace"
        >
          <AdminPrimaryNav />
        </aside>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="border-b border-border bg-card/70 backdrop-blur-sm">
            <div className="px-3 sm:px-6 max-w-[1600px] mx-auto w-full">
              <AdminContextSubNav />
            </div>
          </div>
          <main className="flex-1 min-h-0 w-full px-3 sm:px-6 py-6 pb-12">
            <div className="max-w-[1600px] mx-auto w-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
