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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Get user from JWT
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)

    if (!user) {
      throw new Error('Unauthorized')
    }

    // Check if user is admin via user_roles (canonical role source)
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (roleError || !roleData || !['admin', 'superadmin'].includes(roleData.role)) {
      throw new Error('Admin access required')
    }

    const { contest_id } = await req.json()

    if (!contest_id) {
      throw new Error('Contest ID is required')
    }

    // Get contest details using admin client
    const { data: contest, error: contestError } = await supabaseAdmin
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

    // Unified logic: use DB close_contest (random draw among sold tickets)
    const { error: closeError } = await supabaseAdmin.rpc('close_contest', {
      p_contest_id: contest_id,
    })

    if (closeError) {
      throw new Error(`Failed to close contest: ${closeError.message}`)
    }

    // Fetch the main winner for the response (inserted by close_contest)
    const { data: mainWinner } = await supabaseAdmin
      .from('winners')
      .select('user_id, ticket_id, notes')
      .eq('contest_id', contest_id)
      .eq('type', 'main')
      .maybeSingle()

    const winnerTicket = mainWinner?.ticket_id
      ? (await supabaseAdmin.from('tickets').select('number').eq('id', mainWinner.ticket_id).maybeSingle()).data?.number ?? null
      : null

    return new Response(
      JSON.stringify({
        success: true,
        winner_ticket: winnerTicket ?? null,
        winner_user: mainWinner?.user_id ?? null,
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