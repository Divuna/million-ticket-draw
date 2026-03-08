import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("API_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !serviceKey) {
  throw new Error(`Missing env: URL=${!!supabaseUrl}, KEY=${!!serviceKey}. Available: ${Object.keys(Deno.env.toObject()).join(', ')}`);
}

const supabase = createClient(supabaseUrl, serviceKey);

const TEST_USER_ID = "e0eecb3b-1106-40ff-b9d9-39c882d12291";
const TEST_VOUCHER_ID = "46a13ef5-d74a-44da-af4d-dbf86227525d";

async function getBalance(userId: string): Promise<number> {
  const { data } = await supabase.from("wallets").select("balance_coins").eq("user_id", userId).single();
  return Number(data?.balance_coins ?? 0);
}

async function cleanup() {
  await supabase.from("user_vouchers").delete().eq("user_id", TEST_USER_ID).eq("voucher_id", TEST_VOUCHER_ID);
}

Deno.test("buy_voucher_atomic - successful purchase deducts 5 MC", async () => {
  await cleanup();
  const balanceBefore = await getBalance(TEST_USER_ID);

  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: TEST_VOUCHER_ID,
  });

  assertEquals(error, null, `RPC error: ${JSON.stringify(error)}`);
  assertEquals(data.success, true, `Expected success, got: ${JSON.stringify(data)}`);

  const balanceAfter = await getBalance(TEST_USER_ID);
  assertEquals(balanceBefore - balanceAfter, 5, `Balance diff should be 5, was ${balanceBefore - balanceAfter}`);
});

Deno.test("buy_voucher_atomic - duplicate purchase rejected without balance change", async () => {
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
  const origBalance = await getBalance(TEST_USER_ID);
  
  await supabase.from("wallets").update({ balance_coins: 2 }).eq("user_id", TEST_USER_ID);

  const { data, error } = await supabase.rpc("buy_voucher_atomic", {
    p_user_id: TEST_USER_ID,
    p_voucher_id: TEST_VOUCHER_ID,
  });

  assertEquals(error, null);
  assertEquals(data.success, false);
  assertEquals(data.error, "Nedostatek MioCoinů");

  const balanceAfter = await getBalance(TEST_USER_ID);
  assertEquals(balanceAfter, 2, "Balance should remain at 2");

  // Restore
  await supabase.from("wallets").update({ balance_coins: origBalance }).eq("user_id", TEST_USER_ID);
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
  assertEquals(balanceBefore, balanceAfter);
});

Deno.test("cleanup test data", async () => {
  await cleanup();
  // Restore redeemed_count
  const { data: v } = await supabase.from("vouchers").select("redeemed_count").eq("id", TEST_VOUCHER_ID).single();
  if (v && v.redeemed_count > 0) {
    await supabase.from("vouchers").update({ redeemed_count: v.redeemed_count - 1 }).eq("id", TEST_VOUCHER_ID);
  }
});
