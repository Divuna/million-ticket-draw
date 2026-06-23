import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { useAdminPermissions, SUBADMIN_ENTRY_ROUTES } from '@/hooks/useAdminPermissions';

/**
 * Phase 2 entry guard for superadmin-only admin surfaces (the /admin Dashboard
 * and /admin/statistics platform metrics).
 *
 * - Superadmin: renders the wrapped page unchanged.
 * - Non-superadmin admin: never sees the dashboard / platform aggregates.
 *   Redirects to the first safe area they have been granted, in the order
 *   defined by SUBADMIN_ENTRY_ROUTES (vouchers → content → banners →
 *   notifications). If they hold no permission, a plain Czech message is shown.
 *
 * AdminLayout already blocks non-admins, so this only differentiates superadmin
 * from a scoped subadmin. Read-only — never writes, never touches the DB.
 */
export const RequireSuperadminOrRedirect: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const { can, loading: permLoading } = useAdminPermissions();

  // Wait for both role + permissions to resolve to avoid a flash/false redirect.
  if (roleLoading || permLoading) return null;

  if (isSuperAdmin) return <>{children}</>;

  const firstPermitted = SUBADMIN_ENTRY_ROUTES.find((r) => can(r.permission));
  if (firstPermitted) return <Navigate to={firstPermitted.path} replace />;

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="max-w-2xl mx-auto rounded-lg border border-border/60 bg-card/40 px-6 py-10 text-center text-muted-foreground">
        Nemáte přiřazené žádné oprávnění administrace.
      </div>
    </div>
  );
};
