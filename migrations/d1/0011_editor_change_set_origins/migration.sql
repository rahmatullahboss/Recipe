PRAGMA foreign_keys = ON;

CREATE TABLE recipe_change_set_origins (
  change_set_id TEXT PRIMARY KEY REFERENCES recipe_change_sets(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'editor_current',
    'revision_snapshot',
    'approved_change_set_proposed',
    'approved_change_set_baseline'
  )),
  source_snapshot_id TEXT,
  source_change_set_id TEXT,
  source_content_revision INTEGER CHECK (source_content_revision IS NULL OR source_content_revision >= 1),
  media_fallback_applied INTEGER NOT NULL DEFAULT 0 CHECK (media_fallback_applied IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (source_type = 'editor_current' AND source_snapshot_id IS NULL AND source_change_set_id IS NULL)
    OR
    (source_type = 'revision_snapshot' AND source_snapshot_id IS NOT NULL AND source_change_set_id IS NULL)
    OR
    (source_type IN ('approved_change_set_proposed', 'approved_change_set_baseline')
      AND source_snapshot_id IS NULL AND source_change_set_id IS NOT NULL)
  )
);

CREATE INDEX idx_recipe_change_set_origins_source_snapshot
  ON recipe_change_set_origins(source_snapshot_id)
  WHERE source_snapshot_id IS NOT NULL;

CREATE INDEX idx_recipe_change_set_origins_source_change_set
  ON recipe_change_set_origins(source_change_set_id)
  WHERE source_change_set_id IS NOT NULL;

CREATE INDEX idx_recipe_change_set_origins_creator
  ON recipe_change_set_origins(created_by, created_at DESC);

CREATE TRIGGER recipe_change_set_origins_immutable
BEFORE UPDATE ON recipe_change_set_origins
BEGIN
  SELECT RAISE(ABORT, 'recipe change-set origin records are immutable');
END;

CREATE TRIGGER recipe_change_set_origins_require_editor_creator
BEFORE INSERT ON recipe_change_set_origins
WHEN NOT EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = NEW.created_by
    AND u.role IN ('editor', 'admin')
)
BEGIN
  SELECT RAISE(ABORT, 'recipe change-set origin requires an editor or admin creator');
END;

CREATE TRIGGER recipe_change_set_origins_match_change_set_creator
BEFORE INSERT ON recipe_change_set_origins
WHEN NOT EXISTS (
  SELECT 1 FROM recipe_change_sets cs
  WHERE cs.id = NEW.change_set_id
    AND cs.created_by = NEW.created_by
)
BEGIN
  SELECT RAISE(ABORT, 'recipe change-set origin creator must match the change-set creator');
END;
