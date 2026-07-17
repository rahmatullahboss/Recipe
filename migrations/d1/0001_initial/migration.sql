PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_key TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'editor', 'admin')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('meal', 'ingredient', 'cuisine', 'occasion', 'diet', 'collection', 'method')),
  parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  image_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  description TEXT,
  image_key TEXT,
  image_url TEXT,
  country_code TEXT NOT NULL DEFAULT 'GLOBAL',
  language_code TEXT NOT NULL DEFAULT 'en',
  measurement_system TEXT NOT NULL DEFAULT 'metric' CHECK (measurement_system IN ('us', 'metric')),
  prep_minutes INTEGER NOT NULL DEFAULT 0 CHECK (prep_minutes >= 0),
  cook_minutes INTEGER NOT NULL DEFAULT 0 CHECK (cook_minutes >= 0),
  servings INTEGER NOT NULL DEFAULT 1 CHECK (servings > 0),
  difficulty TEXT NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  average_rating REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  save_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recipe_localizations (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (recipe_id, language_code),
  UNIQUE (language_code, slug)
);

CREATE TABLE recipe_categories (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, category_id)
);

CREATE TABLE recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  amount TEXT,
  unit TEXT,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE recipe_steps (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  instruction TEXT NOT NULL,
  image_key TEXT,
  timer_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE recipe_nutrition (
  recipe_id TEXT PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  serving_label TEXT,
  calories_kcal REAL,
  protein_g REAL,
  carbohydrate_g REAL,
  fat_g REAL,
  saturated_fat_g REAL,
  fibre_g REAL,
  sugar_g REAL,
  sodium_mg REAL,
  source TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ratings (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  review TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (recipe_id, user_id)
);

CREATE TABLE saved_recipes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, recipe_id)
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('pending', 'published', 'hidden')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  byte_size INTEGER NOT NULL,
  alt_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipes_status_published ON recipes(status, published_at DESC);
CREATE INDEX idx_recipes_featured ON recipes(is_featured, published_at DESC);
CREATE INDEX idx_recipes_country ON recipes(country_code, status, is_featured DESC, published_at DESC);
CREATE INDEX idx_recipes_language ON recipes(language_code, status, published_at DESC);
CREATE INDEX idx_recipes_author ON recipes(author_id, created_at DESC);
CREATE INDEX idx_recipe_localizations_recipe ON recipe_localizations(recipe_id, language_code);
CREATE INDEX idx_recipe_categories_category ON recipe_categories(category_id, recipe_id);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id, sort_order);
CREATE INDEX idx_recipe_steps_recipe ON recipe_steps(recipe_id, sort_order);
CREATE INDEX idx_ratings_recipe ON ratings(recipe_id, created_at DESC);
CREATE INDEX idx_comments_recipe ON comments(recipe_id, created_at DESC);
