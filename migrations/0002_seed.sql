INSERT INTO users (id, email, username, display_name, role)
VALUES ('user-editor-1', 'editor@ozzylrecipes.local', 'ozzyl-kitchen', 'Ozzyl Kitchen', 'editor');

INSERT INTO categories (id, name, slug, type, sort_order) VALUES
  ('cat-dinner', 'Dinner', 'dinner', 'meal', 1),
  ('cat-quick', 'Quick & Easy', 'quick-and-easy', 'collection', 2),
  ('cat-chicken', 'Chicken', 'chicken', 'ingredient', 3),
  ('cat-salad', 'Salads', 'salads', 'meal', 4),
  ('cat-bangladeshi', 'Bangladeshi', 'bangladeshi', 'cuisine', 5),
  ('cat-budget', 'Budget Friendly', 'budget-friendly', 'collection', 6);

INSERT INTO recipes (
  id, author_id, title, slug, summary, description, image_url,
  prep_minutes, cook_minutes, servings, difficulty, status,
  is_featured, average_rating, rating_count, save_count, view_count, published_at
) VALUES
  (
    'recipe-garlic-chicken', 'user-editor-1', 'Creamy Garlic Chicken', 'creamy-garlic-chicken',
    'Tender chicken in a rich garlic cream sauce, ready for a comforting weeknight dinner.',
    'A dependable one-pan chicken recipe with a silky sauce and simple pantry ingredients.',
    'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=1200&q=82',
    10, 25, 4, 'easy', 'published', 1, 4.8, 126, 842, 11840, CURRENT_TIMESTAMP
  ),
  (
    'recipe-mango-salad', 'user-editor-1', 'Fresh Mango Crunch Salad', 'fresh-mango-crunch-salad',
    'Sweet mango, crisp vegetables, herbs, and a bright lime dressing in fifteen minutes.',
    'A colorful no-cook salad that works as a light lunch or a refreshing side dish.',
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=82',
    15, 0, 4, 'easy', 'published', 1, 4.7, 78, 519, 7920, CURRENT_TIMESTAMP
  ),
  (
    'recipe-beef-tehari', 'user-editor-1', 'Classic Beef Tehari', 'classic-beef-tehari',
    'Fragrant rice, tender beef, green chilies, and warm spices in a beloved Bangladeshi meal.',
    'A carefully balanced tehari made for family lunches, celebrations, and special weekends.',
    'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=82',
    25, 70, 6, 'medium', 'published', 0, 4.9, 204, 1260, 18420, CURRENT_TIMESTAMP
  );

INSERT INTO recipe_categories (recipe_id, category_id) VALUES
  ('recipe-garlic-chicken', 'cat-dinner'),
  ('recipe-garlic-chicken', 'cat-quick'),
  ('recipe-garlic-chicken', 'cat-chicken'),
  ('recipe-mango-salad', 'cat-quick'),
  ('recipe-mango-salad', 'cat-salad'),
  ('recipe-mango-salad', 'cat-budget'),
  ('recipe-beef-tehari', 'cat-dinner'),
  ('recipe-beef-tehari', 'cat-bangladeshi');

INSERT INTO recipe_ingredients (id, recipe_id, item, amount, unit, note, sort_order) VALUES
  ('ing-gc-1', 'recipe-garlic-chicken', 'Boneless chicken breast', '600', 'g', 'cut into even pieces', 1),
  ('ing-gc-2', 'recipe-garlic-chicken', 'Garlic', '6', 'cloves', 'finely chopped', 2),
  ('ing-gc-3', 'recipe-garlic-chicken', 'Cooking cream', '1', 'cup', NULL, 3),
  ('ing-gc-4', 'recipe-garlic-chicken', 'Olive oil', '2', 'tbsp', NULL, 4),
  ('ing-gc-5', 'recipe-garlic-chicken', 'Salt and black pepper', NULL, NULL, 'to taste', 5),
  ('ing-ms-1', 'recipe-mango-salad', 'Ripe mango', '2', NULL, 'cubed', 1),
  ('ing-ms-2', 'recipe-mango-salad', 'Cucumber', '1', NULL, 'thinly sliced', 2),
  ('ing-ms-3', 'recipe-mango-salad', 'Red onion', '0.5', NULL, 'thinly sliced', 3),
  ('ing-ms-4', 'recipe-mango-salad', 'Fresh lime juice', '3', 'tbsp', NULL, 4),
  ('ing-ms-5', 'recipe-mango-salad', 'Fresh coriander', '0.25', 'cup', 'roughly chopped', 5),
  ('ing-bt-1', 'recipe-beef-tehari', 'Beef', '1', 'kg', 'medium pieces', 1),
  ('ing-bt-2', 'recipe-beef-tehari', 'Aromatic rice', '750', 'g', 'washed and drained', 2),
  ('ing-bt-3', 'recipe-beef-tehari', 'Onion', '4', NULL, 'thinly sliced', 3),
  ('ing-bt-4', 'recipe-beef-tehari', 'Plain yogurt', '0.5', 'cup', NULL, 4),
  ('ing-bt-5', 'recipe-beef-tehari', 'Green chilies', '8', NULL, 'whole', 5);

INSERT INTO recipe_steps (id, recipe_id, instruction, timer_seconds, sort_order) VALUES
  ('step-gc-1', 'recipe-garlic-chicken', 'Season the chicken with salt and pepper, then sear it in hot oil until golden on both sides.', 480, 1),
  ('step-gc-2', 'recipe-garlic-chicken', 'Lower the heat, add garlic, and cook until fragrant without browning it.', 60, 2),
  ('step-gc-3', 'recipe-garlic-chicken', 'Pour in the cream, return the chicken, and simmer gently until cooked through and the sauce thickens.', 720, 3),
  ('step-ms-1', 'recipe-mango-salad', 'Combine mango, cucumber, onion, and coriander in a large bowl.', NULL, 1),
  ('step-ms-2', 'recipe-mango-salad', 'Whisk lime juice with salt and a small pinch of sugar, then toss with the salad.', NULL, 2),
  ('step-ms-3', 'recipe-mango-salad', 'Rest for five minutes and serve immediately while the vegetables are crisp.', 300, 3),
  ('step-bt-1', 'recipe-beef-tehari', 'Brown the sliced onions, reserve a small portion, and cook the beef with yogurt and spices until nearly tender.', 2400, 1),
  ('step-bt-2', 'recipe-beef-tehari', 'Add the drained rice, measured hot water, green chilies, and salt.', 300, 2),
  ('step-bt-3', 'recipe-beef-tehari', 'Cover and cook on low heat until the rice is tender, then rest before gently fluffing and serving.', 1500, 3);
