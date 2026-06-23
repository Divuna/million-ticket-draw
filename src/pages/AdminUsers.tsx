import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
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
  hasUserRole?: boolean;
}

const AdminUsers: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isSuperAdmin, loading: roleLoading } = useUserRole();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('všechny');

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user || !isAdmin) return;
    fetchUsers();
  }, [authLoading, roleLoading, user, isAdmin]);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Phase 3b: a non-superadmin support viewer (users.view.basic) must never
      // receive sensitive PII (date_of_birth, street/city/zip/country, avatar).
      // Fetch only basic-safe columns for them; superadmin keeps the full row.
      const profileColumns = isSuperAdmin
        ? '*'
        : 'id, full_name, first_name, last_name, phone, updated_at';

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(profileColumns);

      if (profilesError) {
        console.error('Error fetching users:', profilesError);
        setUsers([]);
        return;
      }

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
        setUsers([]);
        return;
      }

      const mappedUsers = (profiles || []).map((p: any) => {
        const role = roles?.find((r: any) => r.user_id === p.id)?.role || 'user';

        return {
          id: p.id,
          name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          first_name: p.first_name,
          last_name: p.last_name,
          phone: p.phone,
          email: '',
          role,
          // Keep existing UI working (created_at column)
          created_at: p.updated_at || new Date(0).toISOString(),
        };
      });

      setUsers(mappedUsers as any);
    } catch (err) {
      console.error('Unexpected error:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    const { error } = await supabase.rpc('set_user_role', {
      target_user_id: userId,
      new_role: role
    });

    if (error) {
      console.error(error);
      toast({
        title: "Nepodařilo se změnit roli",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Role byla změněna" });
    fetchUsers();
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    // Only superadmin can change roles
    if (!isSuperAdmin) {
      toast({
        title: "Přístup zamítnut",
        description: "Pouze SuperAdmin může měnit role uživatelů.",
        variant: "destructive",
      });
      return;
    }

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
      // Update role in user_roles table (source of truth)
      if (targetUser?.hasUserRole) {
        // Update existing record
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole as any })
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole as any });
        if (error) throw error;
      }

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
    // Email is not available (we no longer read from auth.users), so search must be name-based.
    const needle = searchTerm.trim().toLowerCase();
    const fullName =
      user.name ||
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      '';
    const matchesSearch = needle.length === 0 || fullName.toLowerCase().includes(needle);
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

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="mt-2 text-muted-foreground">Načítání...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <NavigateToLogin />;
  }

  if (!isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="container mx-auto px-4 py-6 pb-8">
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
                                <div className="flex items-center gap-2 text-amber-300">
                                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                                  <Badge variant="warning">Partnerský účet</Badge>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Role partnerských účtů nelze měnit</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : !isSuperAdmin ? (
                            <Badge variant="outline">{getRoleBadge(user.role)}</Badge>
                          ) : (
                            <select
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.id, e.target.value)}
                              className="h-9 w-32 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                            >
                              <option value="user">Uživatel</option>
                              <option value="admin">Admin</option>
                            </select>
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
  );
};

export default AdminUsers;