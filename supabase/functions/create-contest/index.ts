import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Database {
  public: {
    Tables: {
      contests: {
        Insert: {
          title: string
          description?: string | null
          main_prize: string
          main_image: string
          status?: string
          ticket_count?: number
        }
      }
      users: {
        Row: {
          id: string
          role: string
        }
      }
    }
  }
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

    // Check if user is admin (same logic as frontend useUserRole)
    const isAdmin = user.email === 'divispavel2@gmail.com';
    
    if (!isAdmin) {
      throw new Error('Admin access required')
    }

    const { title, description, main_prize, main_image, status, ticket_count } = await req.json()

    if (!title || !main_prize || !main_image) {
      throw new Error('Title, main prize and main image are required')
    }

    if (ticket_count && ticket_count < 1) {
      throw new Error('Ticket count must be at least 1')
    }

    const validStatuses = ['pending', 'won', 'delivered']
    if (status && !validStatuses.includes(status)) {
      throw new Error('Invalid status')
    }

    // Create new contest
    const { data: contest, error: contestError } = await supabaseClient
      .from('contests')
      .insert({
        title,
        description: description || null,
        main_prize,
        main_image,
        status: status || 'pending',
        ticket_count: ticket_count || 1000000
      })
      .select()
      .single()

    if (contestError) {
      throw new Error('Failed to create contest')
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
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})