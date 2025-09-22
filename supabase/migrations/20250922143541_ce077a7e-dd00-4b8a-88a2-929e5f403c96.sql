-- Create comprehensive test user and dependent records for CRUD testing
-- This migration creates a complete test dataset for the OneMil application

-- 1. Insert test user with fixed UUID for consistent testing
INSERT INTO public.users (
  id,
  email,
  name,
  role,
  created_at
) VALUES (
  '99999999-0000-0000-0000-000000000001'::uuid,
  'crud_test_user@onemil.test',
  'CRUD Test User',
  'user',
  now()
) ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role;

-- 2. Create wallet for test user with initial balances
INSERT INTO public.wallets (
  id,
  user_id,
  balance_coins,
  balance_vouchers,
  created_at
) VALUES (
  '99999999-0000-0000-0001-000000000001'::uuid,
  '99999999-0000-0000-0000-000000000001'::uuid,
  100,
  50,
  now()
) ON CONFLICT (user_id) DO UPDATE SET
  balance_coins = EXCLUDED.balance_coins,
  balance_vouchers = EXCLUDED.balance_vouchers;

-- 3. Create test notification
INSERT INTO public.notifications (
  id,
  user_id,
  type,
  title,
  message,
  status,
  created_at,
  sent_at
) VALUES (
  '99999999-0000-0000-0002-000000000001'::uuid,
  '99999999-0000-0000-0000-000000000001'::uuid,
  'info',
  'Test oznámení CRUD',
  'Toto je testovací oznámení pro CRUD operace v OneMil aplikaci.',
  'sent',
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  message = EXCLUDED.message;

-- 4. Create test payment record
INSERT INTO public.payments (
  id,
  user_id,
  amount,
  method,
  status,
  created_at
) VALUES (
  '99999999-0000-0000-0003-000000000001'::uuid,
  '99999999-0000-0000-0000-000000000001'::uuid,
  150.00,
  'card',
  'completed',
  now()
) ON CONFLICT (id) DO UPDATE SET
  amount = EXCLUDED.amount,
  status = EXCLUDED.status;

-- 5. Create test ticket using existing contest (if any contest exists)
INSERT INTO public.tickets (
  id,
  user_id,
  contest_id,
  number,
  created_at
)
SELECT 
  '99999999-0000-0000-0004-000000000001'::uuid,
  '99999999-0000-0000-0000-000000000001'::uuid,
  c.id,
  99999,
  now()
FROM contests c
WHERE c.status IN ('active', 'draft')
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  number = EXCLUDED.number;

-- 6. Create test voucher
INSERT INTO public.vouchers (
  id,
  user_id,
  code,
  value,
  redeemed,
  created_at
) VALUES (
  '99999999-0000-0000-0005-000000000001'::uuid,
  '99999999-0000-0000-0000-000000000001'::uuid,
  'CRUD-TEST-2025',
  100.00,
  false,
  now()
) ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  value = EXCLUDED.value;

-- 7. Create test audit log entry
INSERT INTO public.audit_logs (
  event,
  user_id,
  metadata,
  created_at
) VALUES (
  'test_user_created',
  '99999999-0000-0000-0000-000000000001'::uuid,
  jsonb_build_object(
    'test_type', 'crud_testing',
    'user_email', 'crud_test_user@onemil.test',
    'created_by', 'automated_test_suite'
  ),
  now()
);

-- 8. Create test event log entry
INSERT INTO public.event_logs (
  event_name,
  user_id,
  metadata,
  timestamp
) VALUES (
  'test_user_setup_complete',
  '99999999-0000-0000-0000-000000000001'::uuid,
  jsonb_build_object(
    'test_records_created', jsonb_build_array(
      'user', 'wallet', 'notification', 'payment', 'ticket', 'voucher'
    ),
    'test_purpose', 'crud_operations_validation'
  ),
  now()
);

-- Verification queries to confirm successful creation
-- These will show in the migration output for confirmation

-- Count records created for test user
SELECT 
  'Test User Created' as record_type,
  COUNT(*) as count
FROM users 
WHERE email = 'crud_test_user@onemil.test'

UNION ALL

SELECT 
  'Wallet Created' as record_type,
  COUNT(*) as count
FROM wallets 
WHERE user_id = '99999999-0000-0000-0000-000000000001'::uuid

UNION ALL

SELECT 
  'Notifications Created' as record_type,
  COUNT(*) as count
FROM notifications 
WHERE user_id = '99999999-0000-0000-0000-000000000001'::uuid

UNION ALL

SELECT 
  'Payments Created' as record_type,
  COUNT(*) as count
FROM payments 
WHERE user_id = '99999999-0000-0000-0000-000000000001'::uuid

UNION ALL

SELECT 
  'Tickets Created' as record_type,
  COUNT(*) as count
FROM tickets 
WHERE user_id = '99999999-0000-0000-0000-000000000001'::uuid

UNION ALL

SELECT 
  'Vouchers Created' as record_type,
  COUNT(*) as count
FROM vouchers 
WHERE user_id = '99999999-0000-0000-0000-000000000001'::uuid;