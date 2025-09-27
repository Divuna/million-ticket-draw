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
    const supabaseClient = createClient<Database>(
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

    const { contest_id, description, ticket_position } = await req.json()

    if (!contest_id || !description || !ticket_position) {
      throw new Error('All fields are required')
    }

    // Validate ticket position
    if (ticket_position < 1 || ticket_position >= 1000000) {
      throw new Error('Ticket position must be between 1 and 999,999')
    }

    // Check if ticket position already exists for this contest
    const { data: existing } = await supabaseClient
      .from('bonus_prizes')
      .select('id')
      .eq('contest_id', contest_id)
      .eq('ticket_position', ticket_position)
      .single()

    if (existing) {
      throw new Error('Bonus prize already exists for this ticket position')
    }

    // Create bonus prize
    const { data: bonusPrize, error: bonusError } = await supabaseClient
      .from('bonus_prizes')
      .insert({
        contest_id,
        description,
        ticket_position: parseInt(ticket_position),
        status: 'pending'
      })
      .select()
      .single()

    if (bonusError) {
      throw new Error('Failed to create bonus prize')
    }

    return new Response(
      JSON.stringify({ success: true, bonus_prize: bonusPrize }),
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