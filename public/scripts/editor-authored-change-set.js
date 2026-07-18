const root = document.querySelector("[data-editor-authored-change-set]");

if (root) {
  const form = root.querySelector("form");
  const ingredientList = root.querySelector("[data-ingredient-rows]");
  const stepList = root.querySelector("[data-step-rows]");
  const ingredientTemplate = root.querySelector("template[data-ingredient-template]");
  const stepTemplate = root.querySelector("template[data-step-template]");
  const status = root.querySelector("[data-change-set-status]");
  const result = root.querySelector("[data-change-set-result]");
  const errorsPanel = root.querySelector("[data-validation-errors]");
  const note = root.querySelector("[data-editor-note]");
  const mediaSelect = root.querySelector('[name="mediaAssetId"]');
  const previewTitle = root.querySelector("[data-preview-title]");
  const previewSummary = root.querySelector("[data-preview-summary]");
  const previewMeta = root.querySelector("[data-preview-meta]");
  const previewImage = root.querySelector("[data-preview-image]");
  const previewImagePlaceholder = root.querySelector("[data-preview-image-placeholder]");
  const previewMediaStatus = root.querySelector("[data-preview-media-status]");
  const actionButtons = [...root.querySelectorAll("button[data-editor-change-set-action], button[data-restore-source]")];
  const storageKey = root.dataset.storageKey || "";
  let changeSetRevision = Number(root.dataset.changeSetRevision || 0);
  let saveTimer;

  function field(name) {
    return form?.elements.namedItem(name);
  }

  function setStatus(message, state = "neutral") {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  function setResult(message, state = "neutral") {
    if (!result) return;
    result.textContent = message;
    result.dataset.state = state;
  }

  function createIngredientRow(value = {}) {
    if (!ingredientTemplate || !ingredientList) return;
    const fragment = ingredientTemplate.content.cloneNode(true);
    const row = fragment.querySelector("[data-ingredient-row]");
    row.querySelector('[name="ingredient-item"]').value = value.item || "";
    row.querySelector('[name="ingredient-amount"]').value = value.amount || "";
    row.querySelector('[name="ingredient-unit"]').value = value.unit || "";
    row.querySelector('[name="ingredient-note"]').value = value.note || "";
    ingredientList.append(fragment);
  }

  function createStepRow(value = {}) {
    if (!stepTemplate || !stepList) return;
    const fragment = stepTemplate.content.cloneNode(true);
    const row = fragment.querySelector("[data-step-row]");
    row.querySelector('[name="step-instruction"]').value = value.instruction || "";
    row.querySelector('[name="step-timer"]').value = value.timerMinutes ?? "";
    stepList.append(fragment);
  }

  function collectDraft() {
    if (!form || !ingredientList || !stepList) return null;
    return {
      title: field("title")?.value || "",
      summary: field("summary")?.value || "",
      description: field("description")?.value || "",
      mediaAssetId: field("mediaAssetId")?.value || null,
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

  function updateMediaPreview() {
    const option = mediaSelect?.selectedOptions?.[0];
    const previewUrl = option?.dataset.previewUrl || "";
    const altText = option?.dataset.altText || "Private proposed recipe image";
    const moderation = option?.dataset.moderationStatus || "missing";
    if (previewImage) {
      if (previewUrl) {
        previewImage.src = previewUrl;
        previewImage.alt = altText;
        previewImage.hidden = false;
      } else {
        previewImage.removeAttribute("src");
        previewImage.alt = "";
        previewImage.hidden = true;
      }
    }
    if (previewImagePlaceholder) previewImagePlaceholder.hidden = Boolean(previewUrl);
    if (previewMediaStatus) {
      previewMediaStatus.textContent = previewUrl
        ? `Selected owner media is ${moderation}.`
        : "No eligible owner media is selected. Saving is allowed, but submission is blocked.";
    }
  }

  function updatePreview(draft = collectDraft()) {
    if (!draft) return;
    if (previewTitle) previewTitle.textContent = draft.title.trim() || "Untitled editorial proposal";
    if (previewSummary) previewSummary.textContent = draft.summary.trim() || "The proposed summary will appear here.";
    if (previewMeta) {
      const total = Number(draft.prepMinutes || 0) + Number(draft.cookMinutes || 0);
      previewMeta.textContent = `${draft.countryCode || "US"} · ${total} min · ${draft.servings || 1} servings · ${draft.difficulty || "easy"}`;
    }
    updateMediaPreview();
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

  function saveLocal() {
    if (!storageKey || !form) return;
    try {
      const draft = collectDraft();
      localStorage.setItem(storageKey, JSON.stringify({
        version: 1,
        changeSetId: root.dataset.changeSetId,
        serverRevision: changeSetRevision,
        savedAt: new Date().toISOString(),
        draft,
        note: note?.value || "",
      }));
      setStatus(`Saved locally at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, "success");
      updatePreview(draft);
    } catch {
      setStatus("This browser could not save the editorial proposal.", "error");
    }
  }

  function scheduleLocalSave() {
    clearTimeout(saveTimer);
    setStatus("Saving local editorial proposal…");
    saveTimer = window.setTimeout(saveLocal, 450);
    updatePreview();
  }

  function populateDraft(draft) {
    if (!form || !ingredientList || !stepList) return;
    for (const name of ["title", "summary", "description", "mediaAssetId", "countryCode", "languageCode", "measurementSystem", "prepMinutes", "cookMinutes", "servings", "difficulty"]) {
      const control = field(name);
      if (control && draft[name] !== undefined && draft[name] !== null) control.value = draft[name];
    }
    const selected = new Set(draft.categories || []);
    for (const checkbox of form.querySelectorAll('[name="categories"]')) checkbox.checked = selected.has(checkbox.value);
    ingredientList.replaceChildren();
    stepList.replaceChildren();
    for (const ingredient of draft.ingredients?.length ? draft.ingredients : [{}, {}]) createIngredientRow(ingredient);
    for (const step of draft.steps?.length ? draft.steps : [{}, {}]) createStepRow(step);
    updatePreview(draft);
  }

  function restoreLocal() {
    if (!storageKey || !form) return;
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      stored = null;
    }
    if (!stored?.draft || stored.changeSetId !== root.dataset.changeSetId || Number(stored.serverRevision) !== changeSetRevision) {
      updatePreview();
      return;
    }
    populateDraft(stored.draft);
    if (note && typeof stored.note === "string") note.value = stored.note;
    const savedAt = stored.savedAt ? new Date(stored.savedAt) : null;
    setStatus(savedAt && !Number.isNaN(savedAt.getTime())
      ? `Restored local editorial proposal from ${savedAt.toLocaleString()}`
      : "Restored local editorial proposal.", "success");
  }

  async function validateDraft(draft) {
    const response = await fetch("/api/recipes/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(draft),
    });
    const payload = await response.json();
    renderErrors(payload.errors || []);
    if (!response.ok || !payload.valid || !payload.draft) throw new Error("Fix the validation issues before continuing.");
    return payload.draft;
  }

  function setBusy(busy) {
    actionButtons.forEach((button) => {
      button.disabled = busy || button.dataset.originallyDisabled === "true";
    });
  }

  async function sendAction(action, historicalSourceKey) {
    const apiUrl = root.dataset.apiUrl;
    if (!apiUrl) return;
    setBusy(true);
    renderErrors([]);
    const messages = {
      create: "Creating an editor-controlled private baseline…",
      restore_snapshot: "Restoring historical content into a new private proposal…",
      save: "Saving editor-authored private proposal…",
      submit: "Submitting editor-authored proposal for review…",
      cancel: "Cancelling editor-authored private draft…",
    };
    setResult(messages[action] || "Processing editorial proposal…");
    try {
      let draft;
      if (action === "save" || action === "submit") {
        draft = collectDraft();
        if (!draft) throw new Error("The editorial form is unavailable.");
        if (action === "submit" && !draft.mediaAssetId) throw new Error("Select eligible owner media before submitting.");
        draft = await validateDraft(draft);
      }
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action,
          historicalSourceKey,
          changeSetId: root.dataset.changeSetId || undefined,
          expectedRevision: changeSetRevision || undefined,
          draft,
          note: note?.value.trim() || "",
          csrfToken: root.dataset.csrf || "",
          sessionCsrf: root.dataset.sessionCsrf || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        renderErrors(payload.errors || []);
        throw new Error(payload.error || "Editorial recipe change-set operation failed.");
      }
      if (action === "create" || action === "restore_snapshot") {
        window.location.assign(payload.editorUrl || window.location.pathname);
        return;
      }
      if (payload.changeSet?.revision) {
        changeSetRevision = Number(payload.changeSet.revision);
        root.dataset.changeSetRevision = String(changeSetRevision);
      }
      if (action === "save") {
        saveLocal();
        setResult(`Editorial change-set revision ${changeSetRevision} saved. The live recipe is unchanged.`, "success");
        setBusy(false);
        return;
      }
      if (storageKey) localStorage.removeItem(storageKey);
      if (action === "submit") {
        setResult("Editor-authored proposal submitted for independent review.", "success");
        window.setTimeout(() => window.location.assign(payload.reviewUrl || "/admin/recipe-change-sets"), 700);
      } else {
        setResult("Editor-authored private draft cancelled.", "success");
        window.setTimeout(() => window.location.assign(payload.queueUrl || "/admin/recipe-change-sets"), 700);
      }
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Editorial recipe change-set operation failed.", "error");
      setBusy(false);
    }
  }

  for (const button of actionButtons) {
    button.dataset.originallyDisabled = button.disabled ? "true" : "false";
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.matches("[data-editor-change-set-action]")) {
      const action = target.dataset.editorChangeSetAction;
      if (action === "cancel" && !window.confirm("Cancel this editor-authored private draft? The live published recipe remains unchanged.")) return;
      sendAction(action);
    }
    if (target.matches("[data-restore-source]")) {
      const sourceKey = target.dataset.restoreSource;
      if (!sourceKey || !window.confirm("Create a private editorial proposal from this historical snapshot? The live recipe will not change.")) return;
      sendAction("restore_snapshot", sourceKey);
    }
    if (target.matches("[data-add-ingredient]")) {
      createIngredientRow();
      scheduleLocalSave();
    }
    if (target.matches("[data-add-step]")) {
      createStepRow();
      scheduleLocalSave();
    }
    if (target.matches("[data-remove-ingredient]")) {
      const rows = ingredientList?.querySelectorAll("[data-ingredient-row]") || [];
      if (rows.length > 1) target.closest("[data-ingredient-row]")?.remove();
      scheduleLocalSave();
    }
    if (target.matches("[data-remove-step]")) {
      const rows = stepList?.querySelectorAll("[data-step-row]") || [];
      if (rows.length > 1) target.closest("[data-step-row]")?.remove();
      scheduleLocalSave();
    }
    if (target.matches("[data-discard-local]")) {
      if (!window.confirm("Discard local edits and reload the private D1 proposal?")) return;
      if (storageKey) localStorage.removeItem(storageKey);
      window.location.reload();
    }
  });

  form?.addEventListener("input", scheduleLocalSave);
  form?.addEventListener("change", scheduleLocalSave);
  form?.addEventListener("submit", (event) => event.preventDefault());
  mediaSelect?.addEventListener("change", updateMediaPreview);
  restoreLocal();
}
