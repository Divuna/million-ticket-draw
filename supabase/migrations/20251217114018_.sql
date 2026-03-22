-- Remove duplicate trigger that causes race condition with buy_ticket_atomic RPC
-- The RPC already contains complete logic for bonus prize detection and winner creation
DROP TRIGGER IF EXISTS trg_check_bonus_prize ON tickets;;
