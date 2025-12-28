import React from 'react';
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
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

interface LegalAcceptance {
  id: string;
  user_id: string;
  document_slug: string;
  document_version: string;
  accepted_at: string;
}

const AdminLegalAcceptances: React.FC = () => {
  const { role, loading: roleLoading } = useUserRole();

  const { data: acceptances, isLoading } = useQuery({
    queryKey: ['admin-legal-acceptances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_legal_acceptances')
        .select('*')
        .order('accepted_at', { ascending: false });

      if (error) throw error;
      return data as LegalAcceptance[];
    },
    enabled: role === 'admin' || role === 'superadmin',
  });

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
          <CardHeader>
            <CardTitle>Souhlasy uživatelů</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Načítám data...</div>
            ) : acceptances && acceptances.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID uživatele</TableHead>
                      <TableHead>Dokument</TableHead>
                      <TableHead>Verze</TableHead>
                      <TableHead>Datum souhlasu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acceptances.map((acceptance) => (
                      <TableRow key={acceptance.id}>
                        <TableCell className="font-mono text-xs">
                          {acceptance.user_id}
                        </TableCell>
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
                Zatím nejsou zaznamenány žádné souhlasy.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLegalAcceptances;
