const revisionRoot = document.querySelector("[data-recipe-revision-editor]");

if (revisionRoot) {
  const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
  const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const form = revisionRoot.querySelector("form");
  const ingredientList = revisionRoot.querySelector("[data-ingredient-rows]");
  const stepList = revisionRoot.querySelector("[data-step-rows]");
  const ingredientTemplate = revisionRoot.querySelector("template[data-ingredient-template]");
  const stepTemplate = revisionRoot.querySelector("template[data-step-template]");
  const status = revisionRoot.querySelector("[data-revision-status]");
  const errorsPanel = revisionRoot.querySelector("[data-validation-errors]");
  const previewTitle = revisionRoot.querySelector("[data-preview-title]");
  const previewSummary = revisionRoot.querySelector("[data-preview-summary]");
  const previewMeta = revisionRoot.querySelector("[data-preview-meta]");
  const previewImage = revisionRoot.querySelector("[data-preview-image]");
  const previewImagePlaceholder = revisionRoot.querySelector("[data-preview-image-placeholder]");
  const previewMediaStatus = revisionRoot.querySelector("[data-preview-media-status]");
  const mediaUploader = revisionRoot.querySelector("[data-media-uploader]");
  const mediaFile = revisionRoot.querySelector("[data-media-file]");
  const mediaAlt = revisionRoot.querySelector("[data-media-alt]");
  const mediaStatus = revisionRoot.querySelector("[data-media-status]");
  const mediaAssetId = revisionRoot.querySelector("[data-media-asset-id]");
  const mediaCsrf = revisionRoot.querySelector("[data-media-csrf]");
  const mediaSessionCsrf = revisionRoot.querySelector("[data-media-session-csrf]");
  const uploadMediaButton = revisionRoot.querySelector("[data-upload-media]");
  const resubmitButton = revisionRoot.querySelector("[data-resubmit-recipe]");
  const contributorNote = revisionRoot.querySelector("[data-contributor-note]");
  const storageKey = revisionRoot.dataset.storageKey || "";
  const baseRevision = Number(revisionRoot.dataset.revision);
  let saveTimer;

  function field(name) {
    return form?.elements.namedItem(name);
  }

  function setStatus(message, state = "neutral") {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
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
    if (previewTitle) previewTitle.textContent = draft.title.trim() || "Untitled recipe revision";
    if (previewSummary) previewSummary.textContent = draft.summary.trim() || "Your revised summary will appear here.";
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
      previewImage.alt = asset.altText || "Private recipe image preview";
      previewImage.hidden = false;
    }
    if (previewImagePlaceholder) previewImagePlaceholder.hidden = true;
    const label = asset.moderationStatus === "approved" ? "approved" : "pending editorial review";
    setMediaStatus(`Attached · ${label}`, asset.moderationStatus === "approved" ? "success" : "neutral");
    if (previewMediaStatus) previewMediaStatus.textContent = `Attached image is ${label}.`;
  }

  async function restoreMedia(assetId) {
    if (!assetId || mediaUploader?.dataset.mediaEnabled !== "true") return;
    try {
      const response = await fetch("/api/media/mine?limit=50", { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const payload = await response.json();
      const asset = payload.assets?.find((item) => item.id === assetId);
      if (asset) renderMedia(asset);
    } catch {
      // Text revision remains available if private media lookup fails.
    }
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
    if (previewMediaStatus) previewMediaStatus.textContent = "Upload an eligible hero image before resubmitting.";
    scheduleSave();
  }

  function saveLocal() {
    if (!storageKey) return;
    try {
      const draft = collectDraft();
      localStorage.setItem(storageKey, JSON.stringify({
        version: 1,
        baseRevision,
        savedAt: new Date().toISOString(),
        draft,
        note: contributorNote?.value || "",
      }));
      setStatus(`Saved locally at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, "success");
      updatePreview(draft);
    } catch {
      setStatus("This browser could not save the revision.", "error");
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    setStatus("Saving local revision…");
    saveTimer = window.setTimeout(saveLocal, 450);
    updatePreview();
  }

  function populateDraft(draft) {
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
    restoreMedia(draft.mediaAssetId);
  }

  function restoreLocal() {
    if (!storageKey) return;
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      stored = null;
    }
    if (!stored?.draft || Number(stored.baseRevision) !== baseRevision) {
      updatePreview();
      return;
    }
    populateDraft(stored.draft);
    if (contributorNote && typeof stored.note === "string") contributorNote.value = stored.note;
    const savedAt = stored.savedAt ? new Date(stored.savedAt) : null;
    setStatus(savedAt && !Number.isNaN(savedAt.getTime())
      ? `Restored local revision from ${savedAt.toLocaleString()}`
      : "Restored local revision.", "success");
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
    if (!response.ok || !payload.valid || !payload.draft) throw new Error("Fix the validation issues before resubmitting.");
    return payload.draft;
  }

  async function resubmit() {
    if (revisionRoot.dataset.resubmitEnabled !== "true" || !resubmitButton) return;
    const draft = collectDraft();
    if (!draft.mediaAssetId) {
      setStatus("Upload and attach an eligible hero image before resubmitting.", "error");
      return;
    }
    resubmitButton.disabled = true;
    renderErrors([]);
    setStatus("Validating complete revision…");
    try {
      const validatedDraft = await validateDraft(draft);
      setStatus("Committing immutable snapshots and revised recipe…");
      const response = await fetch(`/api/recipes/${revisionRoot.dataset.recipeId}/resubmit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          draft: validatedDraft,
          note: contributorNote?.value.trim() || "",
          expectedRevision: baseRevision,
          csrfToken: revisionRoot.dataset.csrf || "",
          sessionCsrf: revisionRoot.dataset.sessionCsrf || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        renderErrors(payload.errors || []);
        throw new Error(payload.error || "Recipe resubmission failed.");
      }
      if (storageKey) localStorage.removeItem(storageKey);
      setStatus(`Content revision ${payload.revision.contentRevision} submitted for editorial review.`, "success");
      resubmitButton.textContent = "Resubmitted";
      window.setTimeout(() => window.location.assign("/account/submissions"), 800);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Recipe resubmission failed.", "error");
      resubmitButton.disabled = false;
    }
  }

  revisionRoot.addEventListener("click", (event) => {
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
    if (target.matches("[data-upload-media]")) uploadMedia();
    if (target.matches("[data-clear-media]")) detachMedia();
    if (target.matches("[data-resubmit-recipe]")) resubmit();
    if (target.matches("[data-discard-local]")) {
      if (!window.confirm("Discard local revision edits and reload the D1 version?")) return;
      if (storageKey) localStorage.removeItem(storageKey);
      window.location.reload();
    }
  });

  form?.addEventListener("input", scheduleSave);
  form?.addEventListener("change", scheduleSave);
  form?.addEventListener("submit", (event) => event.preventDefault());
  restoreLocal();
}
