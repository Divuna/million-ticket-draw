import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';

/**
 * Granular subadmin permission keys (safe slices only).
 * Phase 2: vouchers/content/banners/notifications. Phase 3b: support.messages,
 * users.view.basic. NO sensitive areas (contest internals, finance, winners,
 * audit, settings, admin role management) are represented here.
 */
export const ADMIN_PERMISSION_KEYS = [
  'vouchers.manage',
  'content.manage',
  'banners.manage',
  'notifications.manage',
  'support.messages',
  'users.view.basic',
  'partner_offers.finance.manage',
  'sales_leads.manage',
] as const;
export type AdminPermissionKey = (typeof ADMIN_PERMISSION_KEYS)[number];

export const ADMIN_PERMISSION_LABELS: Record<AdminPermissionKey, string> = {
  'vouchers.manage': 'Vouchery',
  'content.manage': 'Obsah stránek',
  'banners.manage': 'Bannery',
  'notifications.manage': 'Notifikace',
  'support.messages': 'Zprávy (podpora)',
  'users.view.basic': 'Uživatelé (základní)',
  'partner_offers.finance.manage': 'Partnerské nabídky (finance)',
  'sales_leads.manage': 'Obchodní leady',
};

interface UseAdminPermissions {
  /** True if superadmin (implicitly all) OR the user holds the explicit key. */
  can: (key: string) => boolean;
  permissions: Set<string>;
  loading: boolean;
  isSuperAdmin: boolean;
}

/**
 * Reads the current user's rows from public.admin_permissions (RLS: own rows).
 * Superadmin implicitly has every permission. Mirrors the DB helper
 * public.has_admin_permission(). Read-only — never writes.
 *
 * NOTE: if the admin_permissions table is not yet present (e.g. production before
 * the migration is applied), the query errors and we fall back to an empty set —
 * superadmin is unaffected (can() short-circuits on isSuperAdmin).
 */
export function useAdminPermissions(): UseAdminPermissions {
  const { user } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user?.id) {
        if (!cancelled) {
          setPermissions(new Set());
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('admin_permissions')
          .select('permission_key')
          .eq('user_id', user.id);
        if (cancelled) return;
        setPermissions(
          error ? new Set() : new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key)),
        );
      } catch {
        if (!cancelled) setPermissions(new Set());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const can = (key: string): boolean => isSuperAdmin || permissions.has(key);

  return { can, permissions, loading: loading || roleLoading, isSuperAdmin };
}

/** Map of safe admin route paths → required permission key (single source of truth). */
export const ADMIN_ROUTE_PERMISSION: Record<string, AdminPermissionKey> = {
  '/admin/vouchers': 'vouchers.manage',
  '/admin/content': 'content.manage',
  '/admin/banners': 'banners.manage',
  '/admin/notifications': 'notifications.manage',
  '/admin/messages': 'support.messages',
  '/admin/users': 'users.view.basic',
  '/admin/partner-offers': 'partner_offers.finance.manage',
  '/admin/sales-leads': 'sales_leads.manage',
};

/**
 * Ordered list of the safe admin entry routes a non-superadmin may land on.
 * Order defines the redirect priority when a subadmin opens /admin directly:
 * the first route whose permission the subadmin holds wins. Also drives the
 * non-superadmin primary nav (one direct link per held permission). Superadmin
 * is unaffected — it keeps the full section-based nav and the Dashboard.
 */
export const SUBADMIN_ENTRY_ROUTES: {
  path: string;
  permission: AdminPermissionKey;
  label: string;
}[] = [
  { path: '/admin/vouchers', permission: 'vouchers.manage', label: ADMIN_PERMISSION_LABELS['vouchers.manage'] },
  { path: '/admin/content', permission: 'content.manage', label: ADMIN_PERMISSION_LABELS['content.manage'] },
  { path: '/admin/banners', permission: 'banners.manage', label: ADMIN_PERMISSION_LABELS['banners.manage'] },
  { path: '/admin/notifications', permission: 'notifications.manage', label: ADMIN_PERMISSION_LABELS['notifications.manage'] },
  // Phase 3b support slice — short nav labels (not the descriptive grant-UI labels).
  { path: '/admin/messages', permission: 'support.messages', label: 'Zprávy' },
  { path: '/admin/users', permission: 'users.view.basic', label: 'Uživatelé' },
  // Phase 4 Slice A — Partner Offers (offer-only page; no invoices/portal).
  { path: '/admin/partner-offers', permission: 'partner_offers.finance.manage', label: 'Partnerské nabídky' },
  // Sales Leads Phase 2 — modul Obchod / Leady (docs/SALES_LEADS_ADMIN_SPEC.md).
  { path: '/admin/sales-leads', permission: 'sales_leads.manage', label: 'Obchod' },
];
