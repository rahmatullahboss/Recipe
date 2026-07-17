INSERT INTO users (id, email, username, display_name, role)
VALUES ('user-editor-1', 'editor@ozzylrecipes.local', 'ozzyl-test-kitchen', 'Ozzyl Test Kitchen', 'editor');

INSERT INTO categories (id, name, slug, type, sort_order) VALUES
  ('cat-dinner', 'Dinner', 'dinner', 'meal', 1),
  ('cat-breakfast', 'Breakfast', 'breakfast', 'meal', 2),
  ('cat-quick', 'Quick & Easy', 'quick-and-easy', 'collection', 3),
  ('cat-baking', 'Baking', 'baking', 'method', 4),
  ('cat-comfort', 'Comfort Food', 'comfort-food', 'collection', 5),
  ('cat-american', 'American', 'american', 'cuisine', 6),
  ('cat-british', 'British', 'british', 'cuisine', 7),
  ('cat-french', 'French', 'french', 'cuisine', 8),
  ('cat-australian', 'Australian', 'australian', 'cuisine', 9),
  ('cat-european', 'European', 'european', 'cuisine', 10);

INSERT INTO recipes (
  id, author_id, title, slug, summary, description, image_url,
  country_code, language_code, measurement_system, prep_minutes, cook_minutes, servings, difficulty,
  status, is_featured, average_rating, rating_count, save_count, view_count, published_at
) VALUES
  (
    'recipe-us-chocolate-chip-cookies', 'user-editor-1', 'Classic Chocolate Chip Cookies', 'classic-chocolate-chip-cookies',
    'Crisp-edged, chewy-centred cookies with plenty of chocolate in every bite.',
    'A dependable American-style cookie recipe developed for repeatable results.',
    'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=1400&q=84',
    'US', 'en', 'us', 20, 12, 18, 'easy', 'published', 1, 4.9, 384, 2410, 28600, CURRENT_TIMESTAMP
  ),
  (
    'recipe-gb-cottage-pie', 'user-editor-1', 'Traditional Cottage Pie', 'traditional-cottage-pie',
    'Rich minced beef and vegetables under a golden, buttery mashed-potato topping.',
    'A classic British comfort-food dinner with a deeply savoury filling.',
    'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?auto=format&fit=crop&w=1400&q=84',
    'GB', 'en', 'metric', 25, 55, 6, 'medium', 'published', 1, 4.8, 219, 1320, 19400, CURRENT_TIMESTAMP
  ),
  (
    'recipe-fr-chicken-provencal', 'user-editor-1', 'Chicken Provençal', 'chicken-provencal',
    'Chicken braised with tomatoes, olives, garlic, and herbs from southern France.',
    'A rustic French one-pan meal with bright Mediterranean flavour.',
    'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=1400&q=84',
    'FR', 'en', 'metric', 20, 45, 4, 'medium', 'published', 1, 4.7, 112, 870, 10800, CURRENT_TIMESTAMP
  ),
  (
    'recipe-au-chicken-parmigiana', 'user-editor-1', 'Australian Chicken Parmigiana', 'australian-chicken-parmigiana',
    'Crunchy chicken schnitzel topped with tomato sauce, ham, and bubbling cheese.',
    'An Australian pub favourite made at home with a crisp crumb.',
    'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=1400&q=84',
    'AU', 'en', 'metric', 25, 30, 4, 'medium', 'published', 1, 4.8, 146, 980, 13200, CURRENT_TIMESTAMP
  );

INSERT INTO recipe_categories (recipe_id, category_id) VALUES
  ('recipe-us-chocolate-chip-cookies', 'cat-baking'),
  ('recipe-us-chocolate-chip-cookies', 'cat-american'),
  ('recipe-gb-cottage-pie', 'cat-dinner'),
  ('recipe-gb-cottage-pie', 'cat-comfort'),
  ('recipe-gb-cottage-pie', 'cat-british'),
  ('recipe-fr-chicken-provencal', 'cat-dinner'),
  ('recipe-fr-chicken-provencal', 'cat-french'),
  ('recipe-au-chicken-parmigiana', 'cat-dinner'),
  ('recipe-au-chicken-parmigiana', 'cat-comfort'),
  ('recipe-au-chicken-parmigiana', 'cat-australian');

INSERT INTO recipe_ingredients (id, recipe_id, item, amount, unit, note, sort_order) VALUES
  ('us-cookie-1', 'recipe-us-chocolate-chip-cookies', 'All-purpose flour', '2.25', 'cups', NULL, 1),
  ('us-cookie-2', 'recipe-us-chocolate-chip-cookies', 'Unsalted butter', '1', 'cup', 'softened', 2),
  ('us-cookie-3', 'recipe-us-chocolate-chip-cookies', 'Brown sugar', '0.75', 'cup', 'packed', 3),
  ('us-cookie-4', 'recipe-us-chocolate-chip-cookies', 'Large eggs', '2', NULL, NULL, 4),
  ('us-cookie-5', 'recipe-us-chocolate-chip-cookies', 'Chocolate chips', '2', 'cups', NULL, 5),
  ('gb-pie-1', 'recipe-gb-cottage-pie', 'Beef mince', '750', 'g', NULL, 1),
  ('gb-pie-2', 'recipe-gb-cottage-pie', 'Onion', '1', NULL, 'finely chopped', 2),
  ('gb-pie-3', 'recipe-gb-cottage-pie', 'Carrots', '2', NULL, 'diced', 3),
  ('gb-pie-4', 'recipe-gb-cottage-pie', 'Beef stock', '400', 'ml', NULL, 4),
  ('gb-pie-5', 'recipe-gb-cottage-pie', 'Potatoes', '1.2', 'kg', 'peeled and chopped', 5),
  ('fr-prov-1', 'recipe-fr-chicken-provencal', 'Chicken thighs', '8', NULL, 'bone-in, skin-on', 1),
  ('fr-prov-2', 'recipe-fr-chicken-provencal', 'Crushed tomatoes', '400', 'g', NULL, 2),
  ('fr-prov-3', 'recipe-fr-chicken-provencal', 'Black olives', '0.75', 'cup', NULL, 3),
  ('fr-prov-4', 'recipe-fr-chicken-provencal', 'Garlic', '5', 'cloves', 'sliced', 4),
  ('au-parma-1', 'recipe-au-chicken-parmigiana', 'Chicken breast fillets', '4', NULL, 'pounded evenly', 1),
  ('au-parma-2', 'recipe-au-chicken-parmigiana', 'Panko breadcrumbs', '2', 'cups', NULL, 2),
  ('au-parma-3', 'recipe-au-chicken-parmigiana', 'Tomato passata', '1.5', 'cups', NULL, 3),
  ('au-parma-4', 'recipe-au-chicken-parmigiana', 'Mozzarella', '200', 'g', 'grated', 4);

INSERT INTO recipe_steps (id, recipe_id, instruction, timer_seconds, sort_order) VALUES
  ('us-cookie-step-1', 'recipe-us-chocolate-chip-cookies', 'Heat the oven to 350°F (175°C) and line two baking sheets.', NULL, 1),
  ('us-cookie-step-2', 'recipe-us-chocolate-chip-cookies', 'Cream the butter and sugars, beat in the eggs, then fold in the dry ingredients and chocolate.', 180, 2),
  ('us-cookie-step-3', 'recipe-us-chocolate-chip-cookies', 'Bake until the edges are golden and the centres still look slightly soft.', 720, 3),
  ('gb-pie-step-1', 'recipe-gb-cottage-pie', 'Brown the beef, then soften the onion and carrots in the same pan.', 900, 1),
  ('gb-pie-step-2', 'recipe-gb-cottage-pie', 'Add stock and seasoning, then simmer until thick and glossy.', 1500, 2),
  ('gb-pie-step-3', 'recipe-gb-cottage-pie', 'Top with buttery mash and bake at 200°C until bubbling and golden.', 1500, 3),
  ('fr-prov-step-1', 'recipe-fr-chicken-provencal', 'Season and brown the chicken skin-side down until deeply golden.', 720, 1),
  ('fr-prov-step-2', 'recipe-fr-chicken-provencal', 'Add tomatoes, garlic, herbs, and stock, then simmer until tender.', 1800, 2),
  ('fr-prov-step-3', 'recipe-fr-chicken-provencal', 'Add the olives near the end and adjust the seasoning before serving.', 300, 3),
  ('au-parma-step-1', 'recipe-au-chicken-parmigiana', 'Coat the chicken in seasoned flour, beaten egg, and breadcrumbs.', NULL, 1),
  ('au-parma-step-2', 'recipe-au-chicken-parmigiana', 'Shallow-fry until crisp, then top with passata, ham, and mozzarella.', 600, 2),
  ('au-parma-step-3', 'recipe-au-chicken-parmigiana', 'Bake at 200°C until the cheese is golden and the chicken is cooked through.', 720, 3);
