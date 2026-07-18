const STORAGE_KEY = "ozzyl:saved-recipes:v1";

function readSavedRecipes() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeSavedRecipes(slugs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(slugs)]));
  window.dispatchEvent(new CustomEvent("ozzyl:saved-recipes", { detail: slugs }));
}

function updateButtons(saved) {
  const savedSet = new Set(saved);
  for (const button of document.querySelectorAll("[data-save-recipe]")) {
    const slug = button.dataset.saveRecipe;
    const isSaved = slug ? savedSet.has(slug) : false;
    button.classList.toggle("is-saved", isSaved);
    button.setAttribute("aria-pressed", String(isSaved));
    const label = button.querySelector("[data-save-label]");
    if (label) label.textContent = isSaved ? "Saved" : "Save";
  }
}

function updateSavedPage(saved) {
  const page = document.querySelector("[data-saved-page]");
  if (!page) return;

  const cards = [...page.querySelectorAll("[data-saved-card]")];
  const savedSet = new Set(saved);
  let visible = 0;

  for (const card of cards) {
    const isSaved = savedSet.has(card.dataset.savedCard);
    card.hidden = !isSaved;
    if (isSaved) visible += 1;
  }

  const count = page.querySelector("[data-saved-count]");
  if (count) count.textContent = String(visible);

  const empty = page.querySelector("[data-saved-empty]");
  if (empty) empty.hidden = visible > 0;

  const grid = page.querySelector("[data-saved-grid]");
  if (grid) grid.hidden = visible === 0;

  const loading = page.querySelector("[data-saved-loading]");
  if (loading) loading.hidden = true;

  page.dataset.ready = "true";
}

let saved = readSavedRecipes();
updateButtons(saved);
updateSavedPage(saved);

for (const button of document.querySelectorAll("[data-save-recipe]")) {
  button.addEventListener("click", () => {
    const slug = button.dataset.saveRecipe;
    if (!slug) return;

    saved = saved.includes(slug)
      ? saved.filter((item) => item !== slug)
      : [...saved, slug];
    writeSavedRecipes(saved);
    updateButtons(saved);
    updateSavedPage(saved);
  });
}

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  saved = readSavedRecipes();
  updateButtons(saved);
  updateSavedPage(saved);
});
