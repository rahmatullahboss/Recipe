const UNIT_DEFINITIONS = {
  ml: { dimension: "volume", toBase: 1 },
  milliliter: { dimension: "volume", toBase: 1 },
  milliliters: { dimension: "volume", toBase: 1 },
  l: { dimension: "volume", toBase: 1000 },
  liter: { dimension: "volume", toBase: 1000 },
  liters: { dimension: "volume", toBase: 1000 },
  litre: { dimension: "volume", toBase: 1000 },
  litres: { dimension: "volume", toBase: 1000 },
  tsp: { dimension: "volume", toBase: 4.92892 },
  teaspoon: { dimension: "volume", toBase: 4.92892 },
  teaspoons: { dimension: "volume", toBase: 4.92892 },
  tbsp: { dimension: "volume", toBase: 14.7868 },
  tablespoon: { dimension: "volume", toBase: 14.7868 },
  tablespoons: { dimension: "volume", toBase: 14.7868 },
  cup: { dimension: "volume", toBase: 236.588 },
  cups: { dimension: "volume", toBase: 236.588 },
  g: { dimension: "weight", toBase: 1 },
  gram: { dimension: "weight", toBase: 1 },
  grams: { dimension: "weight", toBase: 1 },
  kg: { dimension: "weight", toBase: 1000 },
  kilogram: { dimension: "weight", toBase: 1000 },
  kilograms: { dimension: "weight", toBase: 1000 },
  oz: { dimension: "weight", toBase: 28.3495 },
  ounce: { dimension: "weight", toBase: 28.3495 },
  ounces: { dimension: "weight", toBase: 28.3495 },
  lb: { dimension: "weight", toBase: 453.592 },
  lbs: { dimension: "weight", toBase: 453.592 },
  pound: { dimension: "weight", toBase: 453.592 },
  pounds: { dimension: "weight", toBase: 453.592 },
};

const FRACTIONS = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [0.333, "⅓"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [0.667, "⅔"],
  [0.75, "¾"],
  [0.875, "⅞"],
];

function parseAmount(value) {
  if (!value) return null;
  const normalised = value.trim().replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(normalised)) return Number(normalised);

  const mixed = normalised.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);

  const fraction = normalised.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);

  return null;
}

function formatNumber(value, preferFractions = false) {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) < 0.005) return "0";

  if (preferFractions) {
    const whole = Math.floor(value + 0.001);
    const decimal = value - whole;
    let closest = null;

    for (const [fractionValue, label] of FRACTIONS) {
      const distance = Math.abs(decimal - fractionValue);
      if (!closest || distance < closest.distance) closest = { distance, label, fractionValue };
    }

    if (closest && closest.distance <= 0.045) {
      if (whole === 0) return closest.label;
      if (closest.fractionValue >= 0.99) return String(whole + 1);
      return `${whole} ${closest.label}`;
    }

    if (decimal < 0.045) return String(whole);
  }

  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return String(Math.round(value * 10) / 10);
  return String(Math.round(value * 100) / 100);
}

function normaliseUnit(unit) {
  return unit?.trim().toLowerCase().replace(/\.$/, "") ?? "";
}

function chooseMetric(baseValue, dimension) {
  if (dimension === "weight") {
    return baseValue >= 1000
      ? { value: baseValue / 1000, unit: "kg", fractions: false }
      : { value: baseValue, unit: "g", fractions: false };
  }

  return baseValue >= 1000
    ? { value: baseValue / 1000, unit: "l", fractions: false }
    : { value: baseValue, unit: "ml", fractions: false };
}

function chooseUs(baseValue, dimension) {
  if (dimension === "weight") {
    return baseValue >= 453.592
      ? { value: baseValue / 453.592, unit: "lb", fractions: true }
      : { value: baseValue / 28.3495, unit: "oz", fractions: false };
  }

  if (baseValue >= 59.147) return { value: baseValue / 236.588, unit: "cups", fractions: true };
  if (baseValue >= 14.7868) return { value: baseValue / 14.7868, unit: "tbsp", fractions: true };
  return { value: baseValue / 4.92892, unit: "tsp", fractions: true };
}

function convertIngredient(amount, unit, scale, system) {
  const scaledAmount = amount * scale;
  if (system === "original") {
    return { amount: formatNumber(scaledAmount, ["cup", "cups", "tbsp", "tsp"].includes(normaliseUnit(unit))), unit };
  }

  const definition = UNIT_DEFINITIONS[normaliseUnit(unit)];
  if (!definition) return { amount: formatNumber(scaledAmount, false), unit };

  const baseValue = scaledAmount * definition.toBase;
  const converted = system === "metric"
    ? chooseMetric(baseValue, definition.dimension)
    : chooseUs(baseValue, definition.dimension);

  return {
    amount: formatNumber(converted.value, converted.fractions),
    unit: converted.unit,
  };
}

function initialiseRecipeTools(root) {
  const servingInput = root.querySelector("[data-serving-input]");
  const servingOutput = root.querySelector("[data-serving-output]");
  const measurementButtons = [...root.querySelectorAll("[data-measurement-system]")];
  const ingredients = [...root.querySelectorAll("[data-ingredient]")];
  const originalServings = Number(root.dataset.originalServings || "1");
  let system = root.dataset.defaultSystem || "original";

  function update() {
    const desiredServings = Math.max(Number(servingInput?.value || originalServings), 0.5);
    const scale = desiredServings / originalServings;
    if (servingOutput) servingOutput.textContent = formatNumber(desiredServings, false);

    for (const ingredient of ingredients) {
      const amount = parseAmount(ingredient.dataset.amount || "");
      const unit = ingredient.dataset.unit || "";
      const amountNode = ingredient.querySelector("[data-converted-amount]");
      const unitNode = ingredient.querySelector("[data-converted-unit]");

      if (!amountNode || !unitNode) continue;
      if (amount === null) {
        amountNode.textContent = ingredient.dataset.amount || "As needed";
        unitNode.textContent = unit;
        continue;
      }

      const converted = convertIngredient(amount, unit, scale, system);
      amountNode.textContent = converted.amount;
      unitNode.textContent = converted.unit;
    }

    for (const button of measurementButtons) {
      const active = button.dataset.measurementSystem === system;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
    }
  }

  servingInput?.addEventListener("input", update);
  servingInput?.addEventListener("change", update);
  for (const button of measurementButtons) {
    button.addEventListener("click", () => {
      system = button.dataset.measurementSystem || "original";
      update();
    });
  }

  root.querySelector("[data-print-recipe]")?.addEventListener("click", () => window.print());
  root.querySelector("[data-copy-recipe]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(window.location.href);
      const previous = button.textContent;
      button.textContent = "Link copied";
      setTimeout(() => { button.textContent = previous; }, 1800);
    } catch {
      window.prompt("Copy this recipe link:", window.location.href);
    }
  });

  update();
}

for (const root of document.querySelectorAll("[data-recipe-tools]")) {
  initialiseRecipeTools(root);
}
