PRAGMA foreign_keys = ON;

CREATE TABLE recipe_change_sets (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'review',
    'changes_requested',
    'approved',
    'cancelled',
    'superseded'
  )),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  base_recipe_revision INTEGER NOT NULL CHECK (base_recipe_revision >= 1),
  base_content_revision INTEGER NOT NULL CHECK (base_content_revision >= 1),
  resulting_recipe_revision INTEGER CHECK (resulting_recipe_revision IS NULL OR resulting_recipe_revision >= 1),
  media_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  base_content_json TEXT NOT NULL CHECK (length(base_content_json) BETWEEN 2 AND 100000),
  content_json TEXT NOT NULL CHECK (length(content_json) BETWEEN 2 AND 100000),
  contributor_note TEXT,
  editorial_reason TEXT,
  submitted_at TEXT,
  reviewed_at TEXT,
  promoted_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_recipe_change_sets_one_active_per_recipe
  ON recipe_change_sets(recipe_id)
  WHERE status IN ('draft', 'review', 'changes_requested');

CREATE UNIQUE INDEX idx_recipe_change_sets_active_media
  ON recipe_change_sets(media_asset_id)
  WHERE media_asset_id IS NOT NULL
    AND status IN ('draft', 'review', 'changes_requested');

CREATE INDEX idx_recipe_change_sets_owner
  ON recipe_change_sets(owner_id, status, updated_at DESC);

CREATE INDEX idx_recipe_change_sets_editorial_queue
  ON recipe_change_sets(status, submitted_at ASC, created_at ASC);

CREATE INDEX idx_recipe_change_sets_recipe_history
  ON recipe_change_sets(recipe_id, created_at DESC);

CREATE TABLE recipe_change_set_events (
  id TEXT PRIMARY KEY,
  change_set_id TEXT NOT NULL REFERENCES recipe_change_sets(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'create',
    'save',
    'submit',
    'request_changes',
    'cancel',
    'approve'
  )),
  previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN (
    'draft',
    'review',
    'changes_requested',
    'approved',
    'cancelled',
    'superseded'
  )),
  next_status TEXT NOT NULL CHECK (next_status IN (
    'draft',
    'review',
    'changes_requested',
    'approved',
    'cancelled',
    'superseded'
  )),
  change_set_revision INTEGER NOT NULL CHECK (change_set_revision >= 1),
  base_recipe_revision INTEGER NOT NULL CHECK (base_recipe_revision >= 1),
  resulting_recipe_revision INTEGER CHECK (resulting_recipe_revision IS NULL OR resulting_recipe_revision >= 1),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipe_change_set_events_change_set
  ON recipe_change_set_events(change_set_id, created_at DESC);

CREATE INDEX idx_recipe_change_set_events_recipe
  ON recipe_change_set_events(recipe_id, created_at DESC);

CREATE TRIGGER recipe_change_sets_require_published_owner_insert
BEFORE INSERT ON recipe_change_sets
WHEN NEW.status IN ('draft', 'review', 'changes_requested')
  AND NOT EXISTS (
    SELECT 1 FROM recipes r
    WHERE r.id = NEW.recipe_id
      AND r.author_id = NEW.owner_id
      AND r.status = 'published'
  )
BEGIN
  SELECT RAISE(ABORT, 'active change set requires an owner-matched published recipe');
END;

CREATE TRIGGER recipe_change_sets_require_published_owner_update
BEFORE UPDATE OF recipe_id, owner_id, status ON recipe_change_sets
WHEN NEW.status IN ('draft', 'review', 'changes_requested')
  AND NOT EXISTS (
    SELECT 1 FROM recipes r
    WHERE r.id = NEW.recipe_id
      AND r.author_id = NEW.owner_id
      AND r.status = 'published'
  )
BEGIN
  SELECT RAISE(ABORT, 'active change set requires an owner-matched published recipe');
END;

CREATE TRIGGER recipe_change_sets_media_not_assigned_elsewhere_insert
BEFORE INSERT ON recipe_change_sets
WHEN NEW.media_asset_id IS NOT NULL
  AND NEW.status IN ('draft', 'review', 'changes_requested')
  AND EXISTS (
    SELECT 1 FROM recipes r
    WHERE r.media_asset_id = NEW.media_asset_id
      AND r.id <> NEW.recipe_id
  )
BEGIN
  SELECT RAISE(ABORT, 'change-set media is assigned to another recipe');
END;

CREATE TRIGGER recipe_change_sets_media_not_assigned_elsewhere_update
BEFORE UPDATE OF recipe_id, media_asset_id, status ON recipe_change_sets
WHEN NEW.media_asset_id IS NOT NULL
  AND NEW.status IN ('draft', 'review', 'changes_requested')
  AND EXISTS (
    SELECT 1 FROM recipes r
    WHERE r.media_asset_id = NEW.media_asset_id
      AND r.id <> NEW.recipe_id
  )
BEGIN
  SELECT RAISE(ABORT, 'change-set media is assigned to another recipe');
END;

CREATE TRIGGER recipes_media_not_reserved_by_change_set_insert
BEFORE INSERT ON recipes
WHEN NEW.media_asset_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM recipe_change_sets cs
    WHERE cs.media_asset_id = NEW.media_asset_id
      AND cs.recipe_id <> NEW.id
      AND cs.status IN ('draft', 'review', 'changes_requested')
  )
BEGIN
  SELECT RAISE(ABORT, 'recipe media is reserved by an active change set');
END;

CREATE TRIGGER recipes_media_not_reserved_by_change_set_update
BEFORE UPDATE OF media_asset_id ON recipes
WHEN NEW.media_asset_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM recipe_change_sets cs
    WHERE cs.media_asset_id = NEW.media_asset_id
      AND cs.recipe_id <> NEW.id
      AND cs.status IN ('draft', 'review', 'changes_requested')
  )
BEGIN
  SELECT RAISE(ABORT, 'recipe media is reserved by an active change set');
END;
