import React from 'react';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';

/**
 * Gates an admin route's content on a Phase 2 permission key.
 * Superadmin passes implicitly (useAdminPermissions.can short-circuits).
 * A normal admin passes only with the explicit permission; otherwise the
 * Czech fallback is shown (the route still mounts inside AdminLayout, so the
 * admin chrome stays — only the sensitive page body is replaced).
 */
export const RequirePermission: React.FC<{
  permission: string;
  children: React.ReactNode;
}> = ({ permission, children }) => {
  const { can, loading } = useAdminPermissions();

  if (loading) return null;

  if (!can(permission)) {
    return (
      <div className="container mx-auto px-4 py-10">
        <div className="max-w-2xl mx-auto rounded-lg border border-border/60 bg-card/40 px-6 py-10 text-center text-muted-foreground">
          Tato část je dostupná pouze superadminovi nebo administrátorovi s oprávněním.
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
