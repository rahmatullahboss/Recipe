const SHOPPING_KEY = "ozzyl:shopping-list:v1";
const MEAL_PLAN_KEY = "ozzyl:meal-plan:v1";

function safeRead(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("ozzyl:kitchen-state", { detail: { key, value } }));
}

function createId(prefix = "item") {
  return typeof crypto?.randomUUID === "function"
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normaliseText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function readShoppingItems() {
  const items = safeRead(SHOPPING_KEY, []);
  return Array.isArray(items) ? items.filter((item) => item && typeof item === "object") : [];
}

function writeShoppingItems(items) {
  safeWrite(SHOPPING_KEY, items.slice(0, 500));
  updateCounts();
}

function addShoppingItems(recipe) {
  const current = readShoppingItems();
  const incoming = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const existingKeys = new Set(current.map((item) => `${normaliseText(item.item).toLowerCase()}|${normaliseText(item.amount).toLowerCase()}|${normaliseText(item.unit).toLowerCase()}|${normaliseText(item.sourceSlug).toLowerCase()}`));
  let added = 0;

  for (const ingredient of incoming) {
    const item = normaliseText(ingredient.item);
    if (!item) continue;
    const amount = normaliseText(ingredient.amount);
    const unit = normaliseText(ingredient.unit);
    const sourceSlug = normaliseText(recipe.slug);
    const key = `${item.toLowerCase()}|${amount.toLowerCase()}|${unit.toLowerCase()}|${sourceSlug.toLowerCase()}`;
    if (existingKeys.has(key)) continue;

    current.push({
      id: createId("shopping"),
      item,
      amount,
      unit,
      note: normaliseText(ingredient.note),
      sourceTitle: normaliseText(recipe.title),
      sourceSlug,
      checked: false,
      createdAt: new Date().toISOString(),
    });
    existingKeys.add(key);
    added += 1;
  }

  writeShoppingItems(current);
  return added;
}

function updateShoppingItem(id, patch) {
  const items = readShoppingItems().map((item) => item.id === id ? { ...item, ...patch } : item);
  writeShoppingItems(items);
}

function removeShoppingItem(id) {
  writeShoppingItems(readShoppingItems().filter((item) => item.id !== id));
}

function clearShoppingItems({ checkedOnly = false } = {}) {
  const items = checkedOnly ? readShoppingItems().filter((item) => !item.checked) : [];
  writeShoppingItems(items);
}

function readMealPlan() {
  const value = safeRead(MEAL_PLAN_KEY, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function writeMealPlan(plan) {
  const entries = Object.entries(plan).slice(0, 120);
  safeWrite(MEAL_PLAN_KEY, Object.fromEntries(entries));
  updateCounts();
}

function setMeal(date, meal) {
  const plan = readMealPlan();
  if (!meal) delete plan[date];
  else plan[date] = {
    slug: normaliseText(meal.slug),
    title: normaliseText(meal.title),
    image: normaliseText(meal.image),
    addedAt: new Date().toISOString(),
  };
  writeMealPlan(plan);
}

function addMealToNextOpenDay(meal) {
  const plan = readMealPlan();
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const key = date.toISOString().slice(0, 10);
    if (!plan[key]) {
      setMeal(key, meal);
      return key;
    }
  }

  return null;
}

function removeMeal(date) {
  setMeal(date, null);
}

function clearMealPlan() {
  writeMealPlan({});
}

function updateCounts() {
  const shoppingCount = readShoppingItems().filter((item) => !item.checked).length;
  const plannedCount = Object.keys(readMealPlan()).length;
  for (const node of document.querySelectorAll("[data-shopping-count]")) node.textContent = String(shoppingCount);
  for (const node of document.querySelectorAll("[data-plan-count]")) node.textContent = String(plannedCount);
}

window.OzzylKitchen = {
  addMealToNextOpenDay,
  addShoppingItems,
  clearMealPlan,
  clearShoppingItems,
  readMealPlan,
  readShoppingItems,
  removeMeal,
  removeShoppingItem,
  setMeal,
  updateShoppingItem,
};

updateCounts();
window.addEventListener("storage", updateCounts);
window.addEventListener("ozzyl:kitchen-state", updateCounts);
