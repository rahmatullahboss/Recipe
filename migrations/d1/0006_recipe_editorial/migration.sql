PRAGMA foreign_keys = ON;

ALTER TABLE recipes ADD COLUMN media_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE recipes ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1);
ALTER TABLE recipes ADD COLUMN submitted_at TEXT;
ALTER TABLE recipes ADD COLUMN reviewed_at TEXT;
ALTER TABLE recipes ADD COLUMN editorial_actor_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE recipes ADD COLUMN editorial_reason TEXT;

CREATE UNIQUE INDEX idx_recipes_media_asset_unique ON recipes(media_asset_id) WHERE media_asset_id IS NOT NULL;
CREATE INDEX idx_recipes_editorial_queue ON recipes(status, submitted_at ASC, created_at ASC);
CREATE INDEX idx_recipes_author_status ON recipes(author_id, status, updated_at DESC);

CREATE TABLE recipe_editorial_events (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN ('draft', 'review', 'published', 'archived')),
  next_status TEXT NOT NULL CHECK (next_status IN ('draft', 'review', 'published', 'archived')),
  reason TEXT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipe_editorial_events_recipe ON recipe_editorial_events(recipe_id, created_at DESC);
CREATE INDEX idx_recipe_editorial_events_actor ON recipe_editorial_events(actor_id, created_at DESC);

CREATE TRIGGER recipes_record_initial_review_submission
AFTER INSERT ON recipes
WHEN NEW.status = 'review' AND NEW.editorial_actor_id IS NOT NULL
BEGIN
  INSERT INTO recipe_editorial_events (
    id, recipe_id, actor_id, previous_status, next_status, reason, revision, created_at
  ) VALUES (
    'recipe_event_' || NEW.id || '_' || NEW.revision || '_' || NEW.status,
    NEW.id,
    NEW.editorial_actor_id,
    NULL,
    NEW.status,
    NEW.editorial_reason,
    NEW.revision,
    COALESCE(NEW.submitted_at, CURRENT_TIMESTAMP)
  );
END;

CREATE TRIGGER recipes_record_editorial_transition
AFTER UPDATE OF status ON recipes
WHEN OLD.status <> NEW.status AND NEW.editorial_actor_id IS NOT NULL
BEGIN
  INSERT INTO recipe_editorial_events (
    id, recipe_id, actor_id, previous_status, next_status, reason, revision, created_at
  ) VALUES (
    'recipe_event_' || NEW.id || '_' || NEW.revision || '_' || NEW.status,
    NEW.id,
    NEW.editorial_actor_id,
    OLD.status,
    NEW.status,
    NEW.editorial_reason,
    NEW.revision,
    CURRENT_TIMESTAMP
  );
END;
