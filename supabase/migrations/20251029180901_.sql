-- Fix user registration issue caused by type mismatch in event_forward_log

-- Step 1: Change record_id from bigint to text to support UUID values
ALTER TABLE event_forward_log 
  ALTER COLUMN record_id TYPE text USING record_id::text;

-- Step 2: Remove duplicate triggers on users table
DROP TRIGGER IF EXISTS after_user_insert ON users;
DROP TRIGGER IF EXISTS on_user_registered ON users;
DROP TRIGGER IF EXISTS trg_audit_users ON users;

-- Keep only:
-- - audit_users_trigger (for audit logging)
-- - trigger_users_sofinity (for Sofinity forwarding)

-- Add comment for clarity
COMMENT ON COLUMN event_forward_log.record_id IS 'Stores record IDs as text to support both bigint and uuid types from different tables';;
