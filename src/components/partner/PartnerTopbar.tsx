import React from 'react';
import { useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Menu, CheckCircle, Clock, XCircle } from 'lucide-react';

interface PartnerTopbarProps {
  partnerStatus: string | null;
  onOpenMobileMenu: () => void;
}

const SECTION_TITLES: { test: (pathname: string, hash: string) => boolean; title: string }[] = [
  { test: (p, h) => p === '/partner/dashboard' && h === '#shoptet', title: 'Napojení e-shopu' },
  { test: (p, h) => p === '/partner/dashboard' && h === '#miocoiny', title: 'MioCoiny' },
  { test: (p, h) => p === '/partner/dashboard' && h === '#nastaveni', title: 'Nastavení' },
  { test: (p) => p === '/partner/dashboard', title: 'Přehled' },
  { test: (p) => p === '/partner/invoices', title: 'Faktury' },
  { test: (p) => p === '/partner/messages', title: 'Zprávy' },
  { test: (p) => p === '/partner/navody', title: 'Návody' },
];

function getSectionTitle(pathname: string, hash: string): string {
  const match = SECTION_TITLES.find((s) => s.test(pathname, hash));
  return match?.title ?? 'Partnerský portál';
}

/** Status badge — same three states/labels as the previous header (PartnerHeader in App.tsx). */
function StatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'approved':
      return (
        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
          <CheckCircle className="w-3 h-3 mr-1" />
          Aktivní
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Čeká na schválení
        </Badge>
      );
    case 'suspended':
      return (
        <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">
          <XCircle className="w-3 h-3 mr-1" />
          Pozastaveno
        </Badge>
      );
    default:
      return null;
  }
}

export const PartnerTopbar: React.FC<PartnerTopbarProps> = ({ partnerStatus, onOpenMobileMenu }) => {
  const location = useLocation();
  const title = getSectionTitle(location.pathname, location.hash);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 backdrop-blur px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Otevřít menu"
          className="lg:hidden -ml-1 w-9 h-9 rounded-lg flex items-center justify-center text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base sm:text-lg font-semibold text-[hsl(var(--foreground))] truncate">{title}</h1>
      </div>
      <StatusBadge status={partnerStatus} />
    </header>
  );
};
