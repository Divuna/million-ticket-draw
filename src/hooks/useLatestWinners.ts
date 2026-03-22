import { useQuery } from "@tanstack/react-query";
import { supabase, supabaseUrl } from "@/integrations/supabase/client";

const getStorageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${supabaseUrl}/storage/v1/object/public/contest-images/${path}`;
};

export interface Winner {
  id: string;
  user_id: string;
  user_name: string;
  user_nickname: string | null;
  prize_name: string;
  prize_image_url: string | null;
  contest_title: string;
  created_at: string;
  type: string;
  user_avatar_url: string | null;
  ticket_number: number | null;
}

export const useLatestWinners = (limit: number = 50) => {
  return useQuery({
    queryKey: ["latest-winners", limit],
    queryFn: async () => {
      // Use SECURITY DEFINER function that bypasses RLS
      // Returns consistent data for all users (logged in, logged out, admin)
      const { data, error } = await supabase.rpc("get_latest_winners", {
        winners_limit: limit,
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        return [];
      }

      // Map the result to the Winner interface with proper image URLs
      const result: Winner[] = data.map((winner: {
        id: string;
        user_id: string;
        contest_id: string;
        prize_id: string | null;
        type: string;
        created_at: string;
        user_name: string;
        user_nickname: string | null;
        prize_name: string;
        prize_image_url: string | null;
        contest_title: string;
        user_avatar_url: string | null;
        ticket_number: number | null;
      }) => ({
        id: winner.id,
        user_id: winner.user_id,
        user_name: winner.user_name,
        user_nickname: winner.user_nickname,
        prize_name: winner.prize_name,
        prize_image_url: getStorageUrl(winner.prize_image_url),
        contest_title: winner.contest_title,
        created_at: winner.created_at,
        type: winner.type,
        user_avatar_url: winner.user_avatar_url,
        ticket_number: winner.ticket_number ?? null,
      }));

      return result;
    },
  });
};
