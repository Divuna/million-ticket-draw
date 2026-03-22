-- Phase 4: Buy tickets 1-10, rotating across 3 users
-- Bonus prizes configured at positions 2, 5, 10
SELECT
  seq,
  user_id,
  public._test_buy_ticket('__CID__'::uuid, user_id) AS result
FROM (VALUES
  (1,  '__U1__'::uuid),
  (2,  '__U2__'::uuid),
  (3,  '__U3__'::uuid),
  (4,  '__U1__'::uuid),
  (5,  '__U2__'::uuid),
  (6,  '__U3__'::uuid),
  (7,  '__U1__'::uuid),
  (8,  '__U2__'::uuid),
  (9,  '__U3__'::uuid),
  (10, '__U1__'::uuid)
) AS t(seq, user_id)
ORDER BY seq;
