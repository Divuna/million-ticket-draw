import { useQuery } from "@tanstack/react-query";
import { supabase, supabaseUrl } from "@/integrations/supabase/client";

const getStorageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${supabaseUrl}/storage/v1/object/public/contest-images/${path}`;
};

export interface HomepageWinner {
  id: string;
  user_name: string;
  user_nickname: string | null;
  prize_name: string;
  prize_image_url: string | null;
  contest_title: string;
  created_at: string;
  type: string;
  user_avatar_url: string | null;
}

export const useHomepageLatestWinners = (limit: number = 50) => {
  return useQuery({
    queryKey: ["homepage-latest-winners", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_latest_winners_homepage_public",
        { winners_limit: limit },
      );

      if (error) throw error;
      if (!data || data.length === 0) return [];

      return data.map((winner: {
        public_id: string;
        type: string;
        created_at: string;
        user_name: string;
        user_nickname: string | null;
        prize_name: string;
        prize_image_url: string | null;
        contest_title: string;
        user_avatar_url: string | null;
      }): HomepageWinner => ({
        id: winner.public_id,
        user_name: winner.user_name,
        user_nickname: winner.user_nickname,
        prize_name: winner.prize_name,
        prize_image_url: getStorageUrl(winner.prize_image_url),
        contest_title: winner.contest_title,
        created_at: winner.created_at,
        type: winner.type,
        user_avatar_url: winner.user_avatar_url,
      }));
    },
  });
};
