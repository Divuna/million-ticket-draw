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

    // Check if user is admin (same logic as frontend useUserRole)
    const isAdmin = user.email === 'divispavel2@gmail.com';
    
    if (!isAdmin) {
      throw new Error('Admin access required')
    }

    const { title, description, main_prize, main_image, status, ticket_count, ticket_price, name } = await req.json()

    if (!title || !main_prize || !main_image) {
      throw new Error('Title, main prize and main image are required')
    }

    if (ticket_count && ticket_count < 1) {
      throw new Error('Ticket count must be at least 1')
    }

    if (ticket_price && ticket_price < 0) {
      throw new Error('Ticket price must be positive')
    }

    const validStatuses = ['draft', 'active', 'closed', 'pending']
    if (status && !validStatuses.includes(status)) {
      throw new Error('Invalid status')
    }

    // Create new contest
    const { data: contest, error: contestError } = await supabaseClient
      .from('contests')
      .insert({
        title,
        name: name || title,
        description: description || null,
        main_prize,
        main_image,
        status: status || 'draft',
        ticket_count: ticket_count || 1000000,
        ticket_price: ticket_price || 1
      })
      .select()
      .single()

    if (contestError) {
      console.error('Database error:', contestError)
      throw new Error(`Failed to create contest: ${contestError.message}`)
    }

    return new Response(
      JSON.stringify({ success: true, contest }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})