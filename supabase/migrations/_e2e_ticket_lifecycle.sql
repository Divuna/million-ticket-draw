-- E2E Lifecycle: buy tickets 1-10 and capture results
-- Bonus prizes configured at positions 2, 5, 10
-- Three users rotate purchases

WITH purchases AS (
  SELECT
    ticket_num,
    user_id,
    public._test_buy_ticket(
      'e2e00001-0000-4000-8000-000000000001'::uuid,
      user_id
    ) AS result
  FROM (VALUES
    (1,  'a1000001-e2e0-4000-8000-000000000001'::uuid),
    (2,  'a1000002-e2e0-4000-8000-000000000002'::uuid),
    (3,  'a1000003-e2e0-4000-8000-000000000003'::uuid),
    (4,  'a1000001-e2e0-4000-8000-000000000001'::uuid),
    (5,  'a1000002-e2e0-4000-8000-000000000002'::uuid),
    (6,  'a1000003-e2e0-4000-8000-000000000003'::uuid),
    (7,  'a1000001-e2e0-4000-8000-000000000001'::uuid),
    (8,  'a1000002-e2e0-4000-8000-000000000002'::uuid),
    (9,  'a1000003-e2e0-4000-8000-000000000003'::uuid),
    (10, 'a1000001-e2e0-4000-8000-000000000001'::uuid)
  ) AS t(ticket_num, user_id)
)
SELECT
  ticket_num,
  user_id,
  result->>'success'        AS success,
  result->>'error'          AS error,
  result->>'ticket_number'  AS ticket_number,
  result->>'won_prize'      AS won_prize,
  result->>'won_prize_id'   AS won_prize_id,
  result->>'contest_closed' AS contest_closed
FROM purchases
ORDER BY ticket_num;
