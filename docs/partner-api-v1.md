# Partner API v1 (staging)

Staging project: `dxmowysntemfqfnanxua`

Production is intentionally untouched. Do not apply this staging migration or deploy this Edge Function to production without explicit approval.

## Endpoint

Base URL:

```text
https://dxmowysntemfqfnanxua.supabase.co/functions/v1/partner-api-v1
```

Authentication:

```http
Authorization: Bearer <partner_api_key>
Content-Type: application/json
```

## Create order reward

```http
POST /orders
```

Request:

```json
{
  "order_id": "ORDER-123",
  "order_total_czk": 250,
  "customer_email": "customer@example.com"
}
```

`external_order_id` is accepted as an alias for `order_id`. If both are sent, they must match.

Partners must not send `coins`, `miocoins`, `mio_coins`, or `reward_coins`. OneMil calculates the reward from `partners.reward_base_czk` and `partners.reward_mc`, using floor rounding.

Response:

```json
{
  "status": "ok",
  "success": true,
  "duplicate": false,
  "order_id": "ORDER-123",
  "external_order_id": "ORDER-123",
  "order_total_czk": 250,
  "customer_email": "customer@example.com",
  "coins": 2,
  "reward_code": "ABC123",
  "reward_link": "https://onemil.cz/profile?miocoin_code=ABC123",
  "reward_status": "pending",
  "order_status": null,
  "conversion": {
    "base_czk": 100,
    "reward_mc": 1,
    "rounding": "floor"
  }
}
```

Duplicate `partner_id + order_id` returns the same `reward_code` and `reward_link` with `"duplicate": true`.

Order creation does not create invoices, emails, PDFs, `partner_coin_activations`, or wallet credits.

## Update order status

```http
POST /orders/status
```

Request:

```json
{
  "order_id": "ORDER-123",
  "status": "paid"
}
```

Activating statuses:

```text
paid, delivered, completed
```

Cancelling statuses:

```text
cancelled, returned, unpaid, not_picked_up
```

Activation response:

```json
{
  "status": "ok",
  "success": true,
  "order_id": "ORDER-123",
  "external_order_id": "ORDER-123",
  "order_status": "paid",
  "reward_status": "active",
  "reward_code": "ABC123",
  "reward_link": "https://onemil.cz/profile?miocoin_code=ABC123",
  "coins": 2
}
```

Cancellation response uses `"reward_status": "cancelled"`.

Wallet credit happens only when the customer redeems an active code through `redeem_miocoin_code`.

## Staging verification

E2E partner:

```text
99790c17-0fcc-49f4-9f01-18e915dd241a
```

Verified case:

```text
order_total_czk = 250
partner setting = 100 Kč = 1 MioCoin
expected reward = 2 MioCoiny
```

Observed response for `CODEX-V1-20260613-250-A`:

```json
{
  "status": "ok",
  "coins": 2,
  "duplicate": false,
  "reward_code": "IEVBAJEBEKVO",
  "reward_link": "https://onemil.cz/profile?miocoin_code=IEVBAJEBEKVO",
  "reward_status": "pending"
}
```

Duplicate request returned the same code/link with `"duplicate": true`.

`paid` update returned `"reward_status": "active"` and did not create `partner_coin_activations`.

Separate cancellation test `CODEX-V1-20260613-250-CANCEL` returned `"reward_status": "cancelled"`.

Customer redemption of the active code returned:

```json
{
  "success": true,
  "coins": 2,
  "new_balance": 2
}
```

After redemption, the code changed to `activated`, `partner_coin_activations.external_order_id` was `CODEX-V1-20260613-250-A`, and the wallet ledger source was `redeem_miocoin_code`.
