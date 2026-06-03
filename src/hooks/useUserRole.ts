import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'admin' | 'superadmin' | 'user' | 'partner';
export type AccountType = 'partner' | 'customer';

export const useUserRole = (): { 
  role: UserRole; 
  isAdmin: boolean; 
  isSuperAdmin: boolean; 
  isPartner: boolean; 
  accountType: AccountType;
  isPartnerAccount: boolean;
  isInfluencerAccount: boolean;
  isAffiliateAccount: boolean;
  loading: boolean
} => {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole>('user');
  const [accountType, setAccountType] = useState<AccountType>('customer');
  const [isInfluencerAccount, setIsInfluencerAccount] = useState(false);
  const [isAffiliateAccount, setIsAffiliateAccount] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.id) {
        setRole('user');
        setAccountType('customer');
        setIsInfluencerAccount(false);
        setIsAffiliateAccount(false);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Check if user exists in partners table (auth_user_id = user.id)
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id, status, notes')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        if (partnerData) {
          setAccountType('partner');
          // Detect approved influencer accounts (handle notes as string or object)
          const notesStr = typeof partnerData.notes === 'string' 
            ? partnerData.notes 
            : (partnerData.notes ? JSON.stringify(partnerData.notes) : '');
          setIsInfluencerAccount(
            partnerData.status === 'approved' && notesStr.toLowerCase().includes('influencer')
          );
          // Legacy partner row takes precedence; affiliate v2 only applies to
          // users WITHOUT a partners row (keeps legacy system running in parallel).
          setIsAffiliateAccount(false);
        } else {
          setAccountType('customer');
          setIsInfluencerAccount(false);

          // Affiliate v2: detect standalone affiliate account (no partners row).
          try {
            const { data: affData } = await (supabase as any)
              .from('affiliate_accounts')
              .select('id')
              .eq('auth_user_id', user.id)
              .maybeSingle();
            setIsAffiliateAccount(!!affData);
          } catch {
            setIsAffiliateAccount(false);
          }
        }

        // Also fetch role from user_roles table
        const { data: roleData, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching user role:', error);
          setRole('user');
        } else if (roleData) {
          setRole(roleData.role as UserRole);
        } else {
          setRole('user');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setRole('user');
        setAccountType('customer');
        setIsInfluencerAccount(false);
        setIsAffiliateAccount(false);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user?.id]);

  const isAdmin = role === 'admin' || role === 'superadmin';
  const isSuperAdmin = role === 'superadmin';
  const isPartner = role === 'partner';
  const isPartnerAccount = accountType === 'partner';
  
  return { role, isAdmin, isSuperAdmin, isPartner, accountType, isPartnerAccount, isInfluencerAccount, isAffiliateAccount, loading };
};