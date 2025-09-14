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

    // Check if user is admin
    const { data: userData, error: userError } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userError || userData?.role !== 'admin') {
      throw new Error('Admin access required')
    }

    const { title, description, main_prize } = await req.json()

    if (!title || !main_prize) {
      throw new Error('Title and main prize are required')
    }

    // Create new contest
    const { data: contest, error: contestError } = await supabaseClient
      .from('contests')
      .insert({
        title,
        description: description || null,
        main_prize,
        status: 'draft',
        ticket_count: 1000000
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