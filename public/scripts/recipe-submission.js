const submissionRoot = document.querySelector("[data-recipe-editor]");

if (submissionRoot) {
  const form = submissionRoot.querySelector("form");
  const section = submissionRoot.querySelector("[data-recipe-submission]");
  const button = submissionRoot.querySelector("[data-submit-recipe]");
  const status = submissionRoot.querySelector("[data-submission-status]");
  const csrf = submissionRoot.querySelector("[data-submission-csrf]");
  const sessionCsrf = submissionRoot.querySelector("[data-submission-session-csrf]");
  const errorsPanel = submissionRoot.querySelector("[data-validation-errors]");
  const ingredientList = submissionRoot.querySelector("[data-ingredient-rows]");
  const stepList = submissionRoot.querySelector("[data-step-rows]");

  function field(name) {
    return form?.elements.namedItem(name);
  }

  function setStatus(message, state = "neutral") {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
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

  async function validate(draft) {
    const response = await fetch("/api/recipes/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(draft),
    });
    const payload = await response.json();
    renderErrors(payload.errors || []);
    if (!response.ok || !payload.valid || !payload.draft) {
      throw new Error("Fix the validation issues before submitting.");
    }
    return payload.draft;
  }

  async function submit() {
    if (section?.dataset.submissionEnabled !== "true" || !button) return;
    const draft = collectDraft();
    if (!draft.mediaAssetId) {
      setStatus("Upload and attach a hero image before submitting.", "error");
      return;
    }

    button.disabled = true;
    setStatus("Validating complete recipe…");
    renderErrors([]);
    try {
      const validatedDraft = await validate(draft);
      setStatus("Committing recipe to the private review queue…");
      const response = await fetch("/api/recipes/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          draft: validatedDraft,
          csrfToken: csrf?.value || "",
          sessionCsrf: sessionCsrf?.value || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        renderErrors(payload.errors || []);
        throw new Error(payload.error || "Recipe submission failed.");
      }
      setStatus("Submitted for editorial review.", "success");
      button.textContent = "Submitted";
      button.disabled = true;
      section.dataset.submissionId = payload.submission.id;
      localStorage.removeItem("ozzyl:recipe-draft:v1");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Recipe submission failed.", "error");
      button.disabled = false;
    }
  }

  submissionRoot.addEventListener("click", (event) => {
    const target = event.target.closest("[data-submit-recipe]");
    if (target) submit();
  });
}
