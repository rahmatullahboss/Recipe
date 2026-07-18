const root = document.querySelector("[data-schedule-processor]");

if (root) {
  const button = root.querySelector("[data-process-schedules]");
  const result = root.querySelector("[data-schedule-result]");

  function setResult(message, state = "neutral") {
    if (!result) return;
    result.textContent = message;
    result.dataset.state = state;
  }

  button?.addEventListener("click", async () => {
    button.disabled = true;
    setResult("Checking due scheduled recipes…");
    try {
      const response = await fetch("/api/recipes/scheduled/process", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          limit: 25,
          csrfToken: root.dataset.csrf || "",
          sessionCsrf: root.dataset.sessionCsrf || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Scheduled publication processing failed.");
      const published = payload.result?.published?.length ?? 0;
      const skipped = payload.result?.skipped?.length ?? 0;
      setResult(`Published ${published} due recipe${published === 1 ? "" : "s"}; ${skipped} skipped.`, skipped ? "warning" : "success");
      if (published > 0) window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Scheduled publication processing failed.", "error");
    } finally {
      button.disabled = false;
    }
  });
}
