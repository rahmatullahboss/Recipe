PRAGMA foreign_keys = ON;

CREATE TABLE recipe_change_set_rebases (
  id TEXT PRIMARY KEY,
  change_set_id TEXT NOT NULL REFERENCES recipe_change_sets(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  strategy_version TEXT NOT NULL DEFAULT 'recipe-three-way-v1' CHECK (strategy_version = 'recipe-three-way-v1'),
  previous_change_set_revision INTEGER NOT NULL CHECK (previous_change_set_revision >= 1),
  resulting_change_set_revision INTEGER NOT NULL CHECK (resulting_change_set_revision > previous_change_set_revision),
  previous_base_recipe_revision INTEGER NOT NULL CHECK (previous_base_recipe_revision >= 1),
  previous_base_content_revision INTEGER NOT NULL CHECK (previous_base_content_revision >= 1),
  resulting_base_recipe_revision INTEGER NOT NULL CHECK (resulting_base_recipe_revision >= 1),
  resulting_base_content_revision INTEGER NOT NULL CHECK (resulting_base_content_revision >= 1),
  proposal_only_count INTEGER NOT NULL DEFAULT 0 CHECK (proposal_only_count >= 0),
  live_only_count INTEGER NOT NULL DEFAULT 0 CHECK (live_only_count >= 0),
  same_change_count INTEGER NOT NULL DEFAULT 0 CHECK (same_change_count >= 0),
  conflict_count INTEGER NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  resolution_json TEXT NOT NULL CHECK (length(resolution_json) BETWEEN 2 AND 20000),
  previous_base_content_json TEXT NOT NULL CHECK (length(previous_base_content_json) BETWEEN 2 AND 100000),
  live_content_json TEXT NOT NULL CHECK (length(live_content_json) BETWEEN 2 AND 100000),
  previous_proposed_content_json TEXT NOT NULL CHECK (length(previous_proposed_content_json) BETWEEN 2 AND 100000),
  resulting_proposed_content_json TEXT NOT NULL CHECK (length(resulting_proposed_content_json) BETWEEN 2 AND 100000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipe_change_set_rebases_change_set
  ON recipe_change_set_rebases(change_set_id, created_at DESC);

CREATE INDEX idx_recipe_change_set_rebases_recipe
  ON recipe_change_set_rebases(recipe_id, created_at DESC);

CREATE INDEX idx_recipe_change_set_rebases_actor
  ON recipe_change_set_rebases(actor_id, created_at DESC);

CREATE TRIGGER recipe_change_set_rebases_immutable
BEFORE UPDATE ON recipe_change_set_rebases
BEGIN
  SELECT RAISE(ABORT, 'recipe change-set rebase records are immutable');
END;

CREATE TRIGGER recipe_change_set_rebases_require_resulting_state
BEFORE INSERT ON recipe_change_set_rebases
WHEN NOT EXISTS (
  SELECT 1
  FROM recipe_change_sets cs
  WHERE cs.id = NEW.change_set_id
    AND cs.recipe_id = NEW.recipe_id
    AND cs.revision = NEW.resulting_change_set_revision
    AND cs.base_recipe_revision = NEW.resulting_base_recipe_revision
    AND cs.base_content_revision = NEW.resulting_base_content_revision
    AND cs.base_content_json = NEW.live_content_json
    AND cs.content_json = NEW.resulting_proposed_content_json
)
BEGIN
  SELECT RAISE(ABORT, 'recipe change-set rebase must match the resulting private state');
END;