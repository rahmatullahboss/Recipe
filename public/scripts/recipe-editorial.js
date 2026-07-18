const root = document.querySelector("[data-recipe-editorial]");

if (root) {
  const result = root.querySelector("[data-editorial-result]");
  const reason = root.querySelector("[data-editorial-reason]");
  const scheduledAt = root.querySelector("[data-scheduled-publish-at]");
  const buttons = [...root.querySelectorAll("[data-editorial-action]")];
  const initialDisabled = new Map(buttons.map((button) => [button, button.disabled]));

  function setResult(message, state = "neutral") {
    if (!result) return;
    result.textContent = message;
    result.dataset.state = state;
  }

  function restoreButtons() {
    buttons.forEach((button) => { button.disabled = initialDisabled.get(button) === true; });
  }

  async function decide(action) {
    const note = reason?.value.trim() || "";
    if ((action === "archive" || action === "restore") && note.length < 5) {
      setResult(`Add a clear reason before ${action === "restore" ? "restoring" : "archiving"}.`, "error");
      return;
    }
    if (action === "request_changes" && note.length < 10) {
      setResult("Describe the required contributor changes with at least 10 characters.", "error");
      return;
    }

    let scheduledPublishAt = "";
    if (action === "schedule") {
      const value = scheduledAt?.value || "";
      if (!value) {
        setResult("Choose a UTC publication date and time.", "error");
        return;
      }
      scheduledPublishAt = `${value}:00Z`;
      const timestamp = new Date(scheduledPublishAt).getTime();
      if (!Number.isFinite(timestamp) || timestamp < Date.now() + 5 * 60 * 1000) {
        setResult("Scheduled publication must be at least five minutes in the future.", "error");
        return;
      }
    }

    buttons.forEach((button) => { button.disabled = true; });
    const progress = {
      publish: "Publishing recipe…",
      schedule: "Saving publication schedule…",
      cancel_schedule: "Cancelling publication schedule…",
      request_changes: "Returning recipe to the contributor…",
      archive: "Archiving submission…",
      restore: "Restoring recipe to review…",
    }[action] || "Applying editorial action…";
    setResult(progress);

    try {
      const response = await fetch(`/api/recipes/${root.dataset.recipeId}/editorial`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action,
          reason: note,
          scheduledPublishAt,
          expectedRevision: Number(root.dataset.revision),
          csrfToken: root.dataset.csrf || "",
          sessionCsrf: root.dataset.sessionCsrf || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Editorial decision failed.");
      const message = {
        publish: "Recipe published.",
        schedule: "Publication schedule saved.",
        cancel_schedule: "Publication schedule cancelled.",
        request_changes: "Changes requested from the contributor.",
        archive: "Submission archived.",
        restore: "Archived recipe restored to review.",
      }[action] || "Editorial action completed.";
      setResult(message, "success");
      const destination = action === "schedule" || action === "cancel_schedule"
        ? window.location.href
        : "/admin/recipes";
      window.setTimeout(() => window.location.assign(destination), 700);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Editorial decision failed.", "error");
      restoreButtons();
    }
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-editorial-action]");
    if (!button) return;
    decide(button.dataset.editorialAction);
  });
}
