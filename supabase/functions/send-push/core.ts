export type PushLogRow = {
  id: string;
  user_id: string | null;
  player_id: string | null;
  title: string | null;
  message: string | null;
  status: string | null;
};

export type PushLogRecoveryMetadata = {
  claimed_at: string;
  recovered_stale_processing: true;
  recovery_timeout_minutes: number;
};

export type PushLogClaim =
  | {
    state: "claimed";
    row: PushLogRow;
    recovery?: PushLogRecoveryMetadata;
  }
  | { state: "duplicate"; status: string }
  | { state: "missing" };

export const STALE_PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

export type PushLogClaimResponse = {
  ok: null;
  stage: "processing";
  claimed_at: string;
  recovered_stale_processing?: true;
  recovery_timeout_minutes?: number;
};

export interface PushLogClaimBackend {
  claimPending(
    id: string,
    response: PushLogClaimResponse,
  ): Promise<PushLogRow | null>;
  claimStaleProcessing(
    id: string,
    staleBefore: string,
    response: PushLogClaimResponse,
  ): Promise<PushLogRow | null>;
  readStatus(id: string): Promise<string | null | undefined>;
}

export interface PushLogStore {
  claimPending(id: string): Promise<PushLogClaim>;
  markSent(id: string, response: Record<string, unknown>): Promise<void>;
  markFailed(id: string, response: Record<string, unknown>): Promise<void>;
}

export type DispatchPushDependencies = {
  store: PushLogStore;
  oneSignalApiKey: string;
  oneSignalAppId: string;
  fetchImpl: typeof fetch;
};

export type DispatchPushResult = {
  status: number;
  body: Record<string, unknown>;
};

export function normalizePlayerId(playerId: unknown): string | null {
  if (typeof playerId !== "string") return null;
  const value = playerId.trim();
  if (!value || value.length < 10 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  return value;
}

export async function claimPushLogForDelivery(
  id: string,
  backend: PushLogClaimBackend,
  now = new Date(),
): Promise<PushLogClaim> {
  const claimedAt = now.toISOString();
  const pendingRow = await backend.claimPending(id, {
    ok: null,
    stage: "processing",
    claimed_at: claimedAt,
  });
  if (pendingRow) {
    return { state: "claimed", row: pendingRow };
  }

  const staleBefore = new Date(
    now.getTime() - STALE_PROCESSING_TIMEOUT_MS,
  ).toISOString();
  const recoveredRow = await backend.claimStaleProcessing(
    id,
    staleBefore,
    {
      ok: null,
      stage: "processing",
      claimed_at: claimedAt,
      recovered_stale_processing: true,
      recovery_timeout_minutes: STALE_PROCESSING_TIMEOUT_MS / 60_000,
    },
  );
  if (recoveredRow) {
    return {
      state: "claimed",
      row: recoveredRow,
      recovery: {
        claimed_at: claimedAt,
        recovered_stale_processing: true,
        recovery_timeout_minutes: STALE_PROCESSING_TIMEOUT_MS / 60_000,
      },
    };
  }

  const status = await backend.readStatus(id);
  return status === null || status === undefined
    ? { state: "missing" }
    : { state: "duplicate", status };
}

function parseServiceResponse(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody || null;
  }
}

export async function dispatchPendingPush(
  pushLogId: string,
  dependencies: DispatchPushDependencies,
): Promise<DispatchPushResult> {
  const claim = await dependencies.store.claimPending(pushLogId);
  if (claim.state === "missing") {
    return { status: 404, body: { ok: false, error: "push_log_not_found", push_log_id: pushLogId } };
  }
  if (claim.state === "duplicate") {
    return {
      status: 200,
      body: {
        ok: true,
        duplicate: true,
        push_log_id: pushLogId,
        status: claim.status,
      },
    };
  }

  const recoveryMetadata = claim.recovery ?? {};
  const playerId = normalizePlayerId(claim.row.player_id);
  if (!playerId) {
    const response = {
      ok: false,
      stage: "validation",
      error: "Invalid player_id (null/empty/format)",
      player_id: claim.row.player_id,
      ...recoveryMetadata,
    };
    await dependencies.store.markFailed(pushLogId, response);
    return { status: 200, body: { ...response, push_log_id: pushLogId } };
  }

  if (!dependencies.oneSignalApiKey) {
    const response = {
      ok: false,
      stage: "configuration",
      error: "Missing ONESIGNAL_REST_API_KEY",
      ...recoveryMetadata,
    };
    await dependencies.store.markFailed(pushLogId, response);
    return { status: 500, body: { ...response, push_log_id: pushLogId } };
  }

  const payload = {
    app_id: dependencies.oneSignalAppId,
    include_player_ids: [playerId],
    headings: { en: claim.row.title ?? "" },
    contents: { en: claim.row.message ?? "" },
  };

  try {
    const serviceResponse = await dependencies.fetchImpl(
      "https://onesignal.com/api/v1/notifications",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${dependencies.oneSignalApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    const rawBody = await serviceResponse.text();
    const response = {
      ok: serviceResponse.ok,
      stage: "onesignal",
      status_code: serviceResponse.status,
      body: parseServiceResponse(rawBody),
      raw_body: rawBody,
      ...recoveryMetadata,
    };

    if (serviceResponse.ok) {
      await dependencies.store.markSent(pushLogId, response);
    } else {
      await dependencies.store.markFailed(pushLogId, response);
    }

    return {
      status: serviceResponse.ok ? 200 : 502,
      body: {
        ok: serviceResponse.ok,
        push_log_id: pushLogId,
        status_code: serviceResponse.status,
        response: parseServiceResponse(rawBody),
      },
    };
  } catch (error) {
    const response = {
      ok: false,
      stage: "onesignal_request",
      error: error instanceof Error ? error.message : String(error),
      ...recoveryMetadata,
    };
    await dependencies.store.markFailed(pushLogId, response);
    return { status: 502, body: { ...response, push_log_id: pushLogId } };
  }
}
