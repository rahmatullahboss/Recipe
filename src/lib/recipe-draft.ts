import { isSupportedMarket } from "./market";
import type { RecipeDifficulty } from "./db";

export const supportedRecipeLanguages = ["en", "fr", "de", "sv", "nl"] as const;
export type RecipeLanguage = typeof supportedRecipeLanguages[number];
export type MeasurementSystem = "us" | "metric";

export type RecipeDraftIngredient = {
  item: string;
  amount: string;
  unit: string;
  note: string;
};

export type RecipeDraftStep = {
  instruction: string;
  timerMinutes: number | null;
};

export type RecipeDraft = {
  title: string;
  summary: string;
  description: string;
  countryCode: string;
  languageCode: RecipeLanguage;
  measurementSystem: MeasurementSystem;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  difficulty: RecipeDifficulty;
  categories: string[];
  ingredients: RecipeDraftIngredient[];
  steps: RecipeDraftStep[];
};

export type DraftValidationError = {
  path: string;
  message: string;
};

export type DraftValidationResult = {
  valid: boolean;
  errors: DraftValidationError[];
  draft: RecipeDraft | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanInteger(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function addLengthError(
  errors: DraftValidationError[],
  path: string,
  value: string,
  minimum: number,
  maximum: number,
): void {
  if (value.length < minimum) {
    errors.push({ path, message: `Must contain at least ${minimum} characters.` });
  } else if (value.length > maximum) {
    errors.push({ path, message: `Must contain no more than ${maximum} characters.` });
  }
}

export function validateRecipeDraft(input: unknown): DraftValidationResult {
  const source = asRecord(input);
  const errors: DraftValidationError[] = [];

  const title = cleanText(source.title, 120);
  const summary = cleanText(source.summary, 240);
  const description = cleanText(source.description, 5000);
  const countryCode = cleanText(source.countryCode, 2).toUpperCase();
  const requestedLanguage = cleanText(source.languageCode, 5).toLowerCase();
  const languageCode = supportedRecipeLanguages.includes(requestedLanguage as RecipeLanguage)
    ? requestedLanguage as RecipeLanguage
    : "en";
  const requestedMeasurement = cleanText(source.measurementSystem, 10).toLowerCase();
  const measurementSystem: MeasurementSystem = requestedMeasurement === "us" ? "us" : "metric";
  const prepMinutes = cleanInteger(source.prepMinutes);
  const cookMinutes = cleanInteger(source.cookMinutes);
  const servings = cleanInteger(source.servings, 1);
  const requestedDifficulty = cleanText(source.difficulty, 10).toLowerCase();
  const difficulty: RecipeDifficulty = ["easy", "medium", "hard"].includes(requestedDifficulty)
    ? requestedDifficulty as RecipeDifficulty
    : "easy";

  addLengthError(errors, "title", title, 5, 120);
  addLengthError(errors, "summary", summary, 20, 240);
  if (description.length > 5000) {
    errors.push({ path: "description", message: "Must contain no more than 5000 characters." });
  }
  if (!isSupportedMarket(countryCode)) {
    errors.push({ path: "countryCode", message: "Select a supported recipe market." });
  }
  if (!supportedRecipeLanguages.includes(requestedLanguage as RecipeLanguage)) {
    errors.push({ path: "languageCode", message: "Select a supported recipe language." });
  }
  if (!["us", "metric"].includes(requestedMeasurement)) {
    errors.push({ path: "measurementSystem", message: "Select US or metric measurements." });
  }
  if (prepMinutes < 0 || prepMinutes > 1440) {
    errors.push({ path: "prepMinutes", message: "Preparation time must be between 0 and 1440 minutes." });
  }
  if (cookMinutes < 0 || cookMinutes > 4320) {
    errors.push({ path: "cookMinutes", message: "Cooking time must be between 0 and 4320 minutes." });
  }
  if (servings < 1 || servings > 200) {
    errors.push({ path: "servings", message: "Servings must be between 1 and 200." });
  }

  const categories = Array.isArray(source.categories)
    ? [...new Set(source.categories.map((item) => cleanText(item, 80).toLowerCase()).filter(Boolean))].slice(0, 8)
    : [];
  if (categories.length < 1) {
    errors.push({ path: "categories", message: "Select at least one category or cuisine." });
  }

  const rawIngredients = Array.isArray(source.ingredients) ? source.ingredients : [];
  const ingredients = rawIngredients.slice(0, 60).map((value) => {
    const ingredient = asRecord(value);
    return {
      item: cleanText(ingredient.item, 120),
      amount: cleanText(ingredient.amount, 32),
      unit: cleanText(ingredient.unit, 32),
      note: cleanText(ingredient.note, 160),
    };
  }).filter((ingredient) => ingredient.item || ingredient.amount || ingredient.unit || ingredient.note);

  if (ingredients.length < 2) {
    errors.push({ path: "ingredients", message: "Add at least two ingredients." });
  }
  ingredients.forEach((ingredient, index) => {
    if (ingredient.item.length < 2) {
      errors.push({ path: `ingredients.${index}.item`, message: "Ingredient name is required." });
    }
  });

  const rawSteps = Array.isArray(source.steps) ? source.steps : [];
  const steps = rawSteps.slice(0, 80).map((value) => {
    const step = asRecord(value);
    const instruction = cleanText(step.instruction, 1000);
    const timerValue = step.timerMinutes === "" || step.timerMinutes === null || step.timerMinutes === undefined
      ? null
      : cleanInteger(step.timerMinutes);
    return { instruction, timerMinutes: timerValue };
  }).filter((step) => step.instruction || step.timerMinutes !== null);

  if (steps.length < 2) {
    errors.push({ path: "steps", message: "Add at least two preparation steps." });
  }
  steps.forEach((step, index) => {
    if (step.instruction.length < 10) {
      errors.push({ path: `steps.${index}.instruction`, message: "Each step must contain at least 10 characters." });
    }
    if (step.timerMinutes !== null && (step.timerMinutes < 0 || step.timerMinutes > 1440)) {
      errors.push({ path: `steps.${index}.timerMinutes`, message: "Timer must be between 0 and 1440 minutes." });
    }
  });

  const draft: RecipeDraft = {
    title,
    summary,
    description,
    countryCode,
    languageCode,
    measurementSystem,
    prepMinutes,
    cookMinutes,
    servings,
    difficulty,
    categories,
    ingredients,
    steps,
  };

  return {
    valid: errors.length === 0,
    errors,
    draft: errors.length === 0 ? draft : null,
  };
}
