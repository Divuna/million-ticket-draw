# ChatGPT Work → OneMil intake (schema v1)

Staging endpoint: `POST /functions/v1/sales-lead-work-intake`

Authentication uses a dedicated secret in the HTTP header:

```text
Authorization: Bearer <WORK_INTAKE_SECRET>
Content-Type: application/json
```

The secret belongs only in the Work connector credential and the Supabase Edge
Function secret. It must never be included in a prompt, request body, database
row, log, or response.

```json
{
  "schema_version": 1,
  "external_batch_id": "work-2026-W33-550e8400-e29b-41d4-a716-446655440000",
  "items": [
    {
      "website": "https://example.cz",
      "public_email": "info@example.cz",
      "email_source_url": "https://example.cz/kontakt"
    }
  ]
}
```

The endpoint accepts 1–150 items and immediately returns HTTP 202 with a
`status_url`. Work polls that URL with the same Bearer header until the run is
`done` or `failed`. Reusing an `external_batch_id` with identical data returns
the existing run; reusing it with different data returns HTTP 409.

The status response contains accepted/created/skipped/rejected counts and a
short result code for every item. Intake never creates or activates an email
batch and never sends email.
