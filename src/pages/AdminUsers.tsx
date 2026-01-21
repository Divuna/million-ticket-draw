import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { AdminMenu } from '@/components/AdminMenu';
import { Search, Edit, Trash2, UserCheck, UserX, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  isPartnerAccount?: boolean;
}

const AdminUsers: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('všechny');

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      // Fetch users
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      // Fetch all partner auth_user_ids to detect partner accounts
      const { data: partnersData } = await supabase
        .from('partners')
        .select('auth_user_id');

      const partnerAuthIds = new Set(
        (partnersData || []).map(p => p.auth_user_id).filter(Boolean)
      );

      // Mark users that are partner accounts
      const usersWithPartnerFlag = (usersData || []).map(u => ({
        ...u,
        isPartnerAccount: partnerAuthIds.has(u.id)
      }));

      setUsers(usersWithPartnerFlag);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst uživatele",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    // Check if user is a partner account
    const targetUser = users.find(u => u.id === userId);
    if (targetUser?.isPartnerAccount) {
      toast({
        title: "Změna role zamítnuta",
        description: "Tento uživatel je partnerský účet. Role partnerských účtů nelze měnit.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      // Log admin action
      await supabase.rpc('log_admin_action', {
        action_name: 'user_role_updated',
        entity_type: 'user',
        entity_id: userId,
        new_data: { role: newRole }
      });

      await fetchUsers();
      toast({
        title: "Úspěch",
        description: "Role uživatele byla aktualizována",
      });
    } catch (error) {
      console.error('Error updating user role:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se aktualizovat roli uživatele",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (user.name && user.name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRole = roleFilter === 'všechny' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge variant="destructive">Admin</Badge>;
      case 'superadmin':
        return <Badge variant="secondary">SuperAdmin</Badge>;
      default:
        return <Badge variant="outline">Uživatel</Badge>;
    }
  };

  if (roleLoading) {
    return <div className="flex items-center justify-center min-h-screen">Načítání...</div>;
  }

  if (!user || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-6 pb-20">
        <Card className="luxury-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <UserCheck className="h-5 w-5 text-neon-gold" />
              Správa uživatelů
            </CardTitle>
            <CardDescription>
              Spravujte uživatele, jejich role a přístupová práva
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Hledejte podle emailu nebo jména..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filtrovat podle role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="všechny">Všechny role</SelectItem>
                  <SelectItem value="user">Uživatel</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="superadmin">SuperAdmin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="text-center py-8">Načítání uživatelů...</div>
            ) : (
              <div className="rounded-md border border-neon-blue/20">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-neon-blue/20 bg-gradient-to-r from-background to-background/80">
                      <TableHead className="text-primary">Email</TableHead>
                      <TableHead className="text-primary">Jméno</TableHead>
                      <TableHead className="text-primary">Role</TableHead>
                      <TableHead className="text-primary">Vytvořeno</TableHead>
                      <TableHead className="text-primary">Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id} className="luxury-table-row border-b border-border/50">
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>
                          {user.first_name && user.last_name 
                            ? `${user.first_name} ${user.last_name}`
                            : user.name || '-'
                          }
                        </TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>
                          {new Date(user.created_at).toLocaleDateString('cs-CZ')}
                        </TableCell>
                        <TableCell>
                          {user.isPartnerAccount ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 text-warning">
                                  <AlertTriangle className="h-4 w-4" />
                                  <Badge variant="outline" className="border-warning text-warning">
                                    Partnerský účet
                                  </Badge>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Role partnerských účtů nelze měnit</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Select 
                              value={user.role} 
                              onValueChange={(newRole) => updateUserRole(user.id, newRole)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">Uživatel</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="superadmin">SuperAdmin</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {filteredUsers.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">
                Nenalezeni žádní uživatelé podle zadaných kritérií.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <AdminMenu />
    </div>
  );
};

export default AdminUsers;