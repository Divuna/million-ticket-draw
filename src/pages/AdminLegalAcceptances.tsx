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
import { Download } from 'lucide-react';

interface LegalAcceptance {
  id: string;
  user_id: string;
  document_slug: string;
  document_version: string;
  accepted_at: string;
  user_email?: string;
}

const DOCUMENT_OPTIONS = [
  { value: 'all', label: 'Všechny dokumenty' },
  { value: 'obchodni-podminky', label: 'Obchodní podmínky' },
  { value: 'gdpr', label: 'GDPR' },
  { value: 'marketing', label: 'Marketing' },
];

const AdminLegalAcceptances: React.FC = () => {
  const { role, loading: roleLoading } = useUserRole();
  const [documentFilter, setDocumentFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

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

      // Join the data
      return (acceptancesData || []).map(acceptance => ({
        ...acceptance,
        user_email: emailMap.get(acceptance.user_id) || 'Neznámý'
      })) as LegalAcceptance[];
    },
    enabled: role === 'admin' || role === 'superadmin',
  });

  // Apply filters
  const filteredAcceptances = useMemo(() => {
    if (!acceptances) return [];
    
    return acceptances.filter(acceptance => {
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
  }, [acceptances, documentFilter, dateFrom, dateTo]);

  const handleExportCSV = () => {
    if (!filteredAcceptances.length) return;

    const headers = ['Email', 'Dokument', 'Verze', 'Datum souhlasu'];
    const rows = filteredAcceptances.map(a => [
      a.user_email || a.user_id,
      a.document_slug,
      a.document_version,
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
              Export CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
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
              Zobrazeno: {filteredAcceptances.length} záznamů
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="text-center py-8">Načítám data...</div>
            ) : filteredAcceptances.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email uživatele</TableHead>
                      <TableHead>Dokument</TableHead>
                      <TableHead>Verze</TableHead>
                      <TableHead>Datum souhlasu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAcceptances.map((acceptance) => (
                      <TableRow key={acceptance.id}>
                        <TableCell>{acceptance.user_email}</TableCell>
                        <TableCell>{acceptance.document_slug}</TableCell>
                        <TableCell>{acceptance.document_version}</TableCell>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLegalAcceptances;
