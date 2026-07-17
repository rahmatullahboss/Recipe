import { Buffer } from "node:buffer";
import { randomBytes, randomUUID, webcrypto } from "node:crypto";
import fs from "node:fs";

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 600_000;
const OUTPUT_PATH = process.env.BOOTSTRAP_SQL_PATH || ".bootstrap-admin.sql";

function requireValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function validatePassword(password, email) {
  const errors = [];
  if (password.length < 12 || password.length > 128) errors.push("Password must contain 12 to 128 characters.");
  if (!/[a-z]/.test(password)) errors.push("Password must include a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Password must include an uppercase letter.");
  if (!/\d/.test(password)) errors.push("Password must include a number.");
  const emailUser = email.split("@")[0]?.toLowerCase();
  if (emailUser && password.toLowerCase().includes(emailUser)) errors.push("Password must not contain the email username.");
  if (errors.length) throw new Error(errors.join(" "));
}

async function hashPassword(password, pepper) {
  const pepperKey = await webcrypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prehash = await webcrypto.subtle.sign("HMAC", pepperKey, encoder.encode(password));
  const keyMaterial = await webcrypto.subtle.importKey("raw", prehash, "PBKDF2", false, ["deriveBits"]);
  const salt = randomBytes(16);
  const bits = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    keyMaterial,
    256,
  );
  return `pbkdf2-sha256-hmacpepper-v1$${PASSWORD_ITERATIONS}$${salt.toString("base64url")}$${Buffer.from(bits).toString("base64url")}`;
}

const email = requireValue("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
const password = requireValue("BOOTSTRAP_ADMIN_PASSWORD");
const pepper = requireValue("AUTH_PASSWORD_PEPPER");
const username = requireValue("BOOTSTRAP_ADMIN_USERNAME").toLowerCase();
const displayName = requireValue("BOOTSTRAP_ADMIN_DISPLAY_NAME");
const locale = (process.env.BOOTSTRAP_ADMIN_LOCALE?.trim() || "en").toLowerCase();

if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("BOOTSTRAP_ADMIN_EMAIL is invalid.");
if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(username)) throw new Error("BOOTSTRAP_ADMIN_USERNAME must contain 3 to 32 lowercase letters, numbers, underscores, or hyphens.");
if (displayName.length < 2 || displayName.length > 80) throw new Error("BOOTSTRAP_ADMIN_DISPLAY_NAME must contain 2 to 80 characters.");
if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(locale)) throw new Error("BOOTSTRAP_ADMIN_LOCALE is invalid.");
validatePassword(password, email);

const userId = randomUUID();
const auditId = randomUUID();
const passwordHash = await hashPassword(password, pepper);
const metadata = JSON.stringify({ source: "guarded_admin_bootstrap", role: "admin" });

const sql = `PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

INSERT INTO users (
  id,
  email,
  username,
  display_name,
  password_hash,
  role,
  email_verified_at,
  status,
  auth_version,
  password_algorithm,
  password_changed_at,
  preferred_locale,
  created_at,
  updated_at
) VALUES (
  ${sqlText(userId)},
  ${sqlText(email)},
  ${sqlText(username)},
  ${sqlText(displayName)},
  ${sqlText(passwordHash)},
  'admin',
  CURRENT_TIMESTAMP,
  'active',
  1,
  'pbkdf2-sha256-hmacpepper-v1',
  CURRENT_TIMESTAMP,
  ${sqlText(locale)},
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO auth_audit_events (
  id,
  user_id,
  event_type,
  outcome,
  metadata_json
) VALUES (
  ${sqlText(auditId)},
  ${sqlText(userId)},
  'register',
  'success',
  ${sqlText(metadata)}
);

COMMIT;
`;

fs.writeFileSync(OUTPUT_PATH, sql, { mode: 0o600, flag: "wx" });
console.log("One-time admin bootstrap SQL prepared without printing account credentials.");
