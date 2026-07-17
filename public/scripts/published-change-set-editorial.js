const root = document.querySelector("[data-change-set-editorial]");

if (root) {
  const result = root.querySelector("[data-change-set-result]");
  const reason = root.querySelector("[data-change-set-reason]");
  const buttons = [...root.querySelectorAll("[data-change-set-action]")];

  function setResult(message, state = "neutral") {
    if (!result) return;
    result.textContent = message;
    result.dataset.state = state;
  }

  async function decide(action) {
    const note = reason?.value.trim() || "";
    if (action === "request_changes" && note.length < 10) {
      setResult("Describe the required contributor changes with at least 10 characters.", "error");
      return;
    }
    if (action === "cancel" && note.length < 5) {
      setResult("Add a clear reason before closing the proposal.", "error");
      return;
    }

    buttons.forEach((button) => { button.disabled = true; });
    setResult(action === "approve"
      ? "Revalidating the base, media, derivatives, and atomically promoting the private change set…"
      : action === "request_changes"
        ? "Returning the private proposal to the contributor…"
        : "Closing the private proposal…");
    try {
      const response = await fetch(`/api/recipe-change-sets/${root.dataset.changeSetId}/editorial`, {
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
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Change-set editorial decision failed.");
      setResult(action === "approve"
        ? `Published recipe promoted atomically to content revision ${payload.changeSet.contentRevision}.`
        : action === "request_changes"
          ? "Changes requested from the contributor."
          : "Private proposal closed.", "success");
      window.setTimeout(() => window.location.assign(payload.queueUrl || "/admin/recipe-change-sets"), 800);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Change-set editorial decision failed.", "error");
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-change-set-action]");
    if (!button) return;
    decide(button.dataset.changeSetAction);
  });
}
