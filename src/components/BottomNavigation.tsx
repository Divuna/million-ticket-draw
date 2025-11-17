import { useNavigate, useLocation } from "react-router-dom";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";

import { Home, User, Ticket, Gamepad2, MessageCircle } from "lucide-react";

export const BottomNavigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount } = useUnreadMessagesCount();

  const navItems = [
    { path: "/", label: "Domů", icon: Home },
    { path: "/profile", label: "Můj profil", icon: User },
    { path: "/vouchers", label: "Vouchery", icon: Ticket },
    { path: "/games", label: "Moje hry", icon: Gamepad2 },
    { path: "/messages", label: "Zprávy", icon: MessageCircle },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-around bg-[#0B0F19] border-t border-white/10 py-2">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        const showBadge = item.path === "/messages" && unreadCount > 0;

        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`relative flex flex-col items-center gap-1 px-3 py-1 text-xs transition
              ${isActive ? "text-blue-400" : "text-white/60"}`}
          >
            <div className="relative">
              <Icon size={22} />

              {showBadge && (
                <span
                  className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold 
                             rounded-full px-[6px] py-[1px] shadow-lg"
                >
                  {unreadCount}
                </span>
              )}
            </div>

            {item.label}
          </button>
        );
      })}
    </div>
  );
};
