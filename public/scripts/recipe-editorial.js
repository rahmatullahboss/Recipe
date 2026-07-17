const root = document.querySelector("[data-recipe-editorial]");

if (root) {
  const result = root.querySelector("[data-editorial-result]");
  const reason = root.querySelector("[data-editorial-reason]");
  const buttons = [...root.querySelectorAll("[data-editorial-action]")];

  function setResult(message, state = "neutral") {
    if (!result) return;
    result.textContent = message;
    result.dataset.state = state;
  }

  async function decide(action) {
    const note = reason?.value.trim() || "";
    if (action === "archive" && note.length < 5) {
      setResult("Add a clear reason before archiving.", "error");
      return;
    }

    buttons.forEach((button) => { button.disabled = true; });
    setResult(action === "publish" ? "Publishing recipe…" : "Archiving submission…");
    try {
      const response = await fetch(`/api/recipes/${root.dataset.recipeId}/editorial`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action,
          reason: note,
          expectedRevision: Number(root.dataset.revision),
          csrfToken: root.dataset.csrf || "",
          sessionCsrf: root.dataset.sessionCsrf || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Editorial decision failed.");
      setResult(action === "publish" ? "Recipe published." : "Submission archived.", "success");
      window.setTimeout(() => window.location.assign("/admin/recipes"), 700);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Editorial decision failed.", "error");
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-editorial-action]");
    if (!button) return;
    decide(button.dataset.editorialAction);
  });
}
