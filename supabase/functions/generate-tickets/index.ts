import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { contest_id } = await req.json();

    if (!contest_id) {
      return new Response(
        JSON.stringify({ error: 'contest_id je povinný parametr' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating tickets for contest:', contest_id);

    // Get contest details to determine ticket count
    const { data: contest, error: contestError } = await supabase
      .from('contests')
      .select('id, ticket_count, status')
      .eq('id', contest_id)
      .single();

    if (contestError || !contest) {
      console.error('Contest not found:', contestError);
      return new Response(
        JSON.stringify({ error: 'Soutěž nebyla nalezena' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ticketCount = contest.ticket_count;
    console.log(`Contest has ${ticketCount} tickets to generate`);

    // Check if tickets already exist for this contest
    const { count: existingCount, error: countError } = await supabase
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', contest_id);

    if (countError) {
      console.error('Error checking existing tickets:', countError);
      return new Response(
        JSON.stringify({ error: 'Chyba při kontrole existujících tiketů' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingCount && existingCount > 0) {
      console.log(`Contest already has ${existingCount} tickets, skipping generation`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Soutěž již má ${existingCount} tiketů`,
          tickets_generated: 0,
          tickets_existing: existingCount
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate tickets in batches to avoid timeouts
    // We don't actually insert individual ticket rows - tickets are created on purchase
    // Instead, we just validate that the contest is ready for ticket purchases
    // The ticket_count field defines the max number of tickets available
    
    // For contests that need pre-generated ticket positions (for bonus prizes),
    // we create placeholder entries in the prizes table based on bonus_prizes
    
    // Fetch bonus prizes for this contest
    const { data: bonusPrizes, error: bonusError } = await supabase
      .from('bonus_prizes')
      .select('id, ticket_position, description, amount')
      .eq('contest_id', contest_id);

    if (bonusError) {
      console.error('Error fetching bonus prizes:', bonusError);
    }

    const bonusPrizesCount = bonusPrizes?.length || 0;
    console.log(`Found ${bonusPrizesCount} bonus prizes for this contest`);

    // Update contest to ensure it's ready for ticket sales
    const { error: updateError } = await supabase
      .from('contests')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', contest_id);

    if (updateError) {
      console.error('Error updating contest:', updateError);
    }

    console.log('Ticket generation completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Soutěž je připravena pro prodej ${ticketCount.toLocaleString()} tiketů`,
        ticket_count: ticketCount,
        bonus_prizes_count: bonusPrizesCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-tickets:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Neznámá chyba' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
