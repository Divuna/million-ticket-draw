import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface InfluencerStats {
  totalReferrals: number;
  activeReferrals: number;
  totalEarnedCzk: number;
  currentMonthCzk: number;
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
}

export const useInfluencerData = () => {
  const [data, setData] = useState<InfluencerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        // Get partner record
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

        if (partner.status !== 'approved' || !notesStr.toLowerCase().includes('influencer')) {
          setError('not_influencer');
          setLoading(false);
          return;
        }

        const partnerId = partner.id;

        // Fetch referrals, commissions, campaigns in parallel
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

        // Fetch campaign details if any
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

        // Calculate stats
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Active referrals: users who registered in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const activeReferrals = referrals.filter(
          (r) => new Date(r.created_at) >= thirtyDaysAgo
        ).length;

        const totalEarnedCzk = commissions
          .filter((c) => c.status === 'paid' || c.status === 'approved')
          .reduce((sum, c) => sum + Number(c.amount_czk), 0);

        const currentMonthCommission = commissions.find(
          (c) => c.period_month && c.period_month.startsWith(currentMonth)
        );
        const currentMonthCzk = currentMonthCommission
          ? Number(currentMonthCommission.amount_czk)
          : 0;

        // Build referral link using partner ID
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
            totalEarnedCzk,
            currentMonthCzk,
          },
          commissions: commissions as Commission[],
          campaigns,
          referralLink,
        });
      } catch (err) {
        console.error('Error loading influencer data:', err);
        setError('load_error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { data, loading, error };
};
