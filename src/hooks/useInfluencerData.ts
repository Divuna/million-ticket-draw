/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  INFLUENCER SYSTEM — Monetary CZK payouts, invoiced, admin-controlled      ║
 * ║                                                                            ║
 * ║  This hook is part of the INFLUENCER partnership system. It uses:           ║
 * ║    • partners — influencer accounts (identified by 'influencer' in notes)   ║
 * ║    • influencer_referrals — tracking user registrations via influencer link ║
 * ║    • influencer_commissions — monthly CZK commission calculations          ║
 * ║    • influencer_campaigns — marketing campaigns with CZK/MC bonuses        ║
 * ║    • influencer_campaign_partners — campaign ↔ influencer assignments       ║
 * ║    • influencer_campaign_events — campaign conversion tracking              ║
 * ║    • influencer_campaign_bonuses_czk — per-user CZK bonus records          ║
 * ║                                                                            ║
 * ║  ⚠️  THIS SYSTEM IS INTENTIONALLY SEPARATE from the Player referral system.║
 * ║  These two systems MUST NEVER be merged or unified.                        ║
 * ║                                                                            ║
 * ║  Influencer system: monetary CZK payouts, invoiced, admin-controlled.      ║
 * ║  Player referrals: non-monetary, in-game MioCoin rewards only.             ║
 * ║  See: src/components/ReferralSection.tsx for the player counterpart.        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface InfluencerStats {
  totalReferrals: number;
  activeReferrals: number;
  todayReferrals: number;
  thisMonthReferrals: number;
  conversionRate: number;
  totalEarnedCzk: number;
  currentMonthCzk: number;
  pendingPayoutCzk: number;
}

interface Commission {
  id: string;
  period_month: string;
  amount_czk: number;
  status: string;
  updated_at: string;
}

interface Campaign {
  id: string;
  name: string;
  bonus_czk_per_new_user: number;
  bonus_mc_for_user: number;
  starts_at: string;
  ends_at: string;
  active: boolean;
}

export interface InfluencerData {
  partnerId: string;
  name: string;
  contactEmail: string | null;
  websiteUrl: string;
  stats: InfluencerStats;
  commissions: Commission[];
  campaigns: Campaign[];
  referralLink: string;
  currentRewardPerUser: number | null;
  nextPayoutDate: string;
}

export const useInfluencerData = () => {
  const [data, setData] = useState<InfluencerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.user) {
          setError('not_authenticated');
          setLoading(false);
          return;
        }

        const userId = sessionData.session.user.id;

        const { data: partner, error: partnerError } = await supabase
          .from('partners')
          .select('id, name, contact_email, website_url, status, notes')
          .eq('auth_user_id', userId)
          .maybeSingle();

        if (partnerError) throw partnerError;
        if (!partner) {
          setError('not_influencer');
          setLoading(false);
          return;
        }

        const notesStr = typeof partner.notes === 'string'
          ? partner.notes
          : (partner.notes ? JSON.stringify(partner.notes) : '');

        if (!notesStr.toLowerCase().includes('influencer')) {
          setError('not_influencer');
          setLoading(false);
          return;
        }

        if (partner.status !== 'approved') {
          setError(partner.status === 'pending' ? 'pending_approval' : 'rejected');
          setLoading(false);
          return;
        }

        const partnerId = partner.id;

        const [referralsRes, commissionsRes, campaignPartnersRes] = await Promise.all([
          supabase
            .from('influencer_referrals')
            .select('id, user_id, created_at')
            .eq('influencer_partner_id', partnerId),
          supabase
            .from('influencer_commissions')
            .select('id, period_month, amount_czk, status, updated_at')
            .eq('influencer_partner_id', partnerId)
            .order('period_month', { ascending: false }),
          supabase
            .from('influencer_campaign_partners')
            .select('campaign_id')
            .eq('influencer_partner_id', partnerId),
        ]);

        if (referralsRes.error) throw referralsRes.error;
        if (commissionsRes.error) throw commissionsRes.error;
        if (campaignPartnersRes.error) throw campaignPartnersRes.error;

        const referrals = referralsRes.data || [];
        const commissions = commissionsRes.data || [];
        const campaignPartners = campaignPartnersRes.data || [];

        // Fetch campaigns
        let campaigns: Campaign[] = [];
        if (campaignPartners.length > 0) {
          const campaignIds = campaignPartners.map((cp) => cp.campaign_id);
          const { data: campaignData, error: campaignError } = await supabase
            .from('influencer_campaigns')
            .select('id, name, bonus_czk_per_new_user, bonus_mc_for_user, starts_at, ends_at, active')
            .in('id', campaignIds)
            .order('starts_at', { ascending: false });

          if (campaignError) throw campaignError;
          campaigns = (campaignData || []) as Campaign[];
        }

        // Check conversion: count UNIQUE paying users
        let payingUsersCount = 0;
        if (referrals.length > 0) {
          const userIds = referrals.map((r) => r.user_id);
          const { data: paymentRows } = await supabase
            .from('payments')
            .select('user_id')
            .in('user_id', userIds)
            .eq('status', 'completed');
          const uniquePayingUsers = new Set((paymentRows || []).map((p) => p.user_id));
          payingUsersCount = uniquePayingUsers.size;
        }

        // Calculate stats
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const todayReferrals = referrals.filter(
          (r) => new Date(r.created_at) >= todayStart
        ).length;

        const thisMonthReferrals = referrals.filter(
          (r) => new Date(r.created_at) >= monthStart
        ).length;

        const activeReferrals = referrals.filter(
          (r) => new Date(r.created_at) >= thirtyDaysAgo
        ).length;

        const conversionRate = referrals.length > 0
          ? Math.round((payingUsersCount / referrals.length) * 100)
          : 0;

        const totalEarnedCzk = commissions
          .filter((c) => c.status === 'paid')
          .reduce((sum, c) => sum + Number(c.amount_czk), 0);

        const pendingPayoutCzk = commissions
          .filter((c) => c.status === 'calculated' || c.status === 'approved')
          .reduce((sum, c) => sum + Number(c.amount_czk), 0);

        const currentMonthCommission = commissions.find(
          (c) => c.period_month && c.period_month.startsWith(currentMonth)
        );
        const currentMonthCzk = currentMonthCommission
          ? Number(currentMonthCommission.amount_czk)
          : 0;

        // Current reward per user from truly active campaign (active + date range)
        const activeCampaign = campaigns.find((c) => {
          if (!c.active) return false;
          const nowMs = now.getTime();
          return nowMs >= new Date(c.starts_at).getTime() && nowMs <= new Date(c.ends_at).getTime();
        });
        const currentRewardPerUser = activeCampaign
          ? Number(activeCampaign.bonus_czk_per_new_user)
          : null;

        // Next payout date: first day of next month
        const nextPayoutDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

        const origin = window.location.origin;
        const referralLink = `${origin}/?ref=${partnerId}`;

        setData({
          partnerId,
          name: partner.name,
          contactEmail: partner.contact_email as string | null,
          websiteUrl: partner.website_url,
          stats: {
            totalReferrals: referrals.length,
            activeReferrals,
            todayReferrals,
            thisMonthReferrals,
            conversionRate,
            totalEarnedCzk,
            currentMonthCzk,
            pendingPayoutCzk,
          },
          commissions: commissions as Commission[],
          campaigns,
          referralLink,
          currentRewardPerUser,
          nextPayoutDate,
        });
      } catch (err) {
        console.error('Error loading influencer data:', err);
        setError('load_error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [refreshKey]);

  return { data, loading, error, refetch };
};
