# Stripe Webhook Idempotency Patch
**Status:** PLAN ONLY — not applied  
**File to change:** `supabase/functions/stripe-webhook/index.ts`

---

## Current Code (lines 74–108)

```typescript
// ❌ CURRENT — SELECT before INSERT (TOCTOU race)
const { data: existingPayment } = await supabaseClient
  .from('payments')
  .select('id')
  .eq('stripe_session_id', session.id)
  .maybeSingle()

if (existingPayment) {
  console.log(`Payment already processed for session ${session.id}`)
  return new Response(
    JSON.stringify({ received: true, message: 'Payment already processed' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  )
}

// Insert payment record
const { error: paymentError } = await supabaseClient
  .from('payments')
  .insert({
    user_id: userId,
    amount: coinsToCredit,
    method: 'stripe',
    status: 'completed',
    stripe_session_id: session.id
  })

if (paymentError) {
  console.error('Error inserting payment:', paymentError)
  throw new Error('Failed to record payment')
}
```

---

## Proposed Code

```typescript
// ✅ PROPOSED — atomic INSERT ON CONFLICT (UNIQUE on stripe_session_id)
const { error: paymentError, count } = await supabaseClient
  .from('payments')
  .insert({
    user_id:           userId,
    amount:            coinsToCredit,
    method:            'stripe',
    status:            'completed',
    stripe_session_id: session.id,
  }, { count: 'exact' })

if (paymentError) {
  // Error code 23505 = unique_violation — payment already recorded, safe to ack
  if (paymentError.code === '23505') {
    console.log(`Payment already recorded for session ${session.id} (idempotency guard)`)
    return new Response(
      JSON.stringify({ received: true, message: 'Payment already processed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
  console.error('Error inserting payment:', paymentError)
  throw new Error('Failed to record payment')
}

console.log(`Successfully recorded payment for user ${userId}, ${coinsToCredit} MioCoins`)
// The trg_update_wallet_after_payment trigger will now fire and:
//   - credit balance_coins (only, not balance_vouchers — fixed in wallet_hardening migration)
//   - write a wallet_transactions ledger entry
```

---

## Why This Is Safe

The `payments` table has `UNIQUE (stripe_session_id)` (constraint `payments_stripe_session_id_key`). PostgreSQL enforces this atomically. Two concurrent insert attempts for the same session ID cannot both succeed — the second will always fail with error code `23505`. By catching `23505` and returning HTTP 200, Stripe receives a success acknowledgement and stops retrying.

The wallet credit happens in the `update_wallet_after_payment` trigger, which only fires once (on the successful INSERT). The second concurrent INSERT never reaches the trigger.

---

## Deployment Note

This edge function change **must be deployed together with `20260315200000_wallet_hardening.sql`** which fixes the trigger to stop double-crediting `balance_vouchers`.
