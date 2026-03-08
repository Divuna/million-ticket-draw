import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://xkzhjldrojjlrkezorey.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U";

const supabase = createClient(supabaseUrl, anonKey);

const TEST_USER_ID = "e0eecb3b-1106-40ff-b9d9-39c882d12291";
// Use an active unlimited voucher
const ACTIVE_VOUCHER_ID = "c19567b7-5df7-4ad2-8726-d1064cb8d14f";
const EXPIRED_VOUCHER_ID = "46a13ef5-d74a-44da-af4d-dbf86227525d";

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
  // Clean up any existing record first
  await supabase.from("user_vouchers").delete().eq("user_id", TEST_USER_ID).eq("voucher_id", ACTIVE_VOUCHER_ID);

  const { data: walletBefore } = await supabase.from("wallets").select("balance_coins").eq("user_id", TEST_USER_ID).single();
  const balanceBefore = Number(walletBefore!.balance_coins);

  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: ACTIVE_VOUCHER_ID,
  });

  assertEquals(error, null, `RPC error: ${JSON.stringify(error)}`);
  assertEquals(data.success, true, `Expected success, got: ${JSON.stringify(data)}`);

  const { data: walletAfter } = await supabase.from("wallets").select("balance_coins").eq("user_id", TEST_USER_ID).single();
  const balanceAfter = Number(walletAfter!.balance_coins);
  assertEquals(balanceBefore - balanceAfter, 5, `Balance diff should be 5, was ${balanceBefore - balanceAfter}`);

  // Verify user_vouchers record exists
  const { data: uv } = await supabase.from("user_vouchers").select("*").eq("user_id", TEST_USER_ID).eq("voucher_id", ACTIVE_VOUCHER_ID).single();
  assertEquals(uv!.redeemed, true, "user_vouchers record should have redeemed=true");

  console.log(`PASS: Balance ${balanceBefore} -> ${balanceAfter}, diff=5`);
});

Deno.test("5. duplicate purchase rejected without balance change", async () => {
  const { data: walletBefore } = await supabase.from("wallets").select("balance_coins").eq("user_id", TEST_USER_ID).single();

  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: ACTIVE_VOUCHER_ID,
  });

  assertEquals(error, null);
  assertEquals(data.success, false);
  assertEquals(data.error, "Voucher již zakoupen");

  const { data: walletAfter } = await supabase.from("wallets").select("balance_coins").eq("user_id", TEST_USER_ID).single();
  assertEquals(Number(walletBefore!.balance_coins), Number(walletAfter!.balance_coins), "Balance must not change on duplicate");
});

Deno.test("6. cleanup - restore test data", async () => {
  // Remove the test purchase and restore balance
  await supabase.from("user_vouchers").delete().eq("user_id", TEST_USER_ID).eq("voucher_id", ACTIVE_VOUCHER_ID);
  // Add back the 5 MC deducted
  const { data: w } = await supabase.from("wallets").select("balance_coins").eq("user_id", TEST_USER_ID).single();
  await supabase.from("wallets").update({ balance_coins: Number(w!.balance_coins) + 5 }).eq("user_id", TEST_USER_ID);
  // Decrement redeemed_count
  const { data: v } = await supabase.from("vouchers").select("redeemed_count").eq("id", ACTIVE_VOUCHER_ID).single();
  if (v && v.redeemed_count > 0) {
    await supabase.from("vouchers").update({ redeemed_count: v.redeemed_count - 1 }).eq("id", ACTIVE_VOUCHER_ID);
  }
  console.log("Test data cleaned up successfully");
});
