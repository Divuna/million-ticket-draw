-- ============================================================================
-- VERIFIKACE — FÁZE 1: 90denní platnost partnerské odměny
--   migrace: supabase/migrations/20260903200832_partner_reward_90day_expiry.sql
--            + supabase/migrations/20260903201001_partner_reward_expiry_cron.sql
--
-- Část A = instalační postcheck (read-only, bezpečné i na produkci).
-- Část B = funkční test se seed daty (POUZE STAGING — zapisuje!).
--
-- Ověřeno na stagingu dxmowysntemfqfnanxua 03. 09. 2026: všech 12 kontrol PASS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ČÁST A — instalační postcheck (read-only)
-- Očekáváno: 90 | 1 | '30 3 * * * active=true' | f | f | f | t
-- ---------------------------------------------------------------------------
SELECT
  public.partner_reward_validity_days()                                              AS validity_days,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE t.tgname = 'trg_set_partner_reward_expiry'
       AND c.relname = 'partner_reward_codes')                                       AS trigger_installed,
  (SELECT j.schedule || ' active=' || j.active FROM cron.job j
     WHERE j.jobname = 'expire_partner_reward_codes_daily')                          AS cron,
  has_function_privilege('anon','public.partner_reward_validity_days()','EXECUTE')   AS anon_validity,
  has_function_privilege('anon','public.expire_partner_reward_codes()','EXECUTE')    AS anon_expire,
  has_function_privilege('authenticated','public.expire_partner_reward_codes()','EXECUTE') AS auth_expire,
  has_function_privilege('service_role','public.expire_partner_reward_codes()','EXECUTE')  AS svc_expire;

-- Historická data nesmí být dotčena (0 označených řádků, 0 nových expirací)
SELECT
  count(*)                                                       AS codes_total,
  count(*) FILTER (WHERE metadata ? 'expiry_source')             AS marked_by_migration,
  count(*) FILTER (WHERE status = 'expired')                     AS status_expired,
  md5(string_agg(code || ':' || status || ':' || coalesce(expired_at::text,'-'), '|' ORDER BY code)) AS checksum
FROM public.partner_reward_codes;


-- ===========================================================================
-- ČÁST B — funkční test (STAGING ONLY)
--
-- Nahraď <CUSTOMER_UUID> za auth.users.id testovacího zákazníka, jehož e-mail
-- se shoduje s customer_email/issued_to_email níže (jinak redeem vrátí
-- email_mismatch). Na stagingu: e2e@onemil.cz.
--
-- POZOR: redeem připíše MioCoiny do peněženky a wallet_transactions je
-- IMMUTABLE ledger (fn_wallet_transactions_immutable) — ledger řádky nelze
-- smazat. Počítej s trvalým kladným zůstatkem u testovaného účtu.
-- ===========================================================================

-- B0. seed --------------------------------------------------------------------
INSERT INTO public.partners (id, name, logo_url, website_url, status, approved_at, price_per_coin, vat_rate)
VALUES ('f1f1f1f1-0000-4000-8000-000000000001',
        'PHASE1 EXPIRY TEST PARTNER', '', 'https://phase1-test.invalid',
        'approved', now(), 1.00, 0.21)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.partner_reward_codes
  (code, partner_id, coins, customer_email, issued_to_email, status, issued_at, expired_at, metadata)
VALUES
  ('PH1-FRESH',   'f1f1f1f1-0000-4000-8000-000000000001', 10, 'e2e@onemil.cz','e2e@onemil.cz','issued',  now(),                     NULL,                     '{"t":"phase1"}'),
  ('PH1-D89',     'f1f1f1f1-0000-4000-8000-000000000001', 11, 'e2e@onemil.cz','e2e@onemil.cz','issued',  now()-interval '89 days',  NULL,                     '{"t":"phase1"}'),
  ('PH1-D91',     'f1f1f1f1-0000-4000-8000-000000000001', 12, 'e2e@onemil.cz','e2e@onemil.cz','issued',  now()-interval '91 days',  NULL,                     '{"t":"phase1"}'),
  ('PH1-PENDING', 'f1f1f1f1-0000-4000-8000-000000000001', 13, 'e2e@onemil.cz','e2e@onemil.cz','pending', now(),                     NULL,                     '{"t":"phase1"}'),
  ('PH1-PREEXP',  'f1f1f1f1-0000-4000-8000-000000000001', 14, 'e2e@onemil.cz','e2e@onemil.cz','issued',  now(), now()+interval '5 days', '{"t":"phase1"}');

-- B1. trigger nastavuje expiraci přesně jako issued_at + 90 dní ---------------
-- Očekáváno: FRESH/D89/D91 → days=90, marker='auto_v1'
--            PENDING       → days=NULL, marker=NULL   (pending expiraci nedostane)
--            PREEXP        → days=5,    marker=NULL   (existující expirace se nepřepíše)
SELECT code, status, (expired_at::date - issued_at::date) AS days,
       metadata->>'expiry_source' AS marker
FROM public.partner_reward_codes WHERE code LIKE 'PH1-%' ORDER BY code;

-- B2. pending → issued expiraci doplní; opakované issued ji nepřepíše ---------
UPDATE public.partner_reward_codes SET status='issued' WHERE code='PH1-PENDING';
UPDATE public.partner_reward_codes SET status='issued' WHERE code='PH1-FRESH';
-- Očekáváno: PENDING days=90 marker='auto_v1'; FRESH days=90 (nezměněno); PREEXP days=5
SELECT code, (expired_at::date - issued_at::date) AS days, metadata->>'expiry_source' AS marker
FROM public.partner_reward_codes WHERE code IN ('PH1-PENDING','PH1-FRESH','PH1-PREEXP') ORDER BY code;

-- B3. redeem: 91 dní zamítnuto, 89 dní i čerstvý projdou ---------------------
SELECT set_config('request.jwt.claims',
  '{"sub":"<CUSTOMER_UUID>","role":"authenticated"}', false);
-- Očekáváno: {"success":false,"error":"expired"} | success:true | success:true
SELECT public.redeem_miocoin_code('PH1-D91')   AS day91_must_fail,
       public.redeem_miocoin_code('PH1-D89')   AS day89_must_pass,
       public.redeem_miocoin_code('PH1-FRESH') AS fresh_must_pass;

-- B4. cron překlopí jen prošlé issued; druhý běh je no-op --------------------
SELECT public.expire_partner_reward_codes() AS run1_expected_1;
SELECT public.expire_partner_reward_codes() AS run2_expected_0;

-- B5. stav po cronu ----------------------------------------------------------
-- Očekáváno: D91 → expired / expired_by='cron' / activation_rows=0
--            aktivované kódy zůstávají 'activated' i po datu expirace
SELECT code, status, activated_at IS NOT NULL AS activated,
       metadata->>'expired_by' AS expired_by,
       (SELECT count(*) FROM public.partner_coin_activations a WHERE a.code = c.code) AS activation_rows
FROM public.partner_reward_codes c
WHERE code LIKE 'PH1-%' OR code LIKE 'HEYGEN-%' ORDER BY code;

-- B6. cleanup ----------------------------------------------------------------
-- wallet_transactions se NEMAŽE (immutable ledger) — zůstatek testovacího
-- účtu proto zůstane navýšený o uplatněné coiny.
DELETE FROM public.partner_coin_activations WHERE code LIKE 'PH1-%';
DELETE FROM public.partner_reward_codes     WHERE code LIKE 'PH1-%';
DELETE FROM public.partners WHERE id = 'f1f1f1f1-0000-4000-8000-000000000001';

-- B7. postcheck úklidu — checksum se musí vrátit na hodnotu z ČÁSTI A --------
SELECT
  (SELECT count(*) FROM public.partner_reward_codes WHERE code LIKE 'PH1-%')     AS ph1_left,
  (SELECT count(*) FROM public.partner_coin_activations WHERE code LIKE 'PH1-%') AS ph1_activations_left,
  (SELECT md5(string_agg(code || ':' || status || ':' || coalesce(expired_at::text,'-'), '|' ORDER BY code))
     FROM public.partner_reward_codes)                                           AS checksum;
