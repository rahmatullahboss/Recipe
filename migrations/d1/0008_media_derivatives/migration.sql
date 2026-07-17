PRAGMA foreign_keys = ON;

ALTER TABLE media_assets ADD COLUMN source_orientation INTEGER NOT NULL DEFAULT 1
  CHECK (source_orientation BETWEEN 1 AND 8);
ALTER TABLE media_assets ADD COLUMN normalized_width INTEGER;
ALTER TABLE media_assets ADD COLUMN normalized_height INTEGER;
ALTER TABLE media_assets ADD COLUMN original_deleted_at TEXT;

UPDATE media_assets
SET normalized_width = width,
    normalized_height = height
WHERE normalized_width IS NULL OR normalized_height IS NULL;

CREATE TABLE media_derivative_jobs (
  media_id TEXT PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'ready', 'failed', 'cleanup_pending', 'cleaned')),
  generation_token TEXT UNIQUE,
  lock_expires_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  required_variant_count INTEGER NOT NULL DEFAULT 0 CHECK (required_variant_count >= 0),
  ready_variant_count INTEGER NOT NULL DEFAULT 0 CHECK (ready_variant_count >= 0),
  optional_variant_count INTEGER NOT NULL DEFAULT 0 CHECK (optional_variant_count >= 0),
  last_error_code TEXT,
  last_error_message TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_media_derivative_jobs_status
  ON media_derivative_jobs(status, updated_at ASC);
CREATE INDEX idx_media_derivative_jobs_policy
  ON media_derivative_jobs(policy_version, source_sha256);

CREATE TABLE media_derivatives (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  policy_version TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  variant_width INTEGER NOT NULL CHECK (variant_width BETWEEN 1 AND 4096),
  format TEXT NOT NULL CHECK (format IN ('jpeg', 'webp', 'avif')),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/webp', 'image/avif')),
  r2_key TEXT NOT NULL UNIQUE,
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 4096),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 4096),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 TEXT NOT NULL,
  storage_etag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'failed', 'deleting')),
  generation_token TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (media_id, policy_version, source_sha256, variant_width, format)
);

CREATE INDEX idx_media_derivatives_public_lookup
  ON media_derivatives(media_id, status, variant_width, format);
CREATE INDEX idx_media_derivatives_cleanup
  ON media_derivatives(media_id, policy_version, source_sha256, status);

INSERT INTO media_derivative_jobs (
  media_id,
  policy_version,
  source_sha256,
  status,
  created_at,
  updated_at
)
SELECT
  id,
  'recipe-images-v1',
  sha256,
  'pending',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM media_assets
WHERE upload_status = 'uploaded'
  AND sha256 IS NOT NULL
ON CONFLICT(media_id) DO NOTHING;

CREATE TRIGGER media_assets_derivatives_require_cleanup_after_moderation
AFTER UPDATE OF moderation_status ON media_assets
WHEN NEW.moderation_status IN ('rejected', 'quarantined')
  AND OLD.moderation_status <> NEW.moderation_status
BEGIN
  UPDATE media_derivative_jobs
  SET status = 'cleanup_pending',
      generation_token = NULL,
      lock_expires_at = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE media_id = NEW.id;

  UPDATE media_derivatives
  SET status = 'deleting',
      updated_at = CURRENT_TIMESTAMP
  WHERE media_id = NEW.id;
END;

CREATE TRIGGER media_assets_derivatives_require_cleanup_after_delete
AFTER UPDATE OF upload_status ON media_assets
WHEN NEW.upload_status = 'deleted'
  AND OLD.upload_status <> NEW.upload_status
BEGIN
  UPDATE media_derivative_jobs
  SET status = 'cleanup_pending',
      generation_token = NULL,
      lock_expires_at = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE media_id = NEW.id;

  UPDATE media_derivatives
  SET status = 'deleting',
      updated_at = CURRENT_TIMESTAMP
  WHERE media_id = NEW.id;
END;

CREATE TRIGGER media_assets_derivatives_regenerate_after_source_change
AFTER UPDATE OF sha256 ON media_assets
WHEN OLD.sha256 IS NOT NEW.sha256
  AND NEW.sha256 IS NOT NULL
BEGIN
  INSERT INTO media_derivative_jobs (
    media_id,
    policy_version,
    source_sha256,
    status,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    'recipe-images-v1',
    NEW.sha256,
    'pending',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(media_id) DO UPDATE SET
    policy_version = excluded.policy_version,
    source_sha256 = excluded.source_sha256,
    status = 'pending',
    generation_token = NULL,
    lock_expires_at = NULL,
    ready_variant_count = 0,
    optional_variant_count = 0,
    last_error_code = NULL,
    last_error_message = NULL,
    completed_at = NULL,
    updated_at = CURRENT_TIMESTAMP;

  UPDATE media_derivatives
  SET status = 'deleting',
      updated_at = CURRENT_TIMESTAMP
  WHERE media_id = NEW.id
    AND source_sha256 <> NEW.sha256;
END;
