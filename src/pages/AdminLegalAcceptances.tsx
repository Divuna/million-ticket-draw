import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate } from 'react-router-dom';
import { AdminMenu } from '@/components/AdminMenu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { Download, ChevronLeft, ChevronRight, Search, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface LegalAcceptance {
  id: string;
  user_id: string;
  document_slug: string;
  document_version: string;
  accepted_at: string;
  user_email?: string;
  isRevoked?: boolean;
}

const DOCUMENT_OPTIONS = [
  { value: 'all', label: 'Všechny dokumenty' },
  { value: 'obchodni-podminky', label: 'Obchodní podmínky' },
  { value: 'gdpr', label: 'GDPR' },
  { value: 'marketing', label: 'Marketing' },
];

const PAGE_SIZE = 25;

const AdminLegalAcceptances: React.FC = () => {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [documentFilter, setDocumentFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [emailSearch, setEmailSearch] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  const { data: acceptances, isLoading } = useQuery({
    queryKey: ['admin-legal-acceptances'],
    queryFn: async () => {
      // Fetch acceptances
      const { data: acceptancesData, error: acceptancesError } = await supabase
        .from('user_legal_acceptances')
        .select('*')
        .order('accepted_at', { ascending: false });

      if (acceptancesError) throw acceptancesError;

      // Fetch users to get emails
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, email');

      if (usersError) throw usersError;

      // Create a map for quick email lookup
      const emailMap = new Map(usersData?.map(u => [u.id, u.email]) || []);

      // Join the data and mark revoked entries
      return (acceptancesData || []).map(acceptance => ({
        ...acceptance,
        user_email: emailMap.get(acceptance.user_id) || 'Neznámý',
        isRevoked: acceptance.document_slug === 'marketing' && acceptance.document_version === 'revoked'
      })) as LegalAcceptance[];
    },
    enabled: role === 'admin' || role === 'superadmin',
  });

  // Apply filters
  const filteredAcceptances = useMemo(() => {
    if (!acceptances) return [];
    
    return acceptances.filter(acceptance => {
      // Email search filter (case-insensitive)
      if (emailSearch) {
        const searchLower = emailSearch.toLowerCase();
        const emailLower = (acceptance.user_email || '').toLowerCase();
        if (!emailLower.includes(searchLower)) return false;
      }
      
      // Document filter
      if (documentFilter !== 'all' && acceptance.document_slug !== documentFilter) {
        return false;
      }
      
      // Date from filter
      if (dateFrom) {
        const acceptedDate = new Date(acceptance.accepted_at);
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (acceptedDate < fromDate) return false;
      }
      
      // Date to filter
      if (dateTo) {
        const acceptedDate = new Date(acceptance.accepted_at);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (acceptedDate > toDate) return false;
      }
      
      return true;
    });
  }, [acceptances, documentFilter, dateFrom, dateTo, emailSearch]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [documentFilter, dateFrom, dateTo, emailSearch]);

  // Pagination
  const totalPages = Math.ceil(filteredAcceptances.length / PAGE_SIZE);
  const paginatedAcceptances = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredAcceptances.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredAcceptances, currentPage]);

  const handleExportCSV = () => {
    if (!filteredAcceptances.length) return;

    const headers = ['Email', 'Dokument', 'Verze', 'Stav', 'Datum'];
    const rows = filteredAcceptances.map(a => [
      a.user_email || a.user_id,
      a.document_slug,
      a.document_version,
      a.isRevoked ? 'Odvoláno' : 'Aktivní',
      format(new Date(a.accepted_at), 'dd.MM.yyyy HH:mm', { locale: cs })
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `souhlasy-uzivatelu-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (roleLoading) {
    return <div className="flex items-center justify-center min-h-screen">Načítám...</div>;
  }

  if (role !== 'admin' && role !== 'superadmin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminMenu />
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Souhlasy uživatelů</CardTitle>
            <Button 
              variant="outline" 
              onClick={handleExportCSV}
              disabled={!filteredAcceptances.length}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV ({filteredAcceptances.length})
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="email-search">Hledat email</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email-search"
                    type="text"
                    placeholder="Zadejte email..."
                    value={emailSearch}
                    onChange={(e) => setEmailSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="document-filter">Dokument</Label>
                <Select value={documentFilter} onValueChange={setDocumentFilter}>
                  <SelectTrigger id="document-filter">
                    <SelectValue placeholder="Vyberte dokument" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date-from">Datum od</Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date-to">Datum do</Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {/* Results count */}
            <div className="text-sm text-muted-foreground">
              Zobrazeno: {paginatedAcceptances.length} z {filteredAcceptances.length} záznamů
              {totalPages > 1 && ` (stránka ${currentPage} z ${totalPages})`}
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="text-center py-8">Načítám data...</div>
            ) : paginatedAcceptances.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email uživatele</TableHead>
                      <TableHead>Dokument</TableHead>
                      <TableHead>Verze</TableHead>
                      <TableHead>Stav</TableHead>
                      <TableHead>Datum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedAcceptances.map((acceptance) => (
                      <TableRow key={acceptance.id} className={acceptance.isRevoked ? 'bg-destructive/10' : ''}>
                        <TableCell>{acceptance.user_email}</TableCell>
                        <TableCell>{acceptance.document_slug}</TableCell>
                        <TableCell>{acceptance.document_version}</TableCell>
                        <TableCell>
                          {acceptance.isRevoked ? (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Odvoláno
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Aktivní</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(acceptance.accepted_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {acceptances?.length ? 'Žádné záznamy neodpovídají filtrům.' : 'Zatím nejsou zaznamenány žádné souhlasy.'}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Předchozí
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="w-10"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Další
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLegalAcceptances;
