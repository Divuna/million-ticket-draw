import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared pending-count source for the "Uživatelé" admin section (row 1) and its
 * "Partneři" sub-nav item (row 2) in AdminPrimaryNav.tsx / AdminContextSubNav.tsx.
 *
 * Every count here mirrors an existing, already-displayed number elsewhere in the
 * admin UI (AdminPartners.tsx tab data, AdminSalesLeads unread badge, the
 * "Žádosti firem" nav dot) — this hook does not introduce a new source of truth,
 * it only centralizes the polling so the row-1 and row-2 badges cannot drift
 * apart by reading two independent copies of the same query.
 */
export const useAdminUsersPendingCounts = () => {
  const [pendingPartnerRegistrationsCount, setPendingPartnerRegistrationsCount] = useState(0);
  const [pendingShoptetRequestsCount, setPendingShoptetRequestsCount] = useState(0);
  const [pendingLogoApprovalsCount, setPendingLogoApprovalsCount] = useState(0);
  const [pendingCompanyLeadsCount, setPendingCompanyLeadsCount] = useState(0);
  const [unreadSalesRepliesCount, setUnreadSalesRepliesCount] = useState(0);

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

  // Stejný zdroj/filtr jako badge v záložce "Shoptet žádosti" na /admin/partners:
  // shoptet_connection_requests, status='submitted'.
  useEffect(() => {
    let cancelled = false;

    const loadPendingShoptetRequestsCount = async () => {
      try {
        const { count, error } = await supabase
          .from("shoptet_connection_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted");
        if (!cancelled && !error) {
          setPendingShoptetRequestsCount(count ?? 0);
        }
      } catch {
        // best-effort — silent fail
      }
    };

    loadPendingShoptetRequestsCount();
    const interval = setInterval(loadPendingShoptetRequestsCount, 60_000);
    window.addEventListener("shoptet-requests-changed", loadPendingShoptetRequestsCount);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("shoptet-requests-changed", loadPendingShoptetRequestsCount);
    };
  }, []);

  // Stejný zdroj/filtr jako "Schválení log" v AdminPartners: partners.logo_status = 'pending'.
  useEffect(() => {
    let cancelled = false;

    const loadPendingLogoApprovalsCount = async () => {
      try {
        const { count, error } = await supabase
          .from("partners")
          .select("id", { count: "exact", head: true })
          .eq("logo_status", "pending");
        if (!cancelled && !error) {
          setPendingLogoApprovalsCount(count ?? 0);
        }
      } catch {
        // best-effort — silent fail
      }
    };

    loadPendingLogoApprovalsCount();
    const interval = setInterval(loadPendingLogoApprovalsCount, 60_000);
    window.addEventListener("partner-logo-requests-changed", loadPendingLogoApprovalsCount);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("partner-logo-requests-changed", loadPendingLogoApprovalsCount);
    };
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    const loadUnreadSalesReplies = async () => {
      try {
        const [replies, tasks] = await Promise.all([
          supabase
            .from("sales_lead_activities")
            .select("id", { count: "exact", head: true })
            .eq("activity_type", "reply_received")
            .is("read_at", null),
          (supabase as any)
            .from("sales_lead_tasks")
            .select("id", { count: "exact", head: true })
            .eq("status", "ceka"),
        ]);
        if (!cancelled && !replies.error) {
          setUnreadSalesRepliesCount((replies.count ?? 0) + (tasks.error ? 0 : tasks.count ?? 0));
        }
      } catch {
        // best-effort — silent fail (např. chybějící sloupec před migrací)
      }
    };
    loadUnreadSalesReplies();
    const interval = setInterval(loadUnreadSalesReplies, 60_000);
    window.addEventListener("sales-leads-unread-changed", loadUnreadSalesReplies);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("sales-leads-unread-changed", loadUnreadSalesReplies);
    };
  }, []);

  const partnersTotal =
    pendingPartnerRegistrationsCount + pendingShoptetRequestsCount + pendingLogoApprovalsCount;

  return {
    pendingPartnerRegistrationsCount,
    pendingShoptetRequestsCount,
    pendingLogoApprovalsCount,
    pendingCompanyLeadsCount,
    unreadSalesRepliesCount,
    /** "Partneři" sub-nav badge: čekající registrace + Shoptet žádosti + schválení log. */
    partnersTotal,
    /** "Uživatelé" top-level badge: every pending item this hook tracks. */
    usersSectionTotal:
      partnersTotal + pendingCompanyLeadsCount + unreadSalesRepliesCount,
  };
};
