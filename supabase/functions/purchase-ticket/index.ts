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

    const { contest_id } = await req.json()

    // Start transaction-like operations
    // 1. Get current contest
    const { data: contest, error: contestError } = await supabaseClient
      .from('contests')
      .select('*')
      .eq('id', contest_id)
      .eq('status', 'active')
      .single()

    if (contestError || !contest) {
      throw new Error('Contest not found or not active')
    }

    // 2. Check user wallet
    const { data: wallet, error: walletError } = await supabaseClient
      .from('wallets')
      .select('balance_coins')
      .eq('user_id', user.id)
      .single()

    if (walletError || !wallet || wallet.balance_coins < 1) {
      throw new Error('Insufficient balance')
    }

    // 3. Get next ticket number
    const { data: ticketCount, error: ticketCountError } = await supabaseClient
      .from('tickets')
      .select('number')
      .eq('contest_id', contest_id)
      .order('number', { ascending: false })
      .limit(1)

    const nextTicketNumber = ticketCount && ticketCount.length > 0 ? 
      ticketCount[0].number + 1 : 1

    if (nextTicketNumber > contest.ticket_count) {
      throw new Error('Contest is full')
    }

    // 4. Deduct coin from wallet
    const { error: walletUpdateError } = await supabaseClient
      .from('wallets')
      .update({ balance_coins: wallet.balance_coins - 1 })
      .eq('user_id', user.id)

    if (walletUpdateError) {
      throw new Error('Failed to update wallet')
    }

    // 5. Create ticket
    const { data: newTicket, error: ticketError } = await supabaseClient
      .from('tickets')
      .insert({
        contest_id: contest_id,
        user_id: user.id,
        number: nextTicketNumber
      })
      .select()
      .single()

    if (ticketError) {
      // Rollback wallet update
      await supabaseClient
        .from('wallets')
        .update({ balance_coins: wallet.balance_coins })
        .eq('user_id', user.id)
      
      throw new Error('Failed to create ticket')
    }

    // 6. Check if this ticket won a bonus prize
    const { data: bonusPrize } = await supabaseClient
      .from('bonus_prizes')
      .select('*')
      .eq('contest_id', contest_id)
      .eq('ticket_position', nextTicketNumber)
      .single()

    if (bonusPrize) {
      // Create winner record
      await supabaseClient
        .from('winners')
        .insert({
          contest_id: contest_id,
          user_id: user.id,
          prize_id: bonusPrize.id,
          type: 'bonus',
          notes: `Bonus prize won with ticket #${nextTicketNumber}`
        })

      // Check if guardian notification is needed (physical prize, guardian required, user under 18)
      if (bonusPrize.guardian_required && (!bonusPrize.amount || bonusPrize.amount === 0)) {
        try {
          await supabaseClient.rpc('create_guardian_notification_if_needed', {
            p_prize_id: bonusPrize.id,
            p_user_id: user.id,
            p_contest_id: contest_id
          })
          console.log(`Guardian notification check completed for prize ${bonusPrize.id}`)
        } catch (guardianError) {
          console.error('Error creating guardian notification:', guardianError)
          // Don't fail the ticket purchase if notification fails
        }

        // Send system message to user about guardian requirement
        try {
          await supabaseClient.rpc('create_guardian_message_for_user', {
            p_user_id: user.id,
            p_contest_id: contest_id,
            p_prize_title: bonusPrize.title || bonusPrize.description
          })
          console.log(`Guardian message sent to user ${user.id} for prize ${bonusPrize.id}`)
        } catch (messageError) {
          console.error('Error creating guardian message for user:', messageError)
          // Don't fail the ticket purchase if message fails
        }
      }
    }

    // 7. Check if this is the main prize (last ticket)
    if (nextTicketNumber === contest.ticket_count) {
      // Create main prize winner record
      await supabaseClient
        .from('winners')
        .insert({
          contest_id: contest_id,
          user_id: user.id,
          type: 'main',
          notes: `Main prize won with ticket #${nextTicketNumber}`
        })

      // Close the contest
      await supabaseClient
        .from('contests')
        .update({ status: 'closed' })
        .eq('id', contest_id)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        ticket_number: nextTicketNumber,
        won_bonus: !!bonusPrize,
        won_main: nextTicketNumber === contest.ticket_count
      }),
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