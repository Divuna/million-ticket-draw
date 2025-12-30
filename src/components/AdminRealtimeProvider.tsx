import React, { createContext, useContext, ReactNode } from 'react';
import { useAdminRealtimeNotifications } from '@/hooks/useAdminRealtimeNotifications';
import { useUserRole } from '@/hooks/useUserRole';

interface AdminRealtimeContextType {
  soundEnabled: boolean;
  toggleSound: () => void;
  lastEvents: Array<{
    type: 'profile' | 'payment' | 'ticket';
    source: 'realtime' | 'polling';
    timestamp: Date;
    details?: string;
  }>;
  realtimeConnected: boolean;
  lastRealtimeEvent: Date | null;
}

const AdminRealtimeContext = createContext<AdminRealtimeContextType | null>(null);

export const useAdminRealtimeContext = () => {
  const context = useContext(AdminRealtimeContext);
  if (!context) {
    return {
      soundEnabled: false,
      toggleSound: () => {},
      lastEvents: [],
      realtimeConnected: false,
      lastRealtimeEvent: null
    };
  }
  return context;
};

interface AdminRealtimeProviderProps {
  children: ReactNode;
}

export const AdminRealtimeProvider: React.FC<AdminRealtimeProviderProps> = ({ children }) => {
  const { isAdmin } = useUserRole();
  const realtimeData = useAdminRealtimeNotifications(isAdmin);

  return (
    <AdminRealtimeContext.Provider value={realtimeData}>
      {children}
    </AdminRealtimeContext.Provider>
  );
};
