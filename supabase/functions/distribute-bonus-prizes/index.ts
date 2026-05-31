import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonFailure(
  step: string,
  message: string,
  details: unknown,
  received_rows_count: number,
  elapsedMs: number,
  warnings: string[] | undefined,
  status = 400,
) {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      step,
      message,
      details: details ?? null,
      received_rows_count,
      elapsed_ms: elapsedMs,
      warnings: warnings && warnings.length > 0 ? warnings : undefined,
    }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
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
  explicit_bonuses?: Array<{
    ticket_position: number
    amount: number
  }>
}

type BonusInsertRow = {
  contest_id: string
  title: string
  description: string
  ticket_position: number
  status: 'pending'
  amount: number
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
    const remainingCount = count - positions.length
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

// Process bonus prizes in batches with retry logic
async function processBonusBatchWithRetry(
  supabaseService: any,
  contestId: string,
  bonusesToInsert: BonusInsertRow[],
  batchNumber: number,
  maxRetries: number = 3
): Promise<any[]> {
  const first10Rows = bonusesToInsert.slice(0, 10).map((r) => ({
    ticket_position: r.ticket_position,
    amount: r.amount,
  }))
  console.log('[distribute-bonus-prizes] before insert', {
    contest_id: contestId,
    rows_length: bonusesToInsert.length,
    first_10_rows: first10Rows,
  })

  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data: insertedBonuses, error: insertError } = await supabaseService
        .from('bonus_prizes')
        .insert(bonusesToInsert)
        .select('id')

      if (insertError) {
        const pgErr = {
          message: insertError.message,
          details: insertError.details ?? null,
          hint: insertError.hint ?? null,
          code: insertError.code ?? null,
        }
        console.error('[distribute-bonus-prizes] bonus_prizes insert error', pgErr)
        const err = new Error(insertError.message) as Error & { pg?: typeof pgErr }
        err.pg = pgErr
        throw err
      }

      return insertedBonuses || []
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')
      console.warn(`Batch ${batchNumber} attempt ${attempt}/${maxRetries} failed: ${lastError.message}`)
      
      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        const delay = 500 * Math.pow(2, attempt - 1)
        console.log(`Retrying batch ${batchNumber} in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  const err = new Error(
    `Failed to insert batch ${batchNumber} after ${maxRetries} attempts: ${lastError?.message}`,
  ) as Error & {
    pg?: { message: string; details: string | null; hint: string | null; code: string | null }
  }
  if (lastError && 'pg' in lastError && (lastError as Error & { pg?: unknown }).pg) {
    err.pg = (lastError as Error & { pg: typeof err.pg }).pg
  }
  throw err
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()
  let warnings: string[] = []

  try {
    // Service-role client: used for DB writes to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // User-scoped client: used only for auth context (no writes)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: req.headers.get('Authorization') ?? ''
          }
        }
      }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonFailure(
        'auth_header',
        'Missing Authorization header',
        null,
        0,
        Date.now() - startTime,
        undefined,
      )
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)

    if (!user) {
      return jsonFailure('auth_user', 'Unauthorized', null, 0, Date.now() - startTime, undefined)
    }

    // Check if user is admin via user_roles (canonical role source)
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (roleError || !roleData || !['admin', 'superadmin'].includes(roleData.role)) {
      return jsonFailure(
        'admin_role',
        'Admin access required',
        { roleError: roleError?.message ?? null, role: roleData?.role ?? null },
        0,
        Date.now() - startTime,
        undefined,
      )
    }

    let request: DistributeBonusRequest
    try {
      request = await req.json()
    } catch (parseErr) {
      return jsonFailure(
        'parse_request',
        'Invalid JSON body',
        parseErr instanceof Error ? parseErr.message : String(parseErr),
        0,
        Date.now() - startTime,
        undefined,
      )
    }
    const { 
      contest_id, 
      bonus_type, 
      total_value, 
      amount_per_unit, 
      distribution_rule, 
      batch_size = 500, // Reduced from 3000 to prevent timeouts
      step_min = 3, 
      step_max = 5,
      explicit_bonuses = [],
    } = request

    const hasExplicitBonuses = Array.isArray(explicit_bonuses) && explicit_bonuses.length > 0

    if (!contest_id || !bonus_type || (!hasExplicitBonuses && (!total_value || !amount_per_unit || !distribution_rule))) {
      return jsonFailure(
        'validate_request',
        'All required fields must be provided',
        { contest_id, bonus_type, total_value, amount_per_unit, distribution_rule, hasExplicitBonuses },
        0,
        Date.now() - startTime,
        undefined,
      )
    }

    // Limit batch size to prevent timeouts
    const effectiveBatchSize = Math.min(batch_size, 500)
    
    if (effectiveBatchSize !== batch_size) {
      console.log(`Batch size reduced from ${batch_size} to ${effectiveBatchSize} to prevent timeouts`)
    }

    const { data: contest, error: contestError } = await supabaseAdmin
      .from('contests')
      .select('id, ticket_count, title')
      .eq('id', contest_id)
      .single()

    if (contestError || !contest) {
      return jsonFailure(
        'fetch_contest',
        'Contest not found',
        contestError
          ? { message: contestError.message, details: contestError.details, code: contestError.code }
          : { contest_id },
        0,
        Date.now() - startTime,
        undefined,
      )
    }

    const { data: existingBonuses } = await supabaseAdmin
      .from('bonus_prizes')
      .select('ticket_position')
      .eq('contest_id', contest_id)

    const existingPositions = new Set(existingBonuses?.map((b: any) => b.ticket_position) || [])
    const availablePositions = contest.ticket_count - existingPositions.size

    let totalRequested = 0
    let allRowsToInsert: BonusInsertRow[] = []

    if (hasExplicitBonuses) {
      const seenPositions = new Set<number>()

      for (const bonus of explicit_bonuses) {
        if (!Number.isInteger(bonus?.ticket_position)) {
          return jsonFailure(
            'validate_explicit_bonuses',
            'Každý explicitní bonus musí mít celočíselnou ticket_position.',
            bonus,
            explicit_bonuses.length,
            Date.now() - startTime,
            warnings.length > 0 ? warnings : undefined,
          )
        }

        if (!Number.isFinite(bonus?.amount) || bonus.amount <= 0) {
          return jsonFailure(
            'validate_explicit_bonuses',
            'Každý explicitní bonus musí mít amount větší než 0.',
            bonus,
            explicit_bonuses.length,
            Date.now() - startTime,
            warnings.length > 0 ? warnings : undefined,
          )
        }

        if (bonus.ticket_position < 1 || bonus.ticket_position > contest.ticket_count) {
          return jsonFailure(
            'validate_explicit_bonuses',
            `Pozice ${bonus.ticket_position} je mimo rozsah 1 až ${contest.ticket_count}.`,
            bonus,
            explicit_bonuses.length,
            Date.now() - startTime,
            warnings.length > 0 ? warnings : undefined,
          )
        }

        if (seenPositions.has(bonus.ticket_position)) {
          return jsonFailure(
            'validate_explicit_bonuses',
            `Duplicitní explicitní pozice ${bonus.ticket_position}.`,
            bonus,
            explicit_bonuses.length,
            Date.now() - startTime,
            warnings.length > 0 ? warnings : undefined,
          )
        }

        if (existingPositions.has(bonus.ticket_position)) {
          return jsonFailure(
            'validate_explicit_bonuses',
            `Pozice ${bonus.ticket_position} je už obsazena jinou výhrou.`,
            bonus,
            explicit_bonuses.length,
            Date.now() - startTime,
            warnings.length > 0 ? warnings : undefined,
          )
        }

        seenPositions.add(bonus.ticket_position)
      }

      allRowsToInsert = explicit_bonuses.map((bonus) => ({
        contest_id,
        title: bonus_type,
        description: `${bonus.amount} MioCoinů`,
        ticket_position: bonus.ticket_position,
        status: 'pending',
        amount: bonus.amount,
      }))
      totalRequested = allRowsToInsert.length
      console.log(`Processing ${totalRequested} explicit bonuses for contest ${contest_id}`)
    } else {
      const maxBonuses = Math.floor(total_value / amount_per_unit)
      const numberOfBonuses = Math.min(maxBonuses, availablePositions)

      if (numberOfBonuses === 0) {
        return jsonFailure(
          'capacity',
          'No bonuses can be created. Contest may be full or insufficient budget.',
          {
            maxBonuses,
            availablePositions,
            contest_ticket_count: contest.ticket_count,
            existing_positions_count: existingPositions.size,
          },
          0,
          Date.now() - startTime,
          undefined,
        )
      }

      if (numberOfBonuses < maxBonuses) {
        warnings.push(`Reduced from ${maxBonuses} to ${numberOfBonuses} bonuses due to insufficient available positions`)
      }

      console.log(`Processing ${numberOfBonuses} bonuses for contest ${contest_id} using ${distribution_rule} distribution`)

      let allPositions: number[] = []

      try {
        if (distribution_rule === 'random') {
          allPositions = generateRandomPositions(numberOfBonuses, contest.ticket_count, existingPositions)
        } else {
          allPositions = generateStepPositions(numberOfBonuses, contest.ticket_count, existingPositions, step_min, step_max)
        }
      } catch (genErr) {
        return jsonFailure(
          'generate_positions',
          genErr instanceof Error ? genErr.message : 'Position generation failed',
          genErr instanceof Error ? { name: genErr.name, stack: genErr.stack } : String(genErr),
          0,
          Date.now() - startTime,
          warnings.length > 0 ? warnings : undefined,
        )
      }

      if (allPositions.length < numberOfBonuses) {
        warnings.push(`Could only generate ${allPositions.length} positions out of ${numberOfBonuses} requested`)
      }

      allRowsToInsert = allPositions.map((position) => ({
        contest_id,
        title: bonus_type,
        description: `${bonus_type} - ${amount_per_unit}${bonus_type === 'MioCoin' ? ' MioCoins' : ' ks'}`,
        ticket_position: position,
        status: 'pending',
        amount: bonus_type === 'MioCoin' ? amount_per_unit : 1,
      }))
      totalRequested = numberOfBonuses
    }

    const totalBatches = Math.ceil(allRowsToInsert.length / effectiveBatchSize)
    let totalCreated = 0
    let successfulBatches = 0
    let failedBatches = 0
    let lastBatchFailure: {
      batch: number
      message: string
      postgres: { message: string; details: string | null; hint: string | null; code: string | null } | null
    } | null = null

    console.log(`Processing ${allRowsToInsert.length} positions in ${totalBatches} batches of size ${effectiveBatchSize}`)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * effectiveBatchSize
      const endIdx = Math.min(startIdx + effectiveBatchSize, allRowsToInsert.length)
      const batchRows = allRowsToInsert.slice(startIdx, endIdx)
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} with ${batchRows.length} positions`)

      try {
        const batchBonuses = await processBonusBatchWithRetry(
          supabaseAdmin,
          contest_id,
          batchRows,
          batchIndex + 1,
          3 // Max retries
        )

        totalCreated += batchBonuses.length
        successfulBatches++

        // Small delay between batches to avoid overwhelming the database
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }

      } catch (error) {
        console.error(`Error processing batch ${batchIndex + 1}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        const pg = (error as Error & {
          pg?: { message: string; details: string | null; hint: string | null; code: string | null }
        }).pg
        lastBatchFailure = {
          batch: batchIndex + 1,
          message: errorMessage,
          postgres: pg ?? null,
        }
        if (pg) {
          console.error('[distribute-bonus-prizes] batch failure postgres', pg)
        }
        warnings.push(`Failed batch ${batchIndex + 1}: ${errorMessage}`)
        failedBatches++
        // Continue with next batch instead of failing completely
      }
    }

    if (hasExplicitBonuses && failedBatches > 0) {
      const { error: cleanupError } = await supabaseAdmin
        .from('bonus_prizes')
        .delete()
        .eq('contest_id', contest_id)
        .gt('amount', 0)

      if (cleanupError) {
        console.error('Failed to clean up partial explicit MioCoin rows:', cleanupError)
        warnings.push(`Partial explicit MioCoin cleanup failed: ${cleanupError.message}`)
      }

      const { error: resetTotalError } = await supabaseAdmin
        .from('contests')
        .update({ total_miocoin_bonus: 0 })
        .eq('id', contest_id)

      if (resetTotalError) {
        console.error('Failed to reset total_miocoin_bonus after partial explicit failure:', resetTotalError)
        warnings.push(`Failed to reset total_miocoin_bonus: ${resetTotalError.message}`)
      }
    }

    // ── Sync contests.total_miocoin_bonus from real DB sum ───────────────────
    // Must run BEFORE non-critical external calls (Sofinity).
    // Query the DB as source of truth — do NOT rely on local request data.
    // If sync fails, return success=false so the caller knows the column is stale.
    if (bonus_type === 'MioCoin' && hasExplicitBonuses && failedBatches === 0) {
      // Fetch all bonus_prizes rows for this contest where amount > 0.
      // .limit(200_000) sets Range header to allow up to 200k rows — well above
      // any realistic contest size and avoids the default PostgREST 1 000-row cap.
      const { data: dbRows, error: dbSumError } = await supabaseAdmin
        .from('bonus_prizes')
        .select('amount')
        .eq('contest_id', contest_id)
        .gt('amount', 0)
        .limit(200000)

      if (dbSumError) {
        return jsonFailure(
          'sync_total_query',
          `Failed to query bonus_prizes for total_miocoin_bonus sync: ${dbSumError.message}`,
          dbSumError,
          totalCreated,
          Date.now() - startTime,
          warnings.length > 0 ? warnings : undefined,
        )
      }

      const realDbTotal = (dbRows ?? []).reduce(
        (s: number, r: { amount: number }) => s + (Number(r.amount) || 0),
        0,
      )

      const { error: syncTotalError } = await supabaseAdmin
        .from('contests')
        .update({ total_miocoin_bonus: realDbTotal })
        .eq('id', contest_id)

      if (syncTotalError) {
        return jsonFailure(
          'sync_total_update',
          `Failed to sync contests.total_miocoin_bonus: ${syncTotalError.message}`,
          syncTotalError,
          totalCreated,
          Date.now() - startTime,
          warnings.length > 0 ? warnings : undefined,
        )
      }

      console.log(
        `[distribute-bonus-prizes] synced total_miocoin_bonus = ${realDbTotal} for contest ${contest_id}`,
      )
    }

    // Send summary Sofinity event (non-critical — runs after DB sync)
    try {
      await supabaseAdmin.functions.invoke('send_event_to_sofinity', {
        body: {
          event_name: 'bonus_prizes_distribution_complete',
          user_id: user.id,
          contest_id: contest_id,
          metadata: {
            total_bonuses: totalCreated,
            total_batches: totalBatches,
            successful_batches: successfulBatches,
            failed_batches: failedBatches,
            bonus_type,
            amount_per_unit,
            distribution_rule
          }
        }
      })
    } catch (err) {
      console.error('Failed to send summary Sofinity event:', err)
    }

    const elapsedMs = Date.now() - startTime
    
    console.log(`Completed: ${totalCreated}/${allRowsToInsert.length} bonuses created in ${elapsedMs}ms (${successfulBatches} successful, ${failedBatches} failed batches)`)

    const samplePositions = allRowsToInsert
      .slice(0, Math.min(10, allRowsToInsert.length))
      .map((row) => row.ticket_position)

    if (hasExplicitBonuses && failedBatches > 0) {
      const msg = lastBatchFailure?.message ?? 'Explicit bonus batch insert failed'
      return new Response(
        JSON.stringify({
          success: false,
          error: msg,
          step: 'insert_explicit_bonus_prizes',
          message: msg,
          details: {
            contest_id,
            last_batch: lastBatchFailure?.batch ?? null,
            postgres: lastBatchFailure?.postgres ?? null,
            total_batches: totalBatches,
            failed_batches: failedBatches,
            positions_attempted: allRowsToInsert.length,
            cleaned_up_partial_rows: true,
          },
          received_rows_count: allRowsToInsert.length,
          created_bonuses: totalCreated,
          total_requested: totalRequested,
          positions_count: allRowsToInsert.length,
          sample_positions: samplePositions,
          batches_processed: totalBatches,
          successful_batches: successfulBatches,
          failed_batches: failedBatches,
          elapsed_ms: elapsedMs,
          warnings: warnings.length > 0 ? warnings : undefined,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    if (totalCreated === 0 && allRowsToInsert.length > 0) {
      const msg =
        lastBatchFailure?.message ??
        'All insert batches failed'
      return new Response(
        JSON.stringify({
          success: false,
          error: msg,
          step: 'insert_bonus_prizes',
          message: msg,
          details: {
            contest_id,
            last_batch: lastBatchFailure?.batch ?? null,
            postgres: lastBatchFailure?.postgres ?? null,
            total_batches: totalBatches,
            failed_batches: failedBatches,
            positions_attempted: allRowsToInsert.length,
          },
          received_rows_count: allRowsToInsert.length,
          created_bonuses: 0,
          total_requested: totalRequested,
          positions_count: allRowsToInsert.length,
          sample_positions: samplePositions,
          batches_processed: totalBatches,
          successful_batches: successfulBatches,
          failed_batches: failedBatches,
          elapsed_ms: elapsedMs,
          warnings: warnings.length > 0 ? warnings : undefined,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    return new Response(
      JSON.stringify({ 
        success: totalCreated > 0,
        created_bonuses: totalCreated,
        total_requested: totalRequested,
        positions_count: allRowsToInsert.length,
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
    const errObj = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : String(error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        step: 'unhandled',
        error: errorMessage,
        message: errorMessage,
        details: errObj,
        received_rows_count: 0,
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
