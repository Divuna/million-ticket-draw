import { Outlet } from "react-router-dom";
import { Header } from "@/components/Header";
import { AdminContextSubNav } from "@/components/admin/AdminContextSubNav";
import { AdminPrimaryNav } from "@/components/admin/AdminPrimaryNav";

/** Persistent shell for all /admin/* routes — only the outlet content swaps on navigation. */
export function AdminLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <nav
        className="sticky top-16 md:top-20 z-40 border-b border-border/70 bg-background/[0.92] backdrop-blur-xl shadow-[0_1px_0_0_hsl(var(--border)/0.5)]"
        aria-label="Administrační navigace"
      >
        <div className="container mx-auto px-3 sm:px-4 max-w-[1600px]">
          <AdminPrimaryNav />
          <AdminContextSubNav />
        </div>
      </nav>
      <div className="flex-1 min-h-0 flex flex-col w-full pb-8">
        <Outlet />
      </div>
    </div>
  );
}
