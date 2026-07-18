const root = document.querySelector("[data-published-change-set-editor]");

if (root) {
  const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
  const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const form = root.querySelector("form");
  const ingredientList = root.querySelector("[data-ingredient-rows]");
  const stepList = root.querySelector("[data-step-rows]");
  const ingredientTemplate = root.querySelector("template[data-ingredient-template]");
  const stepTemplate = root.querySelector("template[data-step-template]");
  const status = root.querySelector("[data-change-set-status]");
  const result = root.querySelector("[data-change-set-result]");
  const errorsPanel = root.querySelector("[data-validation-errors]");
  const contributorNote = root.querySelector("[data-contributor-note]");
  const previewTitle = root.querySelector("[data-preview-title]");
  const previewSummary = root.querySelector("[data-preview-summary]");
  const previewMeta = root.querySelector("[data-preview-meta]");
  const previewImage = root.querySelector("[data-preview-image]");
  const previewImagePlaceholder = root.querySelector("[data-preview-image-placeholder]");
  const previewMediaStatus = root.querySelector("[data-preview-media-status]");
  const mediaUploader = root.querySelector("[data-media-uploader]");
  const mediaFile = root.querySelector("[data-media-file]");
  const mediaAlt = root.querySelector("[data-media-alt]");
  const mediaStatus = root.querySelector("[data-media-status]");
  const mediaAssetId = root.querySelector("[data-media-asset-id]");
  const mediaCsrf = root.querySelector("[data-media-csrf]");
  const mediaSessionCsrf = root.querySelector("[data-media-session-csrf]");
  const uploadMediaButton = root.querySelector("[data-upload-media]");
  const actionButtons = [...root.querySelectorAll("button[data-start-change-set], button[data-save-change-set], button[data-submit-change-set], button[data-cancel-change-set]")];
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

  function setMediaStatus(message, state = "neutral") {
    if (!mediaStatus) return;
    mediaStatus.textContent = message;
    mediaStatus.dataset.state = state;
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

  function updatePreview(draft = collectDraft()) {
    if (!draft) return;
    if (previewTitle) previewTitle.textContent = draft.title.trim() || "Untitled private update";
    if (previewSummary) previewSummary.textContent = draft.summary.trim() || "Your proposed summary will appear here.";
    if (previewMeta) {
      const total = Number(draft.prepMinutes || 0) + Number(draft.cookMinutes || 0);
      previewMeta.textContent = `${draft.countryCode || "US"} · ${total} min · ${draft.servings || 1} servings · ${draft.difficulty || "easy"}`;
    }
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

  function renderMedia(asset) {
    if (!asset) return;
    if (mediaAssetId) mediaAssetId.value = asset.id;
    if (mediaAlt && asset.altText) mediaAlt.value = asset.altText;
    if (previewImage) {
      previewImage.src = asset.previewUrl;
      previewImage.alt = asset.altText || "Private proposed recipe image";
      previewImage.hidden = false;
    }
    if (previewImagePlaceholder) previewImagePlaceholder.hidden = true;
    const label = asset.moderationStatus === "approved" ? "approved" : "pending moderation";
    setMediaStatus(`Attached · ${label}`, asset.moderationStatus === "approved" ? "success" : "neutral");
    if (previewMediaStatus) previewMediaStatus.textContent = `Attached image is ${label}.`;
  }

  function detachMedia() {
    if (mediaAssetId) mediaAssetId.value = "";
    if (mediaFile) mediaFile.value = "";
    if (mediaAlt) mediaAlt.value = "";
    if (previewImage) {
      previewImage.removeAttribute("src");
      previewImage.alt = "";
      previewImage.hidden = true;
    }
    if (previewImagePlaceholder) previewImagePlaceholder.hidden = false;
    setMediaStatus("No image attached.", "error");
    if (previewMediaStatus) previewMediaStatus.textContent = "Attach an eligible image before saving or submitting.";
    scheduleLocalSave();
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
        note: contributorNote?.value || "",
      }));
      setStatus(`Saved locally at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, "success");
      updatePreview(draft);
    } catch {
      setStatus("This browser could not save the private update.", "error");
    }
  }

  function scheduleLocalSave() {
    clearTimeout(saveTimer);
    setStatus("Saving local private update…");
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
    if (contributorNote && typeof stored.note === "string") contributorNote.value = stored.note;
    const savedAt = stored.savedAt ? new Date(stored.savedAt) : null;
    setStatus(savedAt && !Number.isNaN(savedAt.getTime())
      ? `Restored local private update from ${savedAt.toLocaleString()}`
      : "Restored local private update.", "success");
  }

  async function uploadMedia() {
    if (mediaUploader?.dataset.mediaEnabled !== "true" || !mediaFile || !mediaAlt || !uploadMediaButton) return;
    const file = mediaFile.files?.[0];
    const altText = mediaAlt.value.trim();
    if (!file) return setMediaStatus("Choose an image before uploading.", "error");
    if (!ALLOWED_MEDIA_TYPES.has(file.type)) return setMediaStatus("Only JPEG, PNG, and WebP images are accepted.", "error");
    if (file.size < 1 || file.size > MAX_MEDIA_BYTES) return setMediaStatus("Image must be no larger than 8 MB.", "error");
    if (altText.length < 5) return setMediaStatus("Add descriptive alternative text.", "error");

    uploadMediaButton.disabled = true;
    setMediaStatus("Authorizing private upload…");
    try {
      const intentResponse = await fetch("/api/media/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          byteSize: file.size,
          purpose: "recipe_hero",
          altText,
          csrfToken: mediaCsrf?.value || "",
          sessionCsrf: mediaSessionCsrf?.value || "",
        }),
      });
      const intent = await intentResponse.json();
      if (!intentResponse.ok || !intent.ok) throw new Error(intent.error || intent.errors?.join(" ") || "Upload authorization failed.");

      setMediaStatus("Validating and storing replacement…");
      const uploadResponse = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${intent.token}`,
          "Content-Type": file.type,
          Accept: "application/json",
        },
        body: file,
      });
      const upload = await uploadResponse.json();
      if (!uploadResponse.ok || !upload.ok) throw new Error(upload.error || "Image upload failed.");
      renderMedia(upload.asset);
      saveLocal();
    } catch (error) {
      setMediaStatus(error instanceof Error ? error.message : "Image upload failed.", "error");
    } finally {
      uploadMediaButton.disabled = false;
    }
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

  async function sendAction(action) {
    const recipeId = root.dataset.recipeId;
    if (!recipeId) return;
    actionButtons.forEach((button) => { button.disabled = true; });
    renderErrors([]);
    setResult(action === "create"
      ? "Creating a private baseline…"
      : action === "save"
        ? "Saving private change set…"
        : action === "submit"
          ? "Submitting private change set for editorial review…"
          : "Cancelling private change set…");
    try {
      let draft;
      if (action === "save" || action === "submit") {
        draft = collectDraft();
        if (!draft?.mediaAssetId) throw new Error("Attach an eligible recipe image before saving or submitting.");
        draft = await validateDraft(draft);
      }
      const response = await fetch(`/api/recipes/${recipeId}/change-set`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action,
          changeSetId: root.dataset.changeSetId || undefined,
          expectedRevision: changeSetRevision || undefined,
          draft,
          note: contributorNote?.value.trim() || "",
          csrfToken: root.dataset.csrf || "",
          sessionCsrf: root.dataset.sessionCsrf || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        renderErrors(payload.errors || []);
        throw new Error(payload.error || "Published recipe change-set operation failed.");
      }
      if (action === "create") {
        window.location.assign(payload.editorUrl || `/account/submissions/${recipeId}/change-set`);
        return;
      }
      if (payload.changeSet?.revision) {
        changeSetRevision = Number(payload.changeSet.revision);
        root.dataset.changeSetRevision = String(changeSetRevision);
      }
      if (action === "save") {
        saveLocal();
        setResult(`Private change-set revision ${changeSetRevision} saved. The live recipe is unchanged.`, "success");
        actionButtons.forEach((button) => { button.disabled = false; });
        return;
      }
      if (storageKey) localStorage.removeItem(storageKey);
      setResult(action === "submit" ? "Private change set submitted for review." : "Private change set cancelled.", "success");
      window.setTimeout(() => window.location.assign(payload.submissionsUrl || "/account/submissions"), 700);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Published recipe change-set operation failed.", "error");
      actionButtons.forEach((button) => { button.disabled = false; });
    }
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.matches("[data-start-change-set]")) sendAction("create");
    if (target.matches("[data-save-change-set]")) sendAction("save");
    if (target.matches("[data-submit-change-set]")) sendAction("submit");
    if (target.matches("[data-cancel-change-set]")) {
      if (window.confirm("Cancel this private change set? The live published recipe will remain unchanged.")) sendAction("cancel");
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
    if (target.matches("[data-upload-media]")) uploadMedia();
    if (target.matches("[data-clear-media]")) detachMedia();
    if (target.matches("[data-discard-local]")) {
      if (!window.confirm("Discard local edits and reload the private D1 change set?")) return;
      if (storageKey) localStorage.removeItem(storageKey);
      window.location.reload();
    }
  });

  form?.addEventListener("input", scheduleLocalSave);
  form?.addEventListener("change", scheduleLocalSave);
  form?.addEventListener("submit", (event) => event.preventDefault());
  restoreLocal();
}
