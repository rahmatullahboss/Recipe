PRAGMA foreign_keys = ON;

-- Extend the original users table without rebuilding it or disturbing recipe
-- foreign keys. Public registrations start pending email verification.
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'pending_verification'
  CHECK (status IN ('pending_verification', 'active', 'locked', 'suspended', 'deleted'));
ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version > 0);
ALTER TABLE users ADD COLUMN password_algorithm TEXT NOT NULL DEFAULT 'pbkdf2-sha256-hmacpepper-v1';
ALTER TABLE users ADD COLUMN password_changed_at TEXT;
ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0);
ALTER TABLE users ADD COLUMN locked_until TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN preferred_locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE users ADD COLUMN deleted_at TEXT;

-- The seeded editorial account predates public registration and is considered
-- verified. It still cannot sign in until an administrator provisions a hash.
UPDATE users
SET status = 'active',
    email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
    password_changed_at = CASE
      WHEN password_hash IS NOT NULL THEN COALESCE(password_changed_at, CURRENT_TIMESTAMP)
      ELSE password_changed_at
    END
WHERE role IN ('editor', 'admin');

-- Original UNIQUE constraints are case-sensitive. These indexes enforce the
-- identity semantics expected by login and registration.
CREATE UNIQUE INDEX idx_users_email_nocase ON users(email COLLATE NOCASE);
CREATE UNIQUE INDEX idx_users_username_nocase ON users(username COLLATE NOCASE);
CREATE INDEX idx_users_status ON users(status, created_at DESC);
CREATE INDEX idx_users_email_verified ON users(email_verified_at, status);

-- Only token digests are stored. Plaintext verification/reset tokens exist
-- only long enough to be delivered to the account owner.
CREATE TABLE auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset', 'email_change')),
  token_hash TEXT NOT NULL UNIQUE,
  target_email TEXT,
  requested_ip_hash TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_tokens_user_purpose
  ON auth_tokens(user_id, purpose, created_at DESC);
CREATE INDEX idx_auth_tokens_expiry
  ON auth_tokens(expires_at, consumed_at);

-- Future OAuth providers can attach identities without changing the users
-- table or weakening local-password account uniqueness.
CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  provider_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, provider_subject),
  UNIQUE (user_id, provider)
);

CREATE INDEX idx_auth_identities_user ON auth_identities(user_id, provider);

CREATE TABLE user_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms', 'privacy', 'marketing', 'analytics')),
  document_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  UNIQUE (user_id, consent_type, document_version)
);

CREATE INDEX idx_user_consents_user
  ON user_consents(user_id, consent_type, accepted_at DESC);

-- Network and user-agent values are fingerprinted before insertion. Raw IP
-- addresses and full user-agent strings are intentionally excluded.
CREATE TABLE auth_audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'register',
    'email_verified',
    'login_succeeded',
    'login_failed',
    'logout',
    'password_changed',
    'password_reset_requested',
    'password_reset_completed',
    'account_locked',
    'account_unlocked',
    'session_revoked',
    'account_suspended',
    'account_deleted'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'blocked')),
  ip_hash TEXT,
  user_agent_hash TEXT,
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_audit_user
  ON auth_audit_events(user_id, created_at DESC);
CREATE INDEX idx_auth_audit_type
  ON auth_audit_events(event_type, created_at DESC);
CREATE INDEX idx_auth_audit_created
  ON auth_audit_events(created_at DESC);
