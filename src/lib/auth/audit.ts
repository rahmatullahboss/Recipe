import { createSortableId, fingerprint } from "./crypto";
import { getAuthBindings } from "./runtime";

export type AuthAuditEventType =
  | "register"
  | "email_verified"
  | "login_succeeded"
  | "login_failed"
  | "logout"
  | "password_changed"
  | "password_reset_requested"
  | "password_reset_completed"
  | "account_locked"
  | "account_unlocked"
  | "session_revoked"
  | "account_suspended"
  | "account_deleted";

export type AuthAuditOutcome = "success" | "failure" | "blocked";

type AuditInput = {
  userId?: string | null;
  eventType: AuthAuditEventType;
  outcome: AuthAuditOutcome;
  metadata?: Record<string, string | number | boolean | null>;
};

function getClientIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? null;
}

function serialiseMetadata(metadata: AuditInput["metadata"]): string | null {
  if (!metadata) return null;
  const safeEntries = Object.entries(metadata)
    .slice(0, 20)
    .map(([key, value]) => [key.slice(0, 80), typeof value === "string" ? value.slice(0, 240) : value]);
  const json = JSON.stringify(Object.fromEntries(safeEntries));
  return json.length <= 2_000 ? json : null;
}

export async function recordAuthAudit(request: Request, input: AuditInput): Promise<void> {
  const bindings = getAuthBindings();
  const database = bindings.DB;
  const pepper = bindings.AUTH_FINGERPRINT_PEPPER?.trim();
  if (!database || !pepper) return;

  try {
    const [ipHash, userAgentHash] = await Promise.all([
      fingerprint(getClientIp(request), pepper),
      fingerprint(request.headers.get("user-agent"), pepper),
    ]);

    await database.prepare(
      `INSERT INTO auth_audit_events (
        id, user_id, event_type, outcome, ip_hash, user_agent_hash, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      createSortableId("audit"),
      input.userId ?? null,
      input.eventType,
      input.outcome,
      ipHash,
      userAgentHash,
      serialiseMetadata(input.metadata),
    ).run();
  } catch (error) {
    console.error("Authentication audit event could not be recorded.", error);
  }
}
