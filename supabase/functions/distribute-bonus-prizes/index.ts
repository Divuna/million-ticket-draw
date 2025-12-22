import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  
  const availableCount = maxPosition - excludeSet.size
  if (count > availableCount) {
    throw new Error(`Not enough available positions. Requested: ${count}, Available: ${availableCount}`)
  }
  
  let attempts = 0
  const maxAttempts = count * 10
  
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
  
  const stepSize = Math.floor(Math.random() * (stepMax - stepMin + 1)) + stepMin
  let currentPos = stepSize
  
  while (positions.length < count && currentPos <= maxPosition) {
    if (!selectedPositions.has(currentPos)) {
      positions.push(currentPos)
      selectedPositions.add(currentPos)
    }
    currentPos += stepSize
  }
  
  if (positions.length < count) {
    const availablePositions: number[] = []
    
    for (let i = 1; i <= maxPosition; i++) {
      if (!selectedPositions.has(i)) {
        availablePositions.push(i)
      }
    }
    
    for (let i = availablePositions.length - 1; i > 0 && positions.length < count; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availablePositions[i], availablePositions[j]] = [availablePositions[j], availablePositions[i]]
      positions.push(availablePositions[i])
    }
  }
  
  return positions.sort((a, b) => a - b)
}

// Process bonus prizes in smaller batches with retry logic using SERVICE ROLE (faster, no RLS)
async function processBonusBatchWithRetry(
  supabaseAdmin: any,
  contestId: string,
  positions: number[],
  bonusType: string,
  amountPerUnit: number,
  batchNumber: number,
  maxRetries: number = 3
): Promise<number> {
  const bonusesToInsert = positions.map(position => ({
    contest_id: contestId,
    description: `${amountPerUnit} MioCoinů`,
    ticket_position: position,
    status: 'pending',
    amount: bonusType === 'MioCoin' ? amountPerUnit : 1
  }))

  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use service role client for faster inserts (bypasses RLS)
      const { error: insertError } = await supabaseAdmin
        .from('bonus_prizes')
        .insert(bonusesToInsert)

      if (insertError) {
        throw new Error(insertError.message)
      }

      return positions.length
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')
      console.warn(`Batch ${batchNumber} attempt ${attempt}/${maxRetries} failed: ${lastError.message}`)
      
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, attempt - 1)
        console.log(`Retrying batch ${batchNumber} in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw new Error(`Failed to insert batch ${batchNumber} after ${maxRetries} attempts: ${lastError?.message}`)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()
  let warnings: string[] = []

  try {
    // Service role client for all operations (faster, bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)

    if (!user) {
      throw new Error('Unauthorized')
    }

    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (userError || !userData || (userData.role !== 'admin' && userData.role !== 'superadmin')) {
      throw new Error('Admin access required')
    }

    const request: DistributeBonusRequest = await req.json()
    const { 
      contest_id, 
      bonus_type, 
      total_value, 
      amount_per_unit, 
      distribution_rule, 
      batch_size = 100, // Reduced to 100 to prevent timeouts
      step_min = 3, 
      step_max = 5 
    } = request

    if (!contest_id || !bonus_type || !total_value || !amount_per_unit || !distribution_rule) {
      throw new Error('All required fields must be provided')
    }

    // Hard limit batch size to 100 to prevent statement timeouts
    const effectiveBatchSize = Math.min(batch_size, 100)
    
    console.log(`Using batch size: ${effectiveBatchSize}`)

    const { data: contest, error: contestError } = await supabaseAdmin
      .from('contests')
      .select('id, ticket_count, title')
      .eq('id', contest_id)
      .single()

    if (contestError || !contest) {
      throw new Error('Contest not found')
    }

    const maxBonuses = Math.floor(total_value / amount_per_unit)
    
    const { data: existingBonuses } = await supabaseAdmin
      .from('bonus_prizes')
      .select('ticket_position')
      .eq('contest_id', contest_id)

    const existingPositions = new Set(existingBonuses?.map((b: any) => b.ticket_position) || [])
    const availablePositions = contest.ticket_count - existingPositions.size
    
    const numberOfBonuses = Math.min(maxBonuses, availablePositions)
    
    if (numberOfBonuses === 0) {
      throw new Error('No bonuses can be created. Contest may be full or insufficient budget.')
    }

    if (numberOfBonuses < maxBonuses) {
      warnings.push(`Reduced from ${maxBonuses} to ${numberOfBonuses} bonuses due to insufficient available positions`)
    }

    console.log(`Generating ${numberOfBonuses} positions for contest ${contest_id}...`)

    let allPositions: number[] = []
    
    if (distribution_rule === 'random') {
      allPositions = generateRandomPositions(numberOfBonuses, contest.ticket_count, existingPositions)
    } else {
      allPositions = generateStepPositions(numberOfBonuses, contest.ticket_count, existingPositions, step_min, step_max)
    }

    if (allPositions.length < numberOfBonuses) {
      warnings.push(`Could only generate ${allPositions.length} positions out of ${numberOfBonuses} requested`)
    }

    const totalBatches = Math.ceil(allPositions.length / effectiveBatchSize)
    let totalCreated = 0
    let successfulBatches = 0
    let failedBatches = 0

    console.log(`Inserting ${allPositions.length} bonuses in ${totalBatches} batches of ${effectiveBatchSize}`)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * effectiveBatchSize
      const endIdx = Math.min(startIdx + effectiveBatchSize, allPositions.length)
      const batchPositions = allPositions.slice(startIdx, endIdx)
      
      // Log progress every 50 batches
      if (batchIndex % 50 === 0 || batchIndex === totalBatches - 1) {
        console.log(`Batch ${batchIndex + 1}/${totalBatches} (${Math.round((batchIndex / totalBatches) * 100)}%)`)
      }

      try {
        const insertedCount = await processBonusBatchWithRetry(
          supabaseAdmin,
          contest_id,
          batchPositions,
          bonus_type,
          amount_per_unit,
          batchIndex + 1,
          3
        )

        totalCreated += insertedCount
        successfulBatches++

        // Small delay between batches to avoid overwhelming the database
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }

      } catch (error) {
        console.error(`Batch ${batchIndex + 1} failed:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        warnings.push(`Failed batch ${batchIndex + 1}: ${errorMessage}`)
        failedBatches++
      }
    }

    // Update contest total_miocoin_bonus
    if (bonus_type === 'MioCoin' && totalCreated > 0) {
      const totalMioCoins = totalCreated * amount_per_unit
      console.log(`Updating contest total_miocoin_bonus to ${totalMioCoins}`)
      
      await supabaseAdmin
        .from('contests')
        .update({ total_miocoin_bonus: totalMioCoins })
        .eq('id', contest_id)
    }

    const elapsedMs = Date.now() - startTime
    
    console.log(`Complete: ${totalCreated}/${allPositions.length} bonuses in ${elapsedMs}ms (${successfulBatches} OK, ${failedBatches} failed)`)

    const samplePositions = allPositions.slice(0, Math.min(10, allPositions.length))

    return new Response(
      JSON.stringify({ 
        success: totalCreated > 0,
        created_bonuses: totalCreated,
        total_requested: numberOfBonuses,
        positions_count: allPositions.length,
        sample_positions: samplePositions,
        batches_processed: totalBatches,
        successful_batches: successfulBatches,
        failed_batches: failedBatches,
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
        success: false,
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
