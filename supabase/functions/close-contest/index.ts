import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Get user from JWT
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseClient.auth.getUser(token)

    if (!user) {
      throw new Error('Unauthorized')
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (userError || !userData || userData.role !== 'admin') {
      throw new Error('Admin access required')
    }

    const { contest_id } = await req.json()

    if (!contest_id) {
      throw new Error('Contest ID is required')
    }

    // Get contest details
    const { data: contest, error: contestError } = await supabaseClient
      .from('contests')
      .select('*')
      .eq('id', contest_id)
      .single()

    if (contestError || !contest) {
      throw new Error('Contest not found')
    }

    if (contest.status === 'closed') {
      throw new Error('Contest is already closed')
    }

    // Get the highest ticket number sold
    const { data: highestTicket } = await supabaseClient
      .from('tickets')
      .select('number, user_id')
      .eq('contest_id', contest_id)
      .order('number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!highestTicket) {
      throw new Error('No tickets sold for this contest')
    }

    // The highest ticket number wins the main prize
    const { error: winnerError } = await supabaseClient
      .from('winners')
      .insert({
        contest_id: contest_id,
        user_id: highestTicket.user_id,
        type: 'main',
        notes: `Main prize won with highest ticket #${highestTicket.number} when contest was manually closed`
      })

    if (winnerError) {
      console.error('Error creating winner:', winnerError)
      // Continue even if winner creation fails
    }

    // Close the contest
    const { error: closeError } = await supabaseClient
      .from('contests')
      .update({ status: 'closed' })
      .eq('id', contest_id)

    if (closeError) {
      throw new Error('Failed to close contest')
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        winner_ticket: highestTicket.number,
        winner_user: highestTicket.user_id 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})