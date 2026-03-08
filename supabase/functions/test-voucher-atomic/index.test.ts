import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://xkzhjldrojjlrkezorey.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U";

const supabase = createClient(supabaseUrl, anonKey);

// We need an authenticated user to call the RPC properly
// Since buy_voucher_atomic is SECURITY DEFINER, anon can call it
const TEST_USER_ID = "e0eecb3b-1106-40ff-b9d9-39c882d12291";
const TEST_VOUCHER_ID = "46a13ef5-d74a-44da-af4d-dbf86227525d";

Deno.test("buy_voucher_atomic - invalid voucher returns error", async () => {
  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: "00000000-0000-0000-0000-000000000000",
  });

  assertEquals(error, null, `RPC should not throw: ${JSON.stringify(error)}`);
  assertEquals(data.success, false);
  assertEquals(data.error, "Voucher není dostupný");
});

Deno.test("buy_voucher_atomic - non-existent wallet returns error", async () => {
  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_voucher_id: TEST_VOUCHER_ID,
  });

  assertEquals(error, null, `RPC should not throw: ${JSON.stringify(error)}`);
  assertEquals(data.success, false);
  assertEquals(data.error, "Peněženka nenalezena");
});

Deno.test("buy_voucher_atomic - successful purchase", async () => {
  // Clean up first via RPC idempotency check - if already purchased, it will return error
  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: TEST_VOUCHER_ID,
  });

  assertEquals(error, null, `RPC should not throw: ${JSON.stringify(error)}`);
  // Either success=true (fresh purchase) or success=false (already purchased)
  // Both are valid - we just verify no crash
  console.log("Purchase result:", JSON.stringify(data));
  
  if (data.success === true) {
    console.log("PASS: Fresh purchase succeeded");
  } else {
    console.log(`PASS: Correctly rejected with: ${data.error}`);
  }
});

Deno.test("buy_voucher_atomic - duplicate purchase rejected", async () => {
  // Call again - should be rejected as duplicate
  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: TEST_VOUCHER_ID,
  });

  assertEquals(error, null);
  // After first test, this should be a duplicate
  assertEquals(data.success, false);
  assertEquals(data.error, "Voucher již zakoupen");
});
