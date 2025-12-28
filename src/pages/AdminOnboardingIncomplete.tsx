import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { Header } from '@/components/Header';
import { AdminMenu } from '@/components/AdminMenu';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, AlertCircle, Calendar, RefreshCw, Mail, Send, Download } from 'lucide-react';

interface IncompleteUser {
  id: string;
  email: string;
  created_at: string;
}

const AdminOnboardingIncomplete: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [users, setUsers] = useState<IncompleteUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const fetchIncompleteUsers = async () => {
    setLoading(true);
    try {
      // First get all users
      let query = supabase
        .from('users')
        .select('id, email, created_at')
        .order('created_at', { ascending: false });

      // Apply date filters
      if (dateFrom) {
        query = query.gte('created_at', `${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        query = query.lte('created_at', `${dateTo}T23:59:59`);
      }

      const { data: allUsers, error: usersError } = await query;

      if (usersError) {
        console.error('Error fetching users:', usersError);
        setUsers([]);
        return;
      }

      if (!allUsers || allUsers.length === 0) {
        setUsers([]);
        return;
      }

      // Get all profiles with date_of_birth set
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, date_of_birth');

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
      }

      // Create a set of user IDs that have date_of_birth
      const usersWithDob = new Set(
        (profiles || [])
          .filter((p: any) => p.date_of_birth !== null)
          .map((p: any) => p.id)
      );

      // Filter users who don't have date_of_birth
      const incompleteUsers = allUsers.filter(u => !usersWithDob.has(u.id));
      
      setUsers(incompleteUsers);
    } catch (error) {
      console.error('Error:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchIncompleteUsers();
    }
  }, [isAdmin]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchIncompleteUsers();
    setRefreshing(false);
  };

  const handleFilter = () => {
    fetchIncompleteUsers();
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    fetchIncompleteUsers();
  };

  const handleSendMassEmail = async () => {
    setConfirmDialogOpen(false);
    setSendingEmails(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('send-onboarding-reminder');
      
      if (error) {
        console.error('Error sending emails:', error);
        toast({
          title: "Chyba",
          description: "Nepodařilo se odeslat e-maily.",
          variant: "destructive"
        });
        return;
      }
      
      toast({
        title: "Hromadný e-mail odeslán",
        description: data.message || `Odesláno: ${data.sent}, Přeskočeno: ${data.skipped}`
      });
      
      // Refresh the list
      await fetchIncompleteUsers();
    } catch (err: any) {
      console.error('Exception:', err);
      toast({
        title: "Chyba",
        description: err.message || "Nepodařilo se odeslat e-maily.",
        variant: "destructive"
      });
    } finally {
      setSendingEmails(false);
    }
  };

  const handleExportCSV = () => {
    if (users.length === 0) return;
    
    const headers = ['email', 'user_id', 'created_at'];
    const csvRows = [
      headers.join(','),
      ...users.map(u => [
        `"${u.email}"`,
        u.id,
        u.created_at
      ].join(','))
    ];
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'incomplete-onboarding.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "CSV exportován",
      description: `Exportováno ${users.length} uživatelů.`
    });
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header />
      
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-500" />
                  Nedokončený onboarding
                </CardTitle>
                <CardDescription>
                  Uživatelé, kteří nemají vyplněné datum narození (pravděpodobně OAuth registrace)
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={loading || users.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportovat CSV
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setConfirmDialogOpen(true)}
                  disabled={sendingEmails || loading || users.length === 0}
                >
                  {sendingEmails ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Odeslat hromadný e-mail
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing || loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Obnovit
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-end p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="space-y-2">
                <Label htmlFor="dateFrom" className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Registrace od
                </Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="dateTo" className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Registrace do
                </Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-40"
                />
              </div>
              
              <div className="flex gap-2">
                <Button onClick={handleFilter} disabled={loading}>
                  Filtrovat
                </Button>
                <Button variant="outline" onClick={handleClearFilters} disabled={loading}>
                  Vymazat
                </Button>
              </div>
            </div>

            {/* Results */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Žádní uživatelé s nedokončeným onboardingem.</p>
              </div>
            ) : (
              <>
                <div className="text-sm text-muted-foreground">
                  Nalezeno {users.length} uživatelů
                </div>
                
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>E-mail</TableHead>
                        <TableHead>ID uživatele</TableHead>
                        <TableHead>Datum registrace</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.email}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {u.id}
                          </TableCell>
                          <TableCell>
                            {format(new Date(u.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Potvrzení hromadného odeslání</AlertDialogTitle>
            <AlertDialogDescription>
              Opravdu chcete odeslat připomínkový e-mail všem {users.length} uživatelům s nedokončeným onboardingem?
              <br /><br />
              <strong>Poznámka:</strong> Uživatelé, kteří již obdrželi připomínku v posledních 7 dnech, budou automaticky přeskočeni.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendMassEmail}>
              <Mail className="h-4 w-4 mr-2" />
              Odeslat e-maily
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdminMenu />
    </div>
  );
};

export default AdminOnboardingIncomplete;
