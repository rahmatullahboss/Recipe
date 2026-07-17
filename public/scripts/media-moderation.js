const moderationRoot = document.querySelector("[data-media-moderation]");

if (moderationRoot) {
  moderationRoot.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-moderation-status]");
    if (!button) return;

    const card = button.closest("[data-media-card]");
    const mediaId = card?.dataset.mediaId;
    const nextStatus = button.dataset.moderationStatus;
    const reason = card?.querySelector("[data-moderation-reason]")?.value.trim() || "";
    const result = card?.querySelector("[data-moderation-result]");
    const buttons = [...card.querySelectorAll("button[data-moderation-status]")];

    if (!mediaId || !nextStatus) return;
    if ((nextStatus === "rejected" || nextStatus === "quarantined") && reason.length < 5) {
      if (result) {
        result.textContent = "Add a short moderation reason before rejecting or quarantining.";
        result.dataset.state = "error";
      }
      return;
    }

    buttons.forEach((control) => { control.disabled = true; });
    if (result) {
      result.textContent = `Saving ${nextStatus} decision…`;
      result.dataset.state = "neutral";
    }

    try {
      const response = await fetch(`/api/media/${encodeURIComponent(mediaId)}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          reason,
          csrfToken: moderationRoot.dataset.csrf || "",
          sessionCsrf: moderationRoot.dataset.sessionCsrf || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Moderation update failed.");

      if (result) {
        result.textContent = `Media marked ${nextStatus}.`;
        result.dataset.state = "success";
      }

      const badge = card.querySelector(".moderation-badge");
      if (badge) {
        badge.textContent = nextStatus;
        badge.className = `moderation-badge moderation-badge--${nextStatus}`;
      }

      if (nextStatus === "approved" || nextStatus === "rejected") {
        window.setTimeout(() => {
          card.remove();
          if (!moderationRoot.querySelector("[data-media-card]")) {
            const empty = document.createElement("div");
            empty.className = "moderation-empty";
            empty.setAttribute("role", "status");
            empty.innerHTML = "<h2>No pending images</h2><p>The moderation queue is currently clear.</p>";
            moderationRoot.querySelector(".moderation-grid")?.replaceWith(empty);
          }
        }, 500);
      }
    } catch (error) {
      if (result) {
        result.textContent = error instanceof Error ? error.message : "Moderation update failed.";
        result.dataset.state = "error";
      }
      buttons.forEach((control) => { control.disabled = false; });
    }
  });
}
