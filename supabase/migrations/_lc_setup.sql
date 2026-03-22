-- Lifecycle test setup
-- Executed as part of full contest lifecycle test (not a permanent migration)

-- Fund wallets: 500 balance_coins + 10 balance_vouchers each
-- (balance_vouchers simulates a partner voucher credit the user will redeem)
UPDATE public.wallets
SET balance_coins    = 500,
    bonus_balance_coins = 0,
    balance_vouchers = 10
WHERE user_id = ANY(ARRAY[
  '__U1__'::uuid,
  '__U2__'::uuid,
  '__U3__'::uuid
]);

-- Write ledger entries for the wallet credits (simulating Stripe top-up)
INSERT INTO public.wallet_transactions (user_id, wallet_id, amount, balance_after, type, source, metadata)
SELECT
  w.user_id,
  w.id,
  500,
  500,
  'payment',
  'stripe_simulation',
  '{"note":"lifecycle_test_topup"}'::jsonb
FROM public.wallets w
WHERE w.user_id = ANY(ARRAY['__U1__'::uuid, '__U2__'::uuid, '__U3__'::uuid]);

-- Create test contest
INSERT INTO public.contests (id, title, main_prize, ticket_count, ticket_price, status, next_ticket_number)
VALUES (
  '__CID__'::uuid,
  'Lifecycle Test Contest',
  'TEST BMW M5',
  1000000,
  1,
  'active',
  1
)
ON CONFLICT (id) DO UPDATE SET status='active', next_ticket_number=1;

-- Bonus prizes: positions 2, 5, 10
INSERT INTO public.bonus_prizes (id, contest_id, title, description, amount, ticket_position, status)
VALUES
  (gen_random_uuid(), '__CID__'::uuid, 'Bonus Prize A', 'Second ticket wins', 100, 2,  'pending'),
  (gen_random_uuid(), '__CID__'::uuid, 'Bonus Prize B', 'Fifth ticket wins',  250, 5,  'pending'),
  (gen_random_uuid(), '__CID__'::uuid, 'Bonus Prize C', 'Tenth ticket wins',  500, 10, 'pending')
ON CONFLICT DO NOTHING;
