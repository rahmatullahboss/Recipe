INSERT INTO categories (id, name, slug, type, sort_order) VALUES
  ('cat-dessert', 'Dessert', 'dessert', 'meal', 3),
  ('cat-canadian', 'Canadian', 'canadian', 'cuisine', 11),
  ('cat-new-zealand', 'New Zealand', 'new-zealand', 'cuisine', 12),
  ('cat-german', 'German', 'german', 'cuisine', 13),
  ('cat-swiss', 'Swiss', 'swiss', 'cuisine', 14),
  ('cat-swedish', 'Swedish', 'swedish', 'cuisine', 15),
  ('cat-dutch', 'Dutch', 'dutch', 'cuisine', 16);

INSERT INTO recipes (
  id, author_id, title, slug, summary, description, image_url,
  country_code, language_code, measurement_system, prep_minutes, cook_minutes, servings, difficulty,
  status, is_featured, average_rating, rating_count, save_count, view_count, published_at
) VALUES
  (
    'recipe-ca-butter-tarts', 'user-editor-1', 'Canadian Butter Tarts', 'canadian-butter-tarts',
    'Flaky pastry shells filled with a glossy brown-sugar and butter centre.',
    'A Canadian bakery favourite with a tender crust and a softly set filling.',
    'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=1400&q=84',
    'CA', 'en', 'metric', 30, 22, 12, 'medium', 'published', 1, 4.8, 126, 940, 12100, CURRENT_TIMESTAMP
  ),
  (
    'recipe-nz-pavlova', 'user-editor-1', 'New Zealand Pavlova', 'new-zealand-pavlova',
    'A crisp meringue shell with a soft centre, cream, and fresh fruit.',
    'A celebratory New Zealand-style pavlova with a delicate crust and marshmallow-soft interior.',
    'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1400&q=84',
    'NZ', 'en', 'metric', 25, 75, 8, 'medium', 'published', 1, 4.9, 138, 1070, 13900, CURRENT_TIMESTAMP
  ),
  (
    'recipe-de-german-potato-salad', 'user-editor-1', 'Warm German Potato Salad', 'warm-german-potato-salad',
    'Tender potatoes in a tangy mustard dressing with herbs and crisp bacon.',
    'A warm German-style potato salad built around a savoury vinegar dressing.',
    'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1400&q=84',
    'DE', 'en', 'metric', 20, 30, 6, 'easy', 'published', 0, 4.7, 104, 760, 9800, CURRENT_TIMESTAMP
  ),
  (
    'recipe-ch-rosti', 'user-editor-1', 'Crisp Swiss Rösti', 'crisp-swiss-rosti',
    'A deeply golden Swiss potato cake with a crisp shell and tender centre.',
    'A straightforward rösti technique using chilled potatoes for reliable structure.',
    'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?auto=format&fit=crop&w=1400&q=84',
    'CH', 'en', 'metric', 15, 25, 4, 'easy', 'published', 0, 4.7, 89, 640, 8600, CURRENT_TIMESTAMP
  ),
  (
    'recipe-se-swedish-meatballs', 'user-editor-1', 'Swedish Meatballs with Cream Sauce', 'swedish-meatballs-cream-sauce',
    'Tender spiced meatballs with silky gravy, potatoes, and lingonberry preserves.',
    'A homestyle Swedish dinner with softly seasoned meatballs and a smooth pan sauce.',
    'https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=1400&q=84',
    'SE', 'en', 'metric', 30, 30, 5, 'medium', 'published', 0, 4.8, 171, 1110, 15400, CURRENT_TIMESTAMP
  ),
  (
    'recipe-nl-dutch-apple-pie', 'user-editor-1', 'Dutch Apple Pie', 'dutch-apple-pie',
    'A tall spiced apple pie with a buttery crust and woven pastry top.',
    'A Dutch-style apple pie with a generous fruit filling, warm spice, and sturdy pastry.',
    'https://images.unsplash.com/photo-1568571780765-9276ac8b75a2?auto=format&fit=crop&w=1400&q=84',
    'NL', 'en', 'metric', 40, 60, 10, 'medium', 'published', 0, 4.8, 119, 890, 11700, CURRENT_TIMESTAMP
  );

INSERT INTO recipe_categories (recipe_id, category_id) VALUES
  ('recipe-ca-butter-tarts', 'cat-canadian'),
  ('recipe-ca-butter-tarts', 'cat-baking'),
  ('recipe-ca-butter-tarts', 'cat-dessert'),
  ('recipe-nz-pavlova', 'cat-new-zealand'),
  ('recipe-nz-pavlova', 'cat-baking'),
  ('recipe-nz-pavlova', 'cat-dessert'),
  ('recipe-de-german-potato-salad', 'cat-german'),
  ('recipe-de-german-potato-salad', 'cat-dinner'),
  ('recipe-de-german-potato-salad', 'cat-comfort'),
  ('recipe-ch-rosti', 'cat-swiss'),
  ('recipe-ch-rosti', 'cat-european'),
  ('recipe-ch-rosti', 'cat-breakfast'),
  ('recipe-se-swedish-meatballs', 'cat-swedish'),
  ('recipe-se-swedish-meatballs', 'cat-european'),
  ('recipe-se-swedish-meatballs', 'cat-comfort'),
  ('recipe-nl-dutch-apple-pie', 'cat-dutch'),
  ('recipe-nl-dutch-apple-pie', 'cat-baking'),
  ('recipe-nl-dutch-apple-pie', 'cat-dessert');

INSERT INTO recipe_ingredients (id, recipe_id, item, amount, unit, note, sort_order) VALUES
  ('ca-tart-1', 'recipe-ca-butter-tarts', 'Plain flour', '250', 'g', NULL, 1),
  ('ca-tart-2', 'recipe-ca-butter-tarts', 'Cold unsalted butter', '150', 'g', 'cubed', 2),
  ('ca-tart-3', 'recipe-ca-butter-tarts', 'Brown sugar', '220', 'g', NULL, 3),
  ('ca-tart-4', 'recipe-ca-butter-tarts', 'Melted butter', '60', 'g', NULL, 4),
  ('ca-tart-5', 'recipe-ca-butter-tarts', 'Large egg', '1', NULL, NULL, 5),
  ('nz-pav-1', 'recipe-nz-pavlova', 'Egg whites', '4', NULL, 'room temperature', 1),
  ('nz-pav-2', 'recipe-nz-pavlova', 'Caster sugar', '220', 'g', NULL, 2),
  ('nz-pav-3', 'recipe-nz-pavlova', 'Cornflour', '2', 'tsp', NULL, 3),
  ('nz-pav-4', 'recipe-nz-pavlova', 'Whipping cream', '300', 'ml', NULL, 4),
  ('de-salad-1', 'recipe-de-german-potato-salad', 'Waxy potatoes', '1', 'kg', 'scrubbed', 1),
  ('de-salad-2', 'recipe-de-german-potato-salad', 'Smoked bacon', '180', 'g', 'diced', 2),
  ('de-salad-3', 'recipe-de-german-potato-salad', 'Apple cider vinegar', '60', 'ml', NULL, 3),
  ('de-salad-4', 'recipe-de-german-potato-salad', 'Wholegrain mustard', '2', 'tbsp', NULL, 4),
  ('ch-rosti-1', 'recipe-ch-rosti', 'Waxy potatoes', '1', 'kg', 'parboiled and chilled', 1),
  ('ch-rosti-2', 'recipe-ch-rosti', 'Butter', '50', 'g', NULL, 2),
  ('ch-rosti-3', 'recipe-ch-rosti', 'Neutral oil', '1', 'tbsp', NULL, 3),
  ('se-ball-1', 'recipe-se-swedish-meatballs', 'Beef mince', '400', 'g', NULL, 1),
  ('se-ball-2', 'recipe-se-swedish-meatballs', 'Pork mince', '250', 'g', NULL, 2),
  ('se-ball-3', 'recipe-se-swedish-meatballs', 'Fresh breadcrumbs', '0.75', 'cup', NULL, 3),
  ('se-ball-4', 'recipe-se-swedish-meatballs', 'Double cream', '200', 'ml', NULL, 4),
  ('nl-pie-1', 'recipe-nl-dutch-apple-pie', 'Plain flour', '350', 'g', NULL, 1),
  ('nl-pie-2', 'recipe-nl-dutch-apple-pie', 'Cold butter', '225', 'g', 'cubed', 2),
  ('nl-pie-3', 'recipe-nl-dutch-apple-pie', 'Firm apples', '1.5', 'kg', 'peeled and sliced', 3),
  ('nl-pie-4', 'recipe-nl-dutch-apple-pie', 'Ground cinnamon', '2', 'tsp', NULL, 4);

INSERT INTO recipe_steps (id, recipe_id, instruction, timer_seconds, sort_order) VALUES
  ('ca-tart-step-1', 'recipe-ca-butter-tarts', 'Make and chill the pastry, then roll and press rounds into a tart tin.', 1200, 1),
  ('ca-tart-step-2', 'recipe-ca-butter-tarts', 'Whisk the filling ingredients until glossy and divide among the pastry shells.', NULL, 2),
  ('ca-tart-step-3', 'recipe-ca-butter-tarts', 'Bake at 190°C until the pastry is golden and the centres still tremble slightly.', 1320, 3),
  ('nz-pav-step-1', 'recipe-nz-pavlova', 'Whisk the egg whites and gradually add sugar until the meringue is thick and glossy.', 600, 1),
  ('nz-pav-step-2', 'recipe-nz-pavlova', 'Shape the meringue and bake at 130°C until dry outside, then cool in the oven.', 4500, 2),
  ('nz-pav-step-3', 'recipe-nz-pavlova', 'Top with softly whipped cream and fresh fruit immediately before serving.', NULL, 3),
  ('de-salad-step-1', 'recipe-de-german-potato-salad', 'Boil the potatoes until tender, then drain and slice while still warm.', 1200, 1),
  ('de-salad-step-2', 'recipe-de-german-potato-salad', 'Cook the bacon and onion, then simmer vinegar, stock, and mustard into a dressing.', 900, 2),
  ('de-salad-step-3', 'recipe-de-german-potato-salad', 'Fold the warm potatoes through the dressing and finish with parsley.', NULL, 3),
  ('ch-rosti-step-1', 'recipe-ch-rosti', 'Coarsely grate the chilled potatoes and season them evenly.', NULL, 1),
  ('ch-rosti-step-2', 'recipe-ch-rosti', 'Press the potatoes into a hot buttered pan and cook until deeply golden on both sides.', 1500, 2),
  ('se-ball-step-1', 'recipe-se-swedish-meatballs', 'Mix the soaked breadcrumbs with the meat, onion, egg, and spices.', 600, 1),
  ('se-ball-step-2', 'recipe-se-swedish-meatballs', 'Roll into small balls, brown in batches, and finish them in a creamy pan sauce.', 1500, 2),
  ('nl-pie-step-1', 'recipe-nl-dutch-apple-pie', 'Make and chill a firm pastry, then line a deep springform tin.', 1800, 1),
  ('nl-pie-step-2', 'recipe-nl-dutch-apple-pie', 'Fill with the spiced apples and arrange pastry strips over the top.', NULL, 2),
  ('nl-pie-step-3', 'recipe-nl-dutch-apple-pie', 'Bake at 180°C until deeply golden, then cool completely before slicing.', 3600, 3);
