import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const apiUrl = process.env.API_URL ?? process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

assert.ok(anonKey, 'ANON_KEY or SUPABASE_ANON_KEY is required');

for (const functionName of ['upload-ticket-share', 'generate-ticket-image']) {
  const response = await fetch(`${apiUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ticketId: randomUUID(),
      imageBase64: 'data:image/png;base64,AA==',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 410, `${functionName} must be a write-disabled tombstone`);
  assert.equal(typeof body.error, 'string');
  assert.equal('publicUrl' in body, false, `${functionName} must not return a storage URL`);
  assert.equal('filename' in body, false, `${functionName} must not return an object name`);
}

console.log('2 passed: deprecated share upload functions reject writes');
