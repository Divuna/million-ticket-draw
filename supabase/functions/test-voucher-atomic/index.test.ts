import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, serviceKey);

const TEST_USER_ID = "e0eecb3b-1106-40ff-b9d9-39c882d12291";
const TEST_VOUCHER_ID = "46a13ef5-d74a-44da-af4d-dbf86227525d";

async function getBalance(userId: string): Promise<number> {
  const { data } = await supabase.from("wallets").select("balance_coins").eq("user_id", userId).single();
  return data?.balance_coins ?? 0;
}

async function cleanup() {
  await supabase.from("user_vouchers").delete().eq("user_id", TEST_USER_ID).eq("voucher_id", TEST_VOUCHER_ID);
  // Reset voucher redeemed_count to current - tests will track deltas
}

Deno.test("buy_voucher_atomic - successful purchase deducts 5 MC", async () => {
  await cleanup();
  const balanceBefore = await getBalance(TEST_USER_ID);

  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: TEST_VOUCHER_ID,
  });

  assertEquals(error, null);
  assertEquals(data.success, true);

  const balanceAfter = await getBalance(TEST_USER_ID);
  assertEquals(balanceBefore - balanceAfter, 5, "Balance should decrease by exactly 5");
});

Deno.test("buy_voucher_atomic - duplicate purchase rejected", async () => {
  // Previous test left a purchased record
  const balanceBefore = await getBalance(TEST_USER_ID);

  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: TEST_VOUCHER_ID,
  });

  assertEquals(error, null);
  assertEquals(data.success, false);
  assertEquals(data.error, "Voucher již zakoupen");

  const balanceAfter = await getBalance(TEST_USER_ID);
  assertEquals(balanceBefore, balanceAfter, "Balance should not change on duplicate");
});

Deno.test("buy_voucher_atomic - insufficient balance rejected", async () => {
  await cleanup();
  // Temporarily set very low balance
  const { data: origWallet } = await supabase.from("wallets").select("balance_coins").eq("user_id", TEST_USER_ID).single();
  await supabase.from("wallets").update({ balance_coins: 2 }).eq("user_id", TEST_USER_ID);

  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: TEST_VOUCHER_ID,
  });

  assertEquals(error, null);
  assertEquals(data.success, false);
  assertEquals(data.error, "Nedostatek MioCoinů");

  // Balance unchanged
  const balanceAfter = await getBalance(TEST_USER_ID);
  assertEquals(balanceAfter, 2, "Balance should remain at 2");

  // Restore balance
  await supabase.from("wallets").update({ balance_coins: origWallet!.balance_coins }).eq("user_id", TEST_USER_ID);
});

Deno.test("buy_voucher_atomic - invalid voucher rejected", async () => {
  const balanceBefore = await getBalance(TEST_USER_ID);

  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: "00000000-0000-0000-0000-000000000000",
  });

  assertEquals(error, null);
  assertEquals(data.success, false);
  assertEquals(data.error, "Voucher není dostupný");

  const balanceAfter = await getBalance(TEST_USER_ID);
  assertEquals(balanceBefore, balanceAfter, "Balance should not change");
});

Deno.test("cleanup - restore test data", async () => {
  await cleanup();
  // Decrement redeemed_count that was incremented by successful test
  await supabase.rpc("buy_voucher_atomic", { p_user_id: "00000000-0000-0000-0000-000000000000", p_voucher_id: TEST_VOUCHER_ID });
  // Just clean up the user_vouchers record
  await cleanup();
});
