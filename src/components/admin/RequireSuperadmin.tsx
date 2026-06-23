import React from 'react';
import { useUserRole } from '@/hooks/useUserRole';

/**
 * Phase 3 route-level hardening: gates a sensitive admin route to superadmin only.
 *
 * AdminLayout already blocks non-admins (guests/regular users → "/"). This guard
 * additionally blocks a non-superadmin admin (subadmin) from reaching sensitive
 * pages even by direct URL — closing the gap where Phase 2 only hid them from nav.
 *
 * - Superadmin: renders the wrapped page unchanged.
 * - Non-superadmin admin: shown a plain Czech denial; the page body never mounts.
 *
 * Read-only — never writes, never touches the DB. The authoritative protection
 * for sensitive DATA remains the per-table superadmin RLS (Phase 1); this is the
 * UI/route layer of defense-in-depth.
 */
export const RequireSuperadmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isSuperAdmin, loading } = useUserRole();

  // Wait for role resolution to avoid a flash/false denial during refresh.
  if (loading) return null;

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="max-w-2xl mx-auto rounded-lg border border-border/60 bg-card/40 px-6 py-10 text-center text-muted-foreground">
          Tato část je dostupná pouze superadminovi.
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
