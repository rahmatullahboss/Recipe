window.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("[data-cooking-mode]");
  const dataNode = document.querySelector("#cook-data");
  if (!root || !dataNode) return;

  let data;
  try {
    data = JSON.parse(dataNode.textContent || "{}");
  } catch {
    return;
  }

  const steps = Array.isArray(data.steps) ? data.steps : [];
  if (!steps.length) return;

  const storageKey = `ozzyl:cook-progress:${data.slug}`;
  const currentNode = root.querySelector("[data-cook-current]");
  const progress = root.querySelector("[data-cook-progress]");
  const numberNode = root.querySelector("[data-cook-step-number]");
  const textNode = root.querySelector("[data-cook-step-text]");
  const previousButton = root.querySelector("[data-cook-previous]");
  const nextButton = root.querySelector("[data-cook-next]");
  const status = root.querySelector("[data-cook-status]");
  const timerPanel = root.querySelector("[data-cook-timer]");
  const timerDisplay = root.querySelector("[data-timer-display]");
  const timerStart = root.querySelector("[data-timer-start]");
  const timerPause = root.querySelector("[data-timer-pause]");
  const timerReset = root.querySelector("[data-timer-reset]");

  let currentIndex = Math.min(Math.max(Number(sessionStorage.getItem(storageKey) || 0), 0), steps.length - 1);
  let timerSeconds = 0;
  let remainingSeconds = 0;
  let timerDeadline = null;
  let timerInterval = null;
  let wakeLock = null;

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function formatTime(seconds) {
    const bounded = Math.max(Math.ceil(seconds), 0);
    const minutes = Math.floor(bounded / 60);
    const rest = bounded % 60;
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function updateTimerDisplay() {
    if (timerDisplay) timerDisplay.textContent = formatTime(remainingSeconds);
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch {
      wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    try {
      await wakeLock?.release();
    } catch {
      // The browser may already have released it.
    }
    wakeLock = null;
  }

  function playFinishedSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.8);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.8);
    } catch {
      // Audio feedback is optional.
    }
  }

  function stopInterval() {
    if (timerInterval) window.clearInterval(timerInterval);
    timerInterval = null;
  }

  function pauseTimer({ announce = true } = {}) {
    if (timerDeadline) remainingSeconds = Math.max((timerDeadline - Date.now()) / 1000, 0);
    timerDeadline = null;
    stopInterval();
    updateTimerDisplay();
    if (announce) setStatus("Timer paused.");
  }

  function finishTimer() {
    remainingSeconds = 0;
    timerDeadline = null;
    stopInterval();
    updateTimerDisplay();
    playFinishedSound();
    document.title = `Timer finished — ${data.title}`;
    setStatus("Timer finished. Continue when you are ready.");
  }

  function tickTimer() {
    if (!timerDeadline) return;
    remainingSeconds = Math.max((timerDeadline - Date.now()) / 1000, 0);
    updateTimerDisplay();
    if (remainingSeconds <= 0) finishTimer();
  }

  function startTimer() {
    if (remainingSeconds <= 0) remainingSeconds = timerSeconds;
    if (remainingSeconds <= 0) return;
    timerDeadline = Date.now() + remainingSeconds * 1000;
    stopInterval();
    timerInterval = window.setInterval(tickTimer, 250);
    tickTimer();
    requestWakeLock();
    setStatus("Timer running. The screen will stay awake when supported.");
  }

  function resetTimer() {
    timerDeadline = null;
    stopInterval();
    remainingSeconds = timerSeconds;
    updateTimerDisplay();
    setStatus(timerSeconds > 0 ? "Timer reset." : "This step has no suggested timer.");
  }

  function renderStep() {
    pauseTimer({ announce: false });
    const step = steps[currentIndex];
    timerSeconds = Math.max(Number(step.timerSeconds || 0), 0);
    remainingSeconds = timerSeconds;
    sessionStorage.setItem(storageKey, String(currentIndex));
    document.title = `Step ${currentIndex + 1}: ${data.title} — Ozzyl Recipes`;

    if (currentNode) currentNode.textContent = String(currentIndex + 1);
    if (progress) progress.value = currentIndex + 1;
    if (numberNode) numberNode.textContent = `Step ${currentIndex + 1}`;
    if (textNode) textNode.textContent = step.instruction;
    if (previousButton) previousButton.disabled = currentIndex === 0;
    if (nextButton) nextButton.textContent = currentIndex === steps.length - 1 ? "Finish cooking" : "Next step";
    if (timerPanel) timerPanel.hidden = timerSeconds <= 0;
    updateTimerDisplay();
    setStatus(timerSeconds > 0 ? `Suggested timer: ${formatTime(timerSeconds)}.` : "Move at your own pace, then continue.");
  }

  function move(direction) {
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    currentIndex = nextIndex;
    renderStep();
    textNode?.focus?.();
  }

  previousButton?.addEventListener("click", () => move(-1));
  nextButton?.addEventListener("click", () => {
    if (currentIndex === steps.length - 1) {
      pauseTimer({ announce: false });
      releaseWakeLock();
      sessionStorage.removeItem(storageKey);
      setStatus("Recipe complete. Great work — serve and enjoy.");
      nextButton.textContent = "Completed";
      nextButton.disabled = true;
      return;
    }
    move(1);
  });
  timerStart?.addEventListener("click", startTimer);
  timerPause?.addEventListener("click", () => pauseTimer());
  timerReset?.addEventListener("click", resetTimer);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") {
      if (currentIndex < steps.length - 1) move(1);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && timerDeadline) requestWakeLock();
  });
  window.addEventListener("pagehide", () => {
    stopInterval();
    releaseWakeLock();
  });

  renderStep();
});
