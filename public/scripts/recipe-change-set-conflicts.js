const workspace = document.querySelector("[data-recipe-conflict-workspace]");

if (workspace) {
  const button = workspace.querySelector("[data-rebase-change-set]");
  const result = workspace.querySelector("[data-rebase-result]");

  function setResult(message, state = "neutral") {
    if (!result) return;
    result.textContent = message;
    result.dataset.state = state;
  }

  function collectResolutions() {
    const resolutions = {};
    const unresolved = [];
    for (const unit of workspace.querySelectorAll('[data-conflict-unit][data-conflict-state="conflict"]')) {
      const key = unit.dataset.conflictKey;
      const selected = unit.querySelector(`input[name="resolution-${CSS.escape(key)}"]:checked`);
      if (!selected) unresolved.push(key);
      else resolutions[key] = selected.value;
    }
    return { resolutions, unresolved };
  }

  async function rebase() {
    if (!button) return;
    const { resolutions, unresolved } = collectResolutions();
    if (unresolved.length) {
      setResult(`Choose live or proposed for ${unresolved.length} unresolved conflict${unresolved.length === 1 ? "" : "s"}.`, "error");
      return;
    }
    if (!window.confirm("Rebase this private proposal onto the current live recipe? This will not approve or modify the live recipe.")) return;

    button.disabled = true;
    setResult("Revalidating the three-way comparison and rebasing the private proposal…");
    try {
      const response = await fetch(`/api/recipe-change-sets/${workspace.dataset.changeSetId}/rebase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          expectedRevision: Number(workspace.dataset.revision),
          resolutions,
          csrfToken: workspace.dataset.csrf || "",
          sessionCsrf: workspace.dataset.sessionCsrf || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Private rebase failed.");
      setResult(`Private proposal rebased to change-set revision ${payload.changeSet.revision}. The live recipe remains unchanged.`, "success");
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Private rebase failed.", "error");
      button.disabled = false;
    }
  }

  button?.addEventListener("click", rebase);
}
