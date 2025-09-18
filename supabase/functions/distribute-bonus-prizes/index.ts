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
        Row: {
          id: string
          ticket_count: number
          title: string
        }
      }
      bonus_prizes: {
        Insert: {
          contest_id: string
          description: string
          ticket_position: number
          status?: string
          amount?: number
        }
        Row: {
          id: string
          contest_id: string
          ticket_position: number
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

interface DistributeBonusRequest {
  contest_id: string
  bonus_type: 'MioCoin' | 'Physical Item'
  total_value: number
  amount_per_unit: number
  distribution_rule: 'random' | 'step_interval'
  step_min?: number
  step_max?: number
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

    const request: DistributeBonusRequest = await req.json()
    const { contest_id, bonus_type, total_value, amount_per_unit, distribution_rule, step_min = 3, step_max = 5 } = request

    // Validate input
    if (!contest_id || !bonus_type || !total_value || !amount_per_unit || !distribution_rule) {
      throw new Error('All fields are required')
    }

    // Get contest details
    const { data: contest, error: contestError } = await supabaseClient
      .from('contests')
      .select('id, ticket_count, title')
      .eq('id', contest_id)
      .single()

    if (contestError || !contest) {
      throw new Error('Contest not found')
    }

    // Calculate number of bonuses to create
    const maxBonuses = Math.floor(total_value / amount_per_unit)
    const numberOfBonuses = Math.min(maxBonuses, contest.ticket_count)

    if (numberOfBonuses === 0) {
      throw new Error('No bonuses can be created with current parameters')
    }

    // Get existing bonus positions for this contest
    const { data: existingBonuses } = await supabaseClient
      .from('bonus_prizes')
      .select('ticket_position')
      .eq('contest_id', contest_id)

    const existingPositions = new Set(existingBonuses?.map(b => b.ticket_position) || [])

    // Generate positions based on distribution rule
    let positions: number[] = []
    
    if (distribution_rule === 'random') {
      const availablePositions = Array.from(
        { length: contest.ticket_count }, 
        (_, i) => i + 1
      ).filter(pos => !existingPositions.has(pos))

      // Shuffle and take first numberOfBonuses
      for (let i = availablePositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availablePositions[i], availablePositions[j]] = [availablePositions[j], availablePositions[i]];
      }
      
      positions = availablePositions.slice(0, numberOfBonuses)
    } else {
      // Step interval distribution
      const stepSize = Math.floor(Math.random() * (step_max - step_min + 1)) + step_min
      let currentPos = stepSize
      
      while (positions.length < numberOfBonuses && currentPos <= contest.ticket_count) {
        if (!existingPositions.has(currentPos)) {
          positions.push(currentPos)
        }
        currentPos += stepSize
      }
    }

    if (positions.length === 0) {
      throw new Error('No available positions for bonus distribution')
    }

    // Create bonus prizes
    const bonusesToInsert = positions.map(position => ({
      contest_id,
      description: `${bonus_type} - ${amount_per_unit}${bonus_type === 'MioCoin' ? ' MioCoins' : ' ks'}`,
      ticket_position: position,
      status: 'pending' as const,
      amount: bonus_type === 'MioCoin' ? amount_per_unit : 1
    }))

    const { data: insertedBonuses, error: insertError } = await supabaseClient
      .from('bonus_prizes')
      .insert(bonusesToInsert)
      .select()

    if (insertError) {
      console.error('Insert error:', insertError)
      throw new Error(`Failed to create bonus prizes: ${insertError.message}`)
    }

    // Send Sofinity events for each created bonus
    const sofinityPromises = (insertedBonuses || []).map(async (bonus) => {
      try {
        const { error: sofinityError } = await supabaseClient.functions.invoke('send_event_to_sofinity', {
          body: {
            event_name: 'bonus_prize_added',
            user_id: user.id,
            contest_id: contest_id,
            metadata: {
              bonus_id: bonus.id,
              ticket_position: bonus.ticket_position,
              description: bonus.description,
              amount: bonus.amount
            }
          }
        })
        
        if (sofinityError) {
          console.error('Sofinity event error for bonus', bonus.id, ':', sofinityError)
        }
      } catch (err) {
        console.error('Failed to send Sofinity event for bonus', bonus.id, ':', err)
      }
    })

    // Wait for all Sofinity events (but don't fail if they fail)
    await Promise.allSettled(sofinityPromises)

    return new Response(
      JSON.stringify({ 
        success: true, 
        created_bonuses: insertedBonuses?.length || 0,
        total_requested: numberOfBonuses,
        positions: positions
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in distribute-bonus-prizes:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})