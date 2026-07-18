PRAGMA foreign_keys = ON;

ALTER TABLE recipes ADD COLUMN scheduled_publish_at TEXT;
ALTER TABLE recipes ADD COLUMN scheduled_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE recipes ADD COLUMN schedule_revision INTEGER CHECK (schedule_revision IS NULL OR schedule_revision >= 1);
ALTER TABLE recipes ADD COLUMN archived_at TEXT;
ALTER TABLE recipes ADD COLUMN restored_at TEXT;

CREATE INDEX idx_recipes_scheduled_publication
  ON recipes(status, scheduled_publish_at ASC, schedule_revision)
  WHERE scheduled_publish_at IS NOT NULL;

CREATE INDEX idx_recipes_archived_operations
  ON recipes(status, archived_at DESC, updated_at DESC)
  WHERE status = 'archived';

CREATE TABLE recipe_publication_events (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'schedule',
    'cancel_schedule',
    'published_now',
    'scheduled_published',
    'archive',
    'restore'
  )),
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 1),
  resulting_revision INTEGER NOT NULL CHECK (resulting_revision >= 1),
  scheduled_publish_at TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipe_publication_events_recipe
  ON recipe_publication_events(recipe_id, created_at DESC);

CREATE INDEX idx_recipe_publication_events_actor
  ON recipe_publication_events(actor_id, created_at DESC);
