import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { OneMilTicketIcon } from '@/components/icons/OneMilIcons';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import avatarSearch from '@/assets/redesign/avatar/avatar-lupa.png';

interface UserTicket {
  id: string;
  created_at: string;
  contest_id: string;
  contest_title: string;
  contest_image: string | null;
}

/** Jedna soutěž v přehledu „Moje hry“ – tikety seskupené podle soutěže, bez čísel tiketů. */
interface ContestGroup {
  contest_id: string;
  contest_title: string;
  contest_image: string | null;
  count: number;
  last_at: string;
}

/** Relativní cesta obrázku soutěže → veřejná URL (stejně jako detail soutěže). */
const resolveContestImage = (path?: string | null, bucket = 'contest-images'): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
};

/** 1 tiket, 2–4 tikety, 5+ tiketů. */
const ticketsLabel = (n: number) => {
  if (n === 1) return '1 tiket';
  if (n >= 2 && n <= 4) return `${n} tikety`;
  return `${n.toLocaleString('cs-CZ')} tiketů`;
};

const MyContests: React.FC = () => {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<UserTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchMyTickets();
    }
  }, [user]);

  const fetchMyTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          created_at,
          contest_id,
          contests!inner (
            title,
            main_prize_secondary_image,
            main_image,
            banner_image
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching tickets:', error);
        return;
      }

      const userTickets: UserTicket[] = (data ?? []).map((row: any) => {
        const contest = Array.isArray(row.contests) ? row.contests[0] : row.contests;
        return {
          id: row.id,
          created_at: row.created_at,
          contest_id: row.contest_id,
          contest_title: contest?.title ?? '',
          contest_image:
            resolveContestImage(contest?.main_prize_secondary_image) ||
            resolveContestImage(contest?.main_image) ||
            resolveContestImage(contest?.banner_image, 'contest-banners'),
        };
      });

      setTickets(userTickets);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Seskupení podle soutěže; pořadí podle posledního nákupu (tikety už přicházejí od nejnovějšího).
  const groups = useMemo<ContestGroup[]>(() => {
    const map = new Map<string, ContestGroup>();
    for (const t of tickets) {
      const g = map.get(t.contest_id);
      if (g) {
        g.count += 1;
      } else {
        map.set(t.contest_id, {
          contest_id: t.contest_id,
          contest_title: t.contest_title,
          contest_image: t.contest_image,
          count: 1,
          last_at: t.created_at,
        });
      }
    }
    return [...map.values()];
  }, [tickets]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });

  if (!session) {
    return <NavigateToLogin />;
  }

  return (
    <div className="games-light-page min-h-screen bg-background pb-20">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Záhlaví (deska Moje hry) */}
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <h1 className="om-mg-title">Moje hry</h1>
              <p className="text-[13px] leading-normal text-[#5E5B57]">Přehled tvých tiketů a soutěží</p>
            </div>
            <img
              src={avatarSearch}
              alt=""
              aria-hidden="true"
              className="om-float h-24 w-auto shrink-0 object-contain -mb-1.5"
              style={{ filter: 'drop-shadow(0 10px 14px rgba(60,40,10,0.3))' }}
            />
          </div>

          {loading ? (
            <p className="py-12 text-center text-[#5E5B57]">Načítám tvoje hry…</p>
          ) : groups.length === 0 ? (
            <div className="om-mg-card flex flex-col items-center gap-3 py-12 text-center">
              <OneMilTicketIcon size={56} className="h-14 w-14 text-[#E9B949]" />
              <p className="text-[#C9CDD4]">Zatím nemáš žádné tikety.</p>
              <button type="button" className="om-mg-cta" onClick={() => navigate('/games')}>
                Prohlédnout soutěže
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <button
                  key={g.contest_id}
                  type="button"
                  className="om-mg-card flex w-full items-center gap-3 p-3 text-left"
                  onClick={() => navigate(`/contest/${g.contest_id}`)}
                >
                  <span className="om-mg-thumb">
                    {g.contest_image ? (
                      <img
                        src={g.contest_image}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <OneMilTicketIcon size={28} className="h-7 w-7 text-[#E9B949]" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <strong className="om-mg-name">{g.contest_title}</strong>
                    <span className="text-[12.5px] font-extrabold text-[#F2C55C]">Máš tu {ticketsLabel(g.count)}</span>
                    <span className="text-[11.5px] text-[#A9AAB3]">Naposledy {formatDate(g.last_at)}</span>
                  </span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#E9B949"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyContests;
