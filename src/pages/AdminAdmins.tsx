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
import { Search, ShieldCheck, ShieldOff, ShieldPlus, Crown, Mail } from 'lucide-react';

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  first_name?: string;
  last_name?: string;
  /** '' | 'user' | 'admin' | 'superadmin' — '' means no user_roles row yet. */
  role: string;
  isPartnerAccount: boolean;
}

/**
 * Identity fallback chain for a row:
 * 1) full name from profiles,
 * 2) profiles.email,
 * 3) current authenticated user's email (only for the logged-in user's own row),
 * 4) shortened user_id as last resort.
 *
 * `sessionEmail` is the auth-session email of the viewer; `sessionUserId` is their id.
 */
const displayName = (
  u: ManagedUser,
  sessionEmail: string | null,
  sessionUserId: string | null,
): string => {
  const name =
    u.name || [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (u.email) return u.email;
  if (sessionEmail && sessionUserId && u.id === sessionUserId) return sessionEmail;
  return `#${u.id.slice(0, 8)}`;
};

/** Row returned by the get_admin_subadmins_overview() RPC. */
interface SubadminOverview {
  user_id: string;
  email: string | null;
  role: string;
  created_at: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  full_name: string | null;
  profile_email: string | null;
  last_seen_at: string | null;
  latest_invite_status: string | null;
  latest_invite_sent_at: string | null;
}

/** Identity for an overview row: full name → profile email → auth email → #id. */
const overviewName = (r: SubadminOverview): string =>
  (r.full_name && r.full_name.trim()) ||
  r.profile_email ||
  r.email ||
  `#${r.user_id.slice(0, 8)}`;

/** Short Czech relative time, e.g. "před 3 min", "před 2 h", "21. 6.". */
const relativeCzech = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  if (Number.isNaN(diffMs)) return '—';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'právě teď';
  if (min < 60) return `před ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `před ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `před ${days} d`;
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
};

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
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [overview, setOverview] = useState<SubadminOverview[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user || !isSuperAdmin) return;
    fetchUsers();
    fetchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, roleLoading, user, isSuperAdmin]);

  // Poll "online now" via the existing presence RPC (5-minute window).
  useEffect(() => {
    if (authLoading || roleLoading || !user || !isSuperAdmin) return;
    let cancelled = false;

    const loadOnline = async () => {
      try {
        const { data, error } = await supabase.rpc('get_admin_online_users', {
          p_active_window_seconds: 300,
        });
        if (error || cancelled) return;
        const payload = data as { success?: boolean; users?: { userId: string }[] } | null;
        if (payload?.success) {
          setOnlineIds(new Set((payload.users ?? []).map((u) => u.userId)));
        }
      } catch {
        // best-effort — presence is non-critical
      }
    };

    loadOnline();
    const interval = setInterval(loadOnline, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, roleLoading, user, isSuperAdmin]);

  const fetchOverview = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_subadmins_overview');
      if (error) {
        console.error('Error fetching subadmins overview:', error);
        setOverview([]);
        return;
      }
      setOverview((data as SubadminOverview[]) ?? []);
    } catch (err) {
      console.error('Unexpected error fetching overview:', err);
      setOverview([]);
    }
  };

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
          email: p.email || '',
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
      await fetchOverview();
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
      await fetchOverview();
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

  /**
   * Invite a brand-new subadmin by email — no prior OneMil registration needed.
   * Server-side Edge Function verifies the caller is superadmin, creates/reuses
   * the auth user, assigns role 'admin' (never superadmin) and emails a one-time
   * password setup link. The link is never returned to the browser.
   */
  const inviteSubadmin = async () => {
    if (!isSuperAdmin) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: 'Neplatný e-mail',
        description: 'Zadejte platnou e-mailovou adresu.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setInviting(true);
      const { data, error } = await supabase.functions.invoke('invite-subadmin', {
        body: { email },
      });

      if (error || !data?.success) {
        const code = (data as any)?.message || error?.message || '';
        const description =
          code === 'target_is_superadmin'
            ? 'Tento účet je superadmin a nelze ho takto měnit.'
            : 'Nepodařilo se odeslat pozvánku. Zkuste to prosím znovu.';
        toast({ title: 'Chyba', description, variant: 'destructive' });
        return;
      }

      setInviteEmail('');
      await fetchUsers();
      await fetchOverview();
      toast({
        title: 'Pozvánka odeslána',
        description:
          (data as any)?.invite_link_pending
            ? 'Subadmin byl vytvořen, ale e-mail s odkazem se nepodařilo odeslat. Zkuste pozvánku zopakovat.'
            : 'Subadminovi byl odeslán e-mail s odkazem pro nastavení hesla.',
      });
    } catch (err) {
      console.error('Error inviting subadmin:', err);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se odeslat pozvánku.',
        variant: 'destructive',
      });
    } finally {
      setInviting(false);
    }
  };

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

  // Account active = has signed in at least once (password set + login completed).
  const renderAccountBadge = (r: SubadminOverview) => {
    if (r.last_sign_in_at) {
      return (
        <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white border-transparent">
          <ShieldCheck className="h-3 w-3" /> Účet aktivní
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/50">
        Čeká na aktivaci
      </Badge>
    );
  };

  // Invite status from the latest email_queue row (never from auth.invited_at).
  const renderInviteBadge = (r: SubadminOverview) => {
    switch (r.latest_invite_status) {
      case 'sent':
        return (
          <Badge variant="outline" className="gap-1">
            <Mail className="h-3 w-3" /> Pozvánka odeslána
            {r.latest_invite_sent_at ? ` · ${relativeCzech(r.latest_invite_sent_at)}` : ''}
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Mail className="h-3 w-3" /> Pozvánka čeká
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="gap-1 text-destructive border-destructive/40">
            <Mail className="h-3 w-3" /> Pozvánka selhala
          </Badge>
        );
      default:
        return <span className="text-xs text-muted-foreground">—</span>;
    }
  };

  // Online now (presence window) or last-seen relative time.
  const renderPresence = (r: SubadminOverview) => {
    if (onlineIds.has(r.user_id)) {
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Online teď
        </span>
      );
    }
    return (
      <span className="text-sm text-muted-foreground">
        {r.last_seen_at ? `Naposledy online ${relativeCzech(r.last_seen_at)}` : '—'}
      </span>
    );
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
            U vašeho vlastního účtu se e-mail bere z přihlášení, pokud chybí v profilu.
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
                  <TableHead>Účet</TableHead>
                  <TableHead>Pozvánka</TableHead>
                  <TableHead>Aktivita</TableHead>
                  <TableHead className="text-right">Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-medium">{overviewName(r)}</TableCell>
                    <TableCell>{renderRoleBadge(r.role)}</TableCell>
                    <TableCell>{renderAccountBadge(r)}</TableCell>
                    <TableCell>{renderInviteBadge(r)}</TableCell>
                    <TableCell>{renderPresence(r)}</TableCell>
                    <TableCell className="text-right">
                      {r.role === 'superadmin' ? (
                        <span className="text-xs text-muted-foreground">Vlastník — nelze měnit</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          disabled={busyId === r.user_id}
                          onClick={() => demoteToUser({ id: r.user_id, role: r.role } as ManagedUser)}
                        >
                          <ShieldOff className="h-4 w-4" /> Odebrat admin práva
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {overview.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
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
                      {displayName(u, user?.email ?? null, user?.id ?? null)}
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

      <Card className="luxury-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Pozvat subadmina e-mailem
          </CardTitle>
          <CardDescription>
            Zadejte e-mail nového subadmina. Systém založí účet a pošle odkaz pro
            nastavení hesla — dotyčný se nemusí předem registrovat jako běžný uživatel.
            Pozvaný účet vždy dostane roli subadmin, nikdy superadmin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              inviteSubadmin();
            }}
          >
            <div className="relative max-w-md flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                className="pl-9"
                placeholder="email@firma.cz"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviting}
              />
            </div>
            <Button type="submit" className="gap-1" disabled={inviting}>
              <ShieldPlus className="h-4 w-4" /> Pozvat subadmina
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAdmins;
