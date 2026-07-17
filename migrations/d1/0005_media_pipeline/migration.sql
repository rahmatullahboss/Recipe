PRAGMA foreign_keys = ON;

ALTER TABLE media_assets ADD COLUMN original_filename TEXT;
ALTER TABLE media_assets ADD COLUMN purpose TEXT NOT NULL DEFAULT 'recipe_hero'
  CHECK (purpose IN ('recipe_hero', 'recipe_step', 'avatar'));
ALTER TABLE media_assets ADD COLUMN upload_status TEXT NOT NULL DEFAULT 'uploaded'
  CHECK (upload_status IN ('pending', 'uploaded', 'failed', 'deleted'));
ALTER TABLE media_assets ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'quarantined'));
ALTER TABLE media_assets ADD COLUMN sha256 TEXT;
ALTER TABLE media_assets ADD COLUMN storage_etag TEXT;
ALTER TABLE media_assets ADD COLUMN moderation_reason TEXT;
ALTER TABLE media_assets ADD COLUMN moderated_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE media_assets ADD COLUMN moderated_at TEXT;
ALTER TABLE media_assets ADD COLUMN uploaded_at TEXT;
ALTER TABLE media_assets ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_media_assets_owner_created
  ON media_assets(owner_id, created_at DESC);
CREATE INDEX idx_media_assets_moderation
  ON media_assets(moderation_status, upload_status, created_at ASC);
CREATE INDEX idx_media_assets_sha256
  ON media_assets(sha256, owner_id);

CREATE TABLE media_upload_intents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 8388608),
  purpose TEXT NOT NULL DEFAULT 'recipe_hero'
    CHECK (purpose IN ('recipe_hero', 'recipe_step', 'avatar')),
  alt_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'consumed', 'uploaded', 'failed', 'expired')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_media_upload_intents_owner
  ON media_upload_intents(owner_id, status, created_at DESC);
CREATE INDEX idx_media_upload_intents_expiry
  ON media_upload_intents(status, expires_at);

CREATE TABLE media_moderation_events (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  moderator_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  previous_status TEXT NOT NULL
    CHECK (previous_status IN ('pending', 'approved', 'rejected', 'quarantined')),
  next_status TEXT NOT NULL
    CHECK (next_status IN ('pending', 'approved', 'rejected', 'quarantined')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_media_moderation_events_asset
  ON media_moderation_events(media_id, created_at DESC);
CREATE INDEX idx_media_moderation_events_moderator
  ON media_moderation_events(moderator_id, created_at DESC);
