import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Search, ShieldCheck, ShieldOff, ShieldPlus, Crown } from 'lucide-react';

interface ManagedUser {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  /** '' | 'user' | 'admin' | 'superadmin' — '' means no user_roles row yet. */
  role: string;
  isPartnerAccount: boolean;
}

/**
 * Superadmin-only správa subadminů.
 *
 * Bezpečnostní invarianty (neměnit bez schválení):
 * - Stránka je přístupná pouze pro isSuperAdmin; jinak redirect na /admin.
 * - superadmin řádky jsou pouze pro zobrazení — nelze je zde vytvořit ani odebrat.
 * - Povoleny jsou výhradně přechody user ⇄ admin (subadmin), nikdy nic se superadminem.
 * - Zápis jde přímým insert/update do user_roles (RLS to už omezuje jen na superadmina),
 *   stejný osvědčený vzor jako AdminUsers.tsx. Žádná DB/RLS změna.
 */
const AdminAdmins: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const [allUsers, setAllUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user || !isSuperAdmin) return;
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, roleLoading, user, isSuperAdmin]);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*');

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        setAllUsers([]);
        return;
      }

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
        setAllUsers([]);
        return;
      }

      // Partner accounts must never be turned into admins.
      const { data: partners, error: partnersError } = await supabase
        .from('partners')
        .select('auth_user_id');

      if (partnersError) {
        console.error('Error fetching partners:', partnersError);
      }

      const partnerIds = new Set(
        (partners || [])
          .map((p: any) => p.auth_user_id)
          .filter(Boolean),
      );

      const mapped: ManagedUser[] = (profiles || []).map((p: any) => {
        const role = roles?.find((r: any) => r.user_id === p.id)?.role || '';
        return {
          id: p.id,
          name:
            p.full_name ||
            `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          first_name: p.first_name,
          last_name: p.last_name,
          role,
          isPartnerAccount: partnerIds.has(p.id),
        };
      });

      setAllUsers(mapped);
    } catch (err) {
      console.error('Unexpected error:', err);
      setAllUsers([]);
    } finally {
      setLoading(false);
    }
  };

  /** Promote a plain user to subadmin (admin). Never touches superadmin. */
  const promoteToAdmin = async (target: ManagedUser) => {
    if (!isSuperAdmin) return;
    if (target.isPartnerAccount) {
      toast({
        title: 'Akce zamítnuta',
        description: 'Partnerský účet nelze povýšit na admina.',
        variant: 'destructive',
      });
      return;
    }
    if (target.role === 'admin' || target.role === 'superadmin') return;

    try {
      setBusyId(target.id);
      if (target.role === 'user') {
        // Existing user_roles row → flip to admin.
        const { error } = await supabase
          .from('user_roles')
          .update({ role: 'admin' as any })
          .eq('user_id', target.id);
        if (error) throw error;
      } else {
        // No row yet → insert admin.
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: target.id, role: 'admin' as any });
        if (error) throw error;
      }

      await supabase.rpc('log_admin_action', {
        action_name: 'subadmin_granted',
        entity_type: 'user',
        entity_id: target.id,
        new_data: { role: 'admin' },
      });

      await fetchUsers();
      toast({ title: 'Hotovo', description: 'Uživatel byl povýšen na subadmina.' });
    } catch (error) {
      console.error('Error promoting user:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se povýšit uživatele.',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  /** Demote a subadmin (admin) back to user. Never touches superadmin. */
  const demoteToUser = async (target: ManagedUser) => {
    if (!isSuperAdmin) return;
    if (target.role !== 'admin') {
      // Guard: superadmin / user are never demotable from this page.
      return;
    }

    try {
      setBusyId(target.id);
      const { error } = await supabase
        .from('user_roles')
        .update({ role: 'user' as any })
        .eq('user_id', target.id);
      if (error) throw error;

      await supabase.rpc('log_admin_action', {
        action_name: 'subadmin_revoked',
        entity_type: 'user',
        entity_id: target.id,
        new_data: { role: 'user' },
      });

      await fetchUsers();
      toast({ title: 'Hotovo', description: 'Subadminovi byla odebrána admin práva.' });
    } catch (error) {
      console.error('Error demoting user:', error);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se odebrat admin práva.',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const adminLevelUsers = allUsers
    .filter((u) => u.role === 'admin' || u.role === 'superadmin')
    .sort((a, b) => {
      // superadmin first, then admins by name.
      if (a.role !== b.role) return a.role === 'superadmin' ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });

  const promotableUsers = (() => {
    const needle = searchTerm.trim().toLowerCase();
    if (needle.length === 0) return [];
    return allUsers
      .filter((u) => u.role !== 'admin' && u.role !== 'superadmin')
      .filter((u) => !u.isPartnerAccount)
      .filter((u) => {
        const fullName =
          u.name || [u.first_name, u.last_name].filter(Boolean).join(' ') || '';
        return fullName.toLowerCase().includes(needle);
      })
      .slice(0, 20);
  })();

  const renderRoleBadge = (role: string) => {
    if (role === 'superadmin') {
      return (
        <Badge variant="secondary" className="gap-1">
          <Crown className="h-3 w-3" /> SuperAdmin
        </Badge>
      );
    }
    if (role === 'admin') {
      return (
        <Badge variant="destructive" className="gap-1">
          <ShieldCheck className="h-3 w-3" /> Subadmin
        </Badge>
      );
    }
    return <Badge variant="outline">Uživatel</Badge>;
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

  // Only the superadmin (owner) may manage subadmins.
  if (!isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="container mx-auto px-4 py-6 pb-8 space-y-6">
      <Card className="luxury-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Správa adminů
          </CardTitle>
          <CardDescription>
            Pouze hlavní admin (superadmin) může přidávat a odebírat subadminy.
            Superadmin účet je pouze pro zobrazení a nelze ho zde měnit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Načítání...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jméno</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminLevelUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>{renderRoleBadge(u.role)}</TableCell>
                    <TableCell className="text-right">
                      {u.role === 'superadmin' ? (
                        <span className="text-xs text-muted-foreground">Vlastník — nelze měnit</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          disabled={busyId === u.id}
                          onClick={() => demoteToUser(u)}
                        >
                          <ShieldOff className="h-4 w-4" /> Odebrat admin práva
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {adminLevelUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Žádní admini.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="luxury-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldPlus className="h-5 w-5" /> Přidat subadmina
          </CardTitle>
          <CardDescription>
            Najděte uživatele podle jména a povyšte ho na subadmina. Partnerské účty
            nelze povyšovat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Hledat uživatele podle jména..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {searchTerm.trim().length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jméno</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotableUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>{renderRoleBadge(u.role || 'user')}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={busyId === u.id}
                        onClick={() => promoteToAdmin(u)}
                      >
                        <ShieldPlus className="h-4 w-4" /> Povýšit na subadmina
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {promotableUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Žádní odpovídající uživatelé.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAdmins;
