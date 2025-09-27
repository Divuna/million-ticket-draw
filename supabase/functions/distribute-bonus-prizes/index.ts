import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DistributeBonusRequest {
  contest_id: string
  bonus_type: 'MioCoin' | 'Physical Item'
  total_value: number
  amount_per_unit: number
  distribution_rule: 'random' | 'step_interval'
  batch_size?: number
  step_min?: number
  step_max?: number
}

// Efficient random position generator using Set for collision detection
function generateRandomPositions(count: number, maxPosition: number, excludeSet: Set<number>): number[] {
  const positions: number[] = []
  const selectedPositions = new Set<number>(excludeSet)
  
  // Calculate available positions
  const availableCount = maxPosition - excludeSet.size
  if (count > availableCount) {
    throw new Error(`Not enough available positions. Requested: ${count}, Available: ${availableCount}`)
  }
  
  // Use efficient random selection
  let attempts = 0
  const maxAttempts = count * 10 // Prevent infinite loops
  
  while (positions.length < count && attempts < maxAttempts) {
    const randomPos = Math.floor(Math.random() * maxPosition) + 1
    
    if (!selectedPositions.has(randomPos)) {
      positions.push(randomPos)
      selectedPositions.add(randomPos)
    }
    attempts++
  }
  
  if (positions.length < count) {
    console.warn(`Could only generate ${positions.length} positions out of ${count} requested`)
  }
  
  return positions.sort((a, b) => a - b)
}

// Step interval position generator with random fallback
function generateStepPositions(count: number, maxPosition: number, excludeSet: Set<number>, stepMin: number, stepMax: number): number[] {
  const positions: number[] = []
  const selectedPositions = new Set<number>(excludeSet)
  
  // Generate step-based positions
  const stepSize = Math.floor(Math.random() * (stepMax - stepMin + 1)) + stepMin
  let currentPos = stepSize
  
  while (positions.length < count && currentPos <= maxPosition) {
    if (!selectedPositions.has(currentPos)) {
      positions.push(currentPos)
      selectedPositions.add(currentPos)
    }
    currentPos += stepSize
  }
  
  // Fill remaining with random positions if needed
  if (positions.length < count) {
    const remainingCount = count - positions.length
    const availablePositions: number[] = []
    
    for (let i = 1; i <= maxPosition; i++) {
      if (!selectedPositions.has(i)) {
        availablePositions.push(i)
      }
    }
    
    // Shuffle and take what we need
    for (let i = availablePositions.length - 1; i > 0 && positions.length < count; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availablePositions[i], availablePositions[j]] = [availablePositions[j], availablePositions[i]]
      positions.push(availablePositions[i])
    }
  }
  
  return positions.sort((a, b) => a - b)
}

// Process bonus prizes in batches
async function processBonusBatch(
  supabaseClient: any,
  contestId: string,
  positions: number[],
  bonusType: string,
  amountPerUnit: number,
  batchNumber: number
) {
  const bonusesToInsert = positions.map(position => ({
    contest_id: contestId,
    description: `${bonusType} - ${amountPerUnit}${bonusType === 'MioCoin' ? ' MioCoins' : ' ks'}`,
    ticket_position: position,
    status: 'pending' as const,
    amount: bonusType === 'MioCoin' ? amountPerUnit : 1
  }))

  const { data: insertedBonuses, error: insertError } = await supabaseClient
    .from('bonus_prizes')
    .insert(bonusesToInsert)
    .select()

  if (insertError) {
    throw new Error(`Failed to insert batch ${batchNumber}: ${insertError.message}`)
  }

  return insertedBonuses || []
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()
  let warnings: string[] = []

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

    const request: DistributeBonusRequest = await req.json()
    const { 
      contest_id, 
      bonus_type, 
      total_value, 
      amount_per_unit, 
      distribution_rule, 
      batch_size = 3000,
      step_min = 3, 
      step_max = 5 
    } = request

    // Validate input
    if (!contest_id || !bonus_type || !total_value || !amount_per_unit || !distribution_rule) {
      throw new Error('All required fields must be provided')
    }

    if (batch_size <= 0 || batch_size > 10000) {
      throw new Error('Batch size must be between 1 and 10000')
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
    
    // Get existing bonus positions for this contest
    const { data: existingBonuses } = await supabaseClient
      .from('bonus_prizes')
      .select('ticket_position')
      .eq('contest_id', contest_id)

    const existingPositions = new Set(existingBonuses?.map(b => b.ticket_position) || [])
    const availablePositions = contest.ticket_count - existingPositions.size
    
    // Calculate actual number of bonuses we can create
    const numberOfBonuses = Math.min(maxBonuses, availablePositions)
    
    if (numberOfBonuses === 0) {
      throw new Error('No bonuses can be created. Contest may be full or insufficient budget.')
    }

    if (numberOfBonuses < maxBonuses) {
      warnings.push(`Reduced from ${maxBonuses} to ${numberOfBonuses} bonuses due to insufficient available positions`)
    }

    console.log(`Processing ${numberOfBonuses} bonuses for contest ${contest_id} using ${distribution_rule} distribution`)

    // Generate all positions at once using optimized algorithms
    let allPositions: number[] = []
    
    if (distribution_rule === 'random') {
      allPositions = generateRandomPositions(numberOfBonuses, contest.ticket_count, existingPositions)
    } else {
      allPositions = generateStepPositions(numberOfBonuses, contest.ticket_count, existingPositions, step_min, step_max)
    }

    if (allPositions.length < numberOfBonuses) {
      warnings.push(`Could only generate ${allPositions.length} positions out of ${numberOfBonuses} requested`)
    }

    // Process in batches
    const totalBatches = Math.ceil(allPositions.length / batch_size)
    let totalCreated = 0
    const allCreatedBonuses: any[] = []

    console.log(`Processing ${allPositions.length} positions in ${totalBatches} batches of size ${batch_size}`)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * batch_size
      const endIdx = Math.min(startIdx + batch_size, allPositions.length)
      const batchPositions = allPositions.slice(startIdx, endIdx)
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} with ${batchPositions.length} positions`)

      try {
        // Insert batch
        const batchBonuses = await processBonusBatch(
          supabaseClient,
          contest_id,
          batchPositions,
          bonus_type,
          amount_per_unit,
          batchIndex + 1
        )

        allCreatedBonuses.push(...batchBonuses)
        totalCreated += batchBonuses.length

        // Send aggregated Sofinity event for this batch
        try {
          const { error: sofinityError } = await supabaseClient.functions.invoke('send_event_to_sofinity', {
            body: {
              event_name: 'bonus_prizes_batch_added',
              user_id: user.id,
              contest_id: contest_id,
              metadata: {
                batch_number: batchIndex + 1,
                total_batches: totalBatches,
                batch_size: batchBonuses.length,
                positions_range: `${Math.min(...batchPositions)}-${Math.max(...batchPositions)}`,
                bonus_type,
                amount_per_unit,
                distribution_rule
              }
            }
          })
          
          if (sofinityError) {
            console.error(`Sofinity event error for batch ${batchIndex + 1}:`, sofinityError)
            warnings.push(`Failed to send Sofinity event for batch ${batchIndex + 1}`)
          }
        } catch (err) {
          console.error(`Failed to send Sofinity event for batch ${batchIndex + 1}:`, err)
          warnings.push(`Failed to send Sofinity event for batch ${batchIndex + 1}`)
        }

        // Small delay between batches to avoid overwhelming the system
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }

      } catch (error) {
        console.error(`Error processing batch ${batchIndex + 1}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        warnings.push(`Failed to process batch ${batchIndex + 1}: ${errorMessage}`)
        // Continue with next batch instead of failing completely
      }
    }

    const elapsedMs = Date.now() - startTime
    
    console.log(`Completed processing: ${totalCreated} bonuses created in ${elapsedMs}ms`)

    // Generate sample positions for response (max 10)
    const samplePositions = allPositions.slice(0, Math.min(10, allPositions.length))

    return new Response(
      JSON.stringify({ 
        success: true, 
        created_bonuses: totalCreated,
        total_requested: numberOfBonuses,
        positions_count: allPositions.length,
        sample_positions: samplePositions,
        batches_processed: totalBatches,
        elapsed_ms: elapsedMs,
        warnings: warnings.length > 0 ? warnings : undefined
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    const elapsedMs = Date.now() - startTime
    console.error('Error in distribute-bonus-prizes:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        elapsed_ms: elapsedMs,
        warnings: warnings.length > 0 ? warnings : undefined 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})