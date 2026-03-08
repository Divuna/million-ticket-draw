import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://xkzhjldrojjlrkezorey.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U";

const supabase = createClient(supabaseUrl, anonKey);

const TEST_USER_ID = "e0eecb3b-1106-40ff-b9d9-39c882d12291";
const ACTIVE_VOUCHER_ID = "c19567b7-5df7-4ad2-8726-d1064cb8d14f";
const EXPIRED_VOUCHER_ID = "46a13ef5-d74a-44da-af4d-dbf86227525d";

// RPC is SECURITY DEFINER so it works with anon key.
// Wallet reads require auth/RLS so we verify behavior through RPC responses.

Deno.test("1. invalid voucher returns error", async () => {
  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: "00000000-0000-0000-0000-000000000000",
  });
  assertEquals(error, null);
  assertEquals(data.success, false);
  assertEquals(data.error, "Voucher není dostupný");
});

Deno.test("2. non-existent wallet returns error", async () => {
  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_voucher_id: ACTIVE_VOUCHER_ID,
  });
  assertEquals(error, null);
  assertEquals(data.success, false);
  assertEquals(data.error, "Peněženka nenalezena");
});

Deno.test("3. expired voucher returns error", async () => {
  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: EXPIRED_VOUCHER_ID,
  });
  assertEquals(error, null);
  assertEquals(data.success, false);
  assertEquals(data.error, "Voucher není dostupný");
});

Deno.test("4. successful purchase on active voucher", async () => {
  // Clean up any existing record
  await supabase.from("user_vouchers").delete().eq("user_id", TEST_USER_ID).eq("voucher_id", ACTIVE_VOUCHER_ID);

  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: ACTIVE_VOUCHER_ID,
  });

  assertEquals(error, null, `RPC error: ${JSON.stringify(error)}`);
  assertEquals(data.success, true, `Expected success=true, got: ${JSON.stringify(data)}`);
  console.log("PASS: Purchase succeeded atomically");
});

Deno.test("5. duplicate purchase rejected", async () => {
  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: ACTIVE_VOUCHER_ID,
  });

  assertEquals(error, null);
  assertEquals(data.success, false);
  assertEquals(data.error, "Voucher již zakoupen");
  console.log("PASS: Duplicate correctly rejected");
});

Deno.test("6. race condition: parallel calls both get correct result", async () => {
  // Clean up
  await supabase.from("user_vouchers").delete().eq("user_id", TEST_USER_ID).eq("voucher_id", ACTIVE_VOUCHER_ID);

  // Send 3 parallel requests
  const results = await Promise.all([
    supabase.rpc("buy_voucher_atomic", { p_user_id: TEST_USER_ID, p_voucher_id: ACTIVE_VOUCHER_ID }),
    supabase.rpc("buy_voucher_atomic", { p_user_id: TEST_USER_ID, p_voucher_id: ACTIVE_VOUCHER_ID }),
    supabase.rpc("buy_voucher_atomic", { p_user_id: TEST_USER_ID, p_voucher_id: ACTIVE_VOUCHER_ID }),
  ]);

  const successes = results.filter(r => r.data?.success === true);
  const failures = results.filter(r => r.data?.success === false);
  const errors = results.filter(r => r.error !== null);

  console.log(`Results: ${successes.length} success, ${failures.length} rejected, ${errors.length} errors`);
  
  // Exactly 1 should succeed, rest should fail
  assertEquals(errors.length, 0, "No RPC errors expected");
  assertEquals(successes.length, 1, `Exactly 1 purchase should succeed, got ${successes.length}`);
  assertEquals(failures.length, 2, `Exactly 2 should be rejected, got ${failures.length}`);
  console.log("PASS: Race condition handled correctly - only 1 purchase went through");
});

Deno.test("7. cleanup", async () => {
  await supabase.from("user_vouchers").delete().eq("user_id", TEST_USER_ID).eq("voucher_id", ACTIVE_VOUCHER_ID);
  console.log("Cleaned up test data");
});
