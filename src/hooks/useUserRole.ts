import { useAuth } from '@/hooks/useAuth';

export type UserRole = 'admin' | 'user';

export const useUserRole = (): { role: UserRole; isAdmin: boolean } => {
  const { user } = useAuth();
  
  const isAdmin = user?.email === 'divispavel2@gmail.com';
  const role: UserRole = isAdmin ? 'admin' : 'user';
  
  return { role, isAdmin };
};