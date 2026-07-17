const DRAFT_STORAGE_KEY = "ozzyl:recipe-draft:v1";
const root = document.querySelector("[data-recipe-editor]");

if (root) {
  const form = root.querySelector("form");
  const ingredientList = root.querySelector("[data-ingredient-rows]");
  const stepList = root.querySelector("[data-step-rows]");
  const ingredientTemplate = root.querySelector("template[data-ingredient-template]");
  const stepTemplate = root.querySelector("template[data-step-template]");
  const status = root.querySelector("[data-draft-status]");
  const errorsPanel = root.querySelector("[data-validation-errors]");
  const previewTitle = root.querySelector("[data-preview-title]");
  const previewSummary = root.querySelector("[data-preview-summary]");
  const previewMeta = root.querySelector("[data-preview-meta]");
  let saveTimer;

  function field(name) {
    return form.elements.namedItem(name);
  }

  function setStatus(message, state = "neutral") {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  function createIngredientRow(value = {}) {
    const fragment = ingredientTemplate.content.cloneNode(true);
    const row = fragment.querySelector("[data-ingredient-row]");
    row.querySelector('[name="ingredient-item"]').value = value.item || "";
    row.querySelector('[name="ingredient-amount"]').value = value.amount || "";
    row.querySelector('[name="ingredient-unit"]').value = value.unit || "";
    row.querySelector('[name="ingredient-note"]').value = value.note || "";
    ingredientList.append(fragment);
  }

  function createStepRow(value = {}) {
    const fragment = stepTemplate.content.cloneNode(true);
    const row = fragment.querySelector("[data-step-row]");
    row.querySelector('[name="step-instruction"]').value = value.instruction || "";
    row.querySelector('[name="step-timer"]').value = value.timerMinutes ?? "";
    stepList.append(fragment);
  }

  function collectDraft() {
    return {
      title: field("title")?.value || "",
      summary: field("summary")?.value || "",
      description: field("description")?.value || "",
      countryCode: field("countryCode")?.value || "US",
      languageCode: field("languageCode")?.value || "en",
      measurementSystem: field("measurementSystem")?.value || "metric",
      prepMinutes: Number(field("prepMinutes")?.value || 0),
      cookMinutes: Number(field("cookMinutes")?.value || 0),
      servings: Number(field("servings")?.value || 1),
      difficulty: field("difficulty")?.value || "easy",
      categories: [...form.querySelectorAll('[name="categories"]:checked')].map((input) => input.value),
      ingredients: [...ingredientList.querySelectorAll("[data-ingredient-row]")].map((row) => ({
        item: row.querySelector('[name="ingredient-item"]').value,
        amount: row.querySelector('[name="ingredient-amount"]').value,
        unit: row.querySelector('[name="ingredient-unit"]').value,
        note: row.querySelector('[name="ingredient-note"]').value,
      })),
      steps: [...stepList.querySelectorAll("[data-step-row]")].map((row) => ({
        instruction: row.querySelector('[name="step-instruction"]').value,
        timerMinutes: row.querySelector('[name="step-timer"]').value === ""
          ? null
          : Number(row.querySelector('[name="step-timer"]').value),
      })),
    };
  }

  function updatePreview(draft = collectDraft()) {
    if (previewTitle) previewTitle.textContent = draft.title.trim() || "Untitled regional recipe";
    if (previewSummary) previewSummary.textContent = draft.summary.trim() || "Your recipe summary will appear here.";
    if (previewMeta) {
      const total = Number(draft.prepMinutes || 0) + Number(draft.cookMinutes || 0);
      previewMeta.textContent = `${draft.countryCode || "US"} · ${total} min · ${draft.servings || 1} servings · ${draft.difficulty || "easy"}`;
    }
  }

  function saveDraft() {
    try {
      const draft = collectDraft();
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        draft,
      }));
      setStatus(`Saved locally at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, "success");
      updatePreview(draft);
    } catch {
      setStatus("This browser could not save the draft.", "error");
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    setStatus("Saving changes…");
    saveTimer = setTimeout(saveDraft, 450);
    updatePreview();
  }

  function restoreDraft() {
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "null");
    } catch {
      stored = null;
    }

    const draft = stored?.draft;
    if (!draft) {
      createIngredientRow();
      createIngredientRow();
      createIngredientRow();
      createStepRow();
      createStepRow();
      createStepRow();
      updatePreview();
      setStatus("New draft stored only in this browser.");
      return;
    }

    for (const name of ["title", "summary", "description", "countryCode", "languageCode", "measurementSystem", "prepMinutes", "cookMinutes", "servings", "difficulty"]) {
      const control = field(name);
      if (control && draft[name] !== undefined) control.value = draft[name];
    }

    const selectedCategories = new Set(draft.categories || []);
    for (const checkbox of form.querySelectorAll('[name="categories"]')) {
      checkbox.checked = selectedCategories.has(checkbox.value);
    }

    for (const ingredient of draft.ingredients?.length ? draft.ingredients : [{}, {}]) {
      createIngredientRow(ingredient);
    }
    for (const step of draft.steps?.length ? draft.steps : [{}, {}]) {
      createStepRow(step);
    }

    const savedAt = stored.savedAt ? new Date(stored.savedAt) : null;
    setStatus(savedAt && !Number.isNaN(savedAt.getTime())
      ? `Restored local draft from ${savedAt.toLocaleString()}`
      : "Restored local draft.", "success");
    updatePreview(draft);
  }

  function renderErrors(errors = []) {
    if (!errorsPanel) return;
    errorsPanel.replaceChildren();
    errorsPanel.hidden = errors.length === 0;
    if (!errors.length) return;

    const heading = document.createElement("strong");
    heading.textContent = `${errors.length} issue${errors.length === 1 ? "" : "s"} to fix`;
    const list = document.createElement("ul");
    for (const error of errors) {
      const item = document.createElement("li");
      item.textContent = `${error.path}: ${error.message}`;
      list.append(item);
    }
    errorsPanel.append(heading, list);
  }

  async function validateDraft() {
    setStatus("Validating on Cloudflare Workers…");
    renderErrors([]);

    try {
      const response = await fetch("/api/recipes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectDraft()),
      });
      const result = await response.json();
      renderErrors(result.errors || []);
      if (result.valid) {
        setStatus("Draft is valid and ready for the future publishing endpoint.", "success");
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          draft: result.draft,
        }));
      } else {
        setStatus("Draft validation found issues.", "error");
      }
    } catch {
      setStatus("Validation service is unavailable. Your local draft is still saved.", "error");
    }
  }

  function exportDraft() {
    const draft = collectDraft();
    const title = draft.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "recipe-draft";
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("Draft JSON exported.", "success");
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    if (target.matches("[data-add-ingredient]")) {
      createIngredientRow();
      scheduleSave();
    }
    if (target.matches("[data-add-step]")) {
      createStepRow();
      scheduleSave();
    }
    if (target.matches("[data-remove-ingredient]")) {
      const rows = ingredientList.querySelectorAll("[data-ingredient-row]");
      if (rows.length > 1) target.closest("[data-ingredient-row]").remove();
      scheduleSave();
    }
    if (target.matches("[data-remove-step]")) {
      const rows = stepList.querySelectorAll("[data-step-row]");
      if (rows.length > 1) target.closest("[data-step-row]").remove();
      scheduleSave();
    }
    if (target.matches("[data-export-draft]")) exportDraft();
    if (target.matches("[data-clear-draft]")) {
      if (!window.confirm("Clear this local recipe draft?")) return;
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      window.location.reload();
    }
  });

  form.addEventListener("input", scheduleSave);
  form.addEventListener("change", scheduleSave);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    validateDraft();
  });

  restoreDraft();
}
