function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function formatIngredient(item) {
  return [item.amount, item.unit, item.item].filter(Boolean).join(" ");
}

function showTemporaryStatus(node, message, fallback) {
  if (!node) return;
  node.textContent = message;
  window.setTimeout(() => {
    node.textContent = typeof fallback === "function" ? fallback() : fallback;
  }, 1800);
}

function initialiseShoppingPage(root, kitchen) {
  const list = root.querySelector("[data-shopping-list]");
  const empty = root.querySelector("[data-shopping-empty]");
  const status = root.querySelector("[data-shopping-status]");

  function statusText(items = kitchen.readShoppingItems()) {
    const remaining = items.filter((item) => !item.checked).length;
    return `${remaining} item${remaining === 1 ? "" : "s"} remaining · ${items.length} total`;
  }

  function render() {
    const items = kitchen.readShoppingItems();
    list.replaceChildren();
    list.hidden = items.length === 0;
    empty.hidden = items.length > 0;
    status.textContent = statusText(items);

    for (const item of items) {
      const row = document.createElement("li");
      row.className = `shopping-item${item.checked ? " is-checked" : ""}`;
      row.dataset.shoppingId = item.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(item.checked);
      checkbox.setAttribute("aria-label", `Mark ${item.item} as ${item.checked ? "not purchased" : "purchased"}`);
      checkbox.addEventListener("change", () => kitchen.updateShoppingItem(item.id, { checked: checkbox.checked }));

      const content = document.createElement("div");
      const name = document.createElement("span");
      name.className = "shopping-item__name";
      name.textContent = formatIngredient(item);
      content.append(name);

      const details = [item.note, item.sourceTitle ? `From ${item.sourceTitle}` : ""].filter(Boolean).join(" · ");
      if (details) {
        const meta = document.createElement(item.sourceSlug ? "a" : "span");
        meta.className = "shopping-item__meta";
        meta.textContent = details;
        if (item.sourceSlug) meta.href = `/recipes/${encodeURIComponent(item.sourceSlug)}`;
        content.append(meta);
      }

      const remove = document.createElement("button");
      remove.className = "icon-button";
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${item.item}`);
      remove.addEventListener("click", () => kitchen.removeShoppingItem(item.id));

      row.append(checkbox, content, remove);
      list.append(row);
    }
  }

  root.querySelector("[data-copy-shopping]")?.addEventListener("click", async () => {
    const items = kitchen.readShoppingItems().filter((item) => !item.checked);
    const text = items.map((item) => `• ${formatIngredient(item)}${item.note ? ` — ${item.note}` : ""}`).join("\n");
    if (!text) return showTemporaryStatus(status, "There is nothing to copy.", statusText);
    try {
      await navigator.clipboard.writeText(text);
      showTemporaryStatus(status, "Shopping list copied.", statusText);
    } catch {
      window.prompt("Copy your shopping list:", text);
    }
  });

  root.querySelector("[data-clear-checked]")?.addEventListener("click", () => kitchen.clearShoppingItems({ checkedOnly: true }));
  root.querySelector("[data-clear-shopping]")?.addEventListener("click", () => {
    if (kitchen.readShoppingItems().length && window.confirm("Clear the entire shopping list?")) kitchen.clearShoppingItems();
  });

  render();
  window.addEventListener("ozzyl:kitchen-state", render);
  window.addEventListener("storage", render);
}

function initialiseMealPlan(root, kitchen) {
  const grid = root.querySelector("[data-meal-plan-grid]");
  const status = root.querySelector("[data-plan-status]");
  const catalogueNode = document.querySelector("#meal-catalogue");
  let catalogue = [];
  let weekOffset = 0;

  try {
    catalogue = JSON.parse(catalogueNode?.textContent || "[]");
  } catch {
    catalogue = [];
  }

  const catalogueBySlug = new Map(catalogue.map((recipe) => [recipe.slug, recipe]));

  function displayedDates() {
    const anchor = new Date();
    anchor.setDate(anchor.getDate() + weekOffset * 7);
    const monday = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }

  function updateStatus(dates, plan) {
    const count = dates.filter((date) => plan[localDateKey(date)]).length;
    const range = `${dates[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}–${dates[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    status.textContent = `${range} · ${count} of 7 days planned`;
  }

  function createEmptyDay(date, dateKey) {
    const wrapper = document.createElement("div");
    wrapper.className = "meal-card-mini";

    const select = document.createElement("select");
    select.setAttribute("aria-label", `Choose a recipe for ${date.toLocaleDateString()}`);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a recipe…";
    select.append(placeholder);

    for (const recipe of catalogue) {
      const option = document.createElement("option");
      option.value = recipe.slug;
      option.textContent = `${recipe.title} · ${recipe.minutes} min`;
      select.append(option);
    }

    select.addEventListener("change", () => {
      const recipe = catalogueBySlug.get(select.value);
      if (recipe) kitchen.setMeal(dateKey, recipe);
    });

    const browse = document.createElement("a");
    browse.className = "text-link";
    browse.href = "/search";
    browse.textContent = "Browse recipes";
    wrapper.append(select, browse);
    return wrapper;
  }

  function createPlannedMeal(recipe, dateKey) {
    const wrapper = document.createElement("div");
    wrapper.className = "meal-card-mini";

    const image = document.createElement("img");
    image.src = recipe.image || "/images/recipe-placeholder.svg";
    image.alt = "";
    image.width = 420;
    image.height = 315;

    const title = document.createElement("strong");
    title.textContent = recipe.title;

    const actions = document.createElement("div");
    actions.className = "meal-card-mini__actions";
    const view = document.createElement("a");
    view.className = "button button--ghost";
    view.href = `/recipes/${encodeURIComponent(recipe.slug)}`;
    view.textContent = "View";
    const remove = document.createElement("button");
    remove.className = "button button--ghost";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => kitchen.removeMeal(dateKey));
    actions.append(view, remove);

    wrapper.append(image, title, actions);
    return wrapper;
  }

  function render() {
    const dates = displayedDates();
    const plan = kitchen.readMealPlan();
    grid.replaceChildren();

    for (const date of dates) {
      const dateKey = localDateKey(date);
      const savedMeal = plan[dateKey];
      const recipe = savedMeal ? (catalogueBySlug.get(savedMeal.slug) || savedMeal) : null;
      const day = document.createElement("article");
      day.className = "meal-day";

      const weekday = document.createElement("p");
      weekday.className = "meal-day__date";
      weekday.textContent = date.toLocaleDateString(undefined, { weekday: "long" });
      const heading = document.createElement("h2");
      heading.textContent = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      day.append(weekday, heading, recipe ? createPlannedMeal(recipe, dateKey) : createEmptyDay(date, dateKey));
      grid.append(day);
    }

    updateStatus(dates, plan);
  }

  root.querySelector("[data-previous-week]")?.addEventListener("click", () => { weekOffset -= 1; render(); });
  root.querySelector("[data-current-week]")?.addEventListener("click", () => { weekOffset = 0; render(); });
  root.querySelector("[data-next-week]")?.addEventListener("click", () => { weekOffset += 1; render(); });
  root.querySelector("[data-clear-plan]")?.addEventListener("click", () => {
    const dates = displayedDates();
    if (!window.confirm("Clear meals from the displayed week?")) return;
    for (const date of dates) kitchen.removeMeal(localDateKey(date));
  });
  root.querySelector("[data-copy-plan]")?.addEventListener("click", async () => {
    const dates = displayedDates();
    const plan = kitchen.readMealPlan();
    const text = dates.map((date) => {
      const meal = plan[localDateKey(date)];
      return `${date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${meal?.title || "Open"}`;
    }).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showTemporaryStatus(status, "Weekly plan copied.", () => {
        updateStatus(dates, kitchen.readMealPlan());
        return status.textContent;
      });
    } catch {
      window.prompt("Copy this meal plan:", text);
    }
  });

  render();
  window.addEventListener("ozzyl:kitchen-state", render);
  window.addEventListener("storage", render);
}

window.addEventListener("DOMContentLoaded", () => {
  const kitchen = window.OzzylKitchen;
  if (!kitchen) return;
  const shoppingPage = document.querySelector("[data-shopping-page]");
  const mealPlanPage = document.querySelector("[data-meal-plan-page]");
  if (shoppingPage) initialiseShoppingPage(shoppingPage, kitchen);
  if (mealPlanPage) initialiseMealPlan(mealPlanPage, kitchen);
});
