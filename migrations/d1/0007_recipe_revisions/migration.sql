PRAGMA foreign_keys = ON;

ALTER TABLE recipes ADD COLUMN content_revision INTEGER NOT NULL DEFAULT 1 CHECK (content_revision >= 1);
ALTER TABLE recipes ADD COLUMN change_requested_at TEXT;
ALTER TABLE recipes ADD COLUMN resubmitted_at TEXT;
ALTER TABLE recipes ADD COLUMN revision_write_token TEXT;

CREATE UNIQUE INDEX idx_recipes_revision_write_token
  ON recipes(revision_write_token)
  WHERE revision_write_token IS NOT NULL;

CREATE INDEX idx_recipes_contributor_revision
  ON recipes(author_id, status, change_requested_at DESC, updated_at DESC);

CREATE TABLE recipe_revision_snapshots (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  content_revision INTEGER NOT NULL CHECK (content_revision >= 1),
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('initial_submission', 'resubmission')),
  content_json TEXT NOT NULL CHECK (length(content_json) BETWEEN 2 AND 100000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (recipe_id, content_revision)
);

CREATE INDEX idx_recipe_revision_snapshots_recipe
  ON recipe_revision_snapshots(recipe_id, content_revision DESC);

CREATE INDEX idx_recipe_revision_snapshots_author
  ON recipe_revision_snapshots(author_id, created_at DESC);
