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

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function addMaximumError(
  errors: DraftValidationError[],
  path: string,
  value: string,
  maximum: number,
): void {
  if (value.length > maximum) {
    errors.push({ path, message: `Must contain no more than ${maximum} characters.` });
  }
}

export function validateRecipeDraft(input: unknown): DraftValidationResult {
  const source = asRecord(input);
  const errors: DraftValidationError[] = [];

  const title = cleanText(source.title);
  const summary = cleanText(source.summary);
  const description = cleanText(source.description);
  const countryCode = cleanText(source.countryCode).toUpperCase();
  const requestedLanguage = cleanText(source.languageCode).toLowerCase();
  const languageCode = supportedRecipeLanguages.includes(requestedLanguage as RecipeLanguage)
    ? requestedLanguage as RecipeLanguage
    : "en";
  const requestedMeasurement = cleanText(source.measurementSystem).toLowerCase();
  const measurementSystem: MeasurementSystem = requestedMeasurement === "us" ? "us" : "metric";
  const prepMinutes = cleanInteger(source.prepMinutes);
  const cookMinutes = cleanInteger(source.cookMinutes);
  const servings = cleanInteger(source.servings, 1);
  const requestedDifficulty = cleanText(source.difficulty).toLowerCase();
  const difficulty: RecipeDifficulty = ["easy", "medium", "hard"].includes(requestedDifficulty)
    ? requestedDifficulty as RecipeDifficulty
    : "easy";

  addLengthError(errors, "title", title, 5, 120);
  addLengthError(errors, "summary", summary, 20, 240);
  addMaximumError(errors, "description", description, 5000);
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

  const rawCategories = Array.isArray(source.categories) ? source.categories : [];
  const categories = [...new Set(rawCategories.map((item) => cleanText(item).toLowerCase()).filter(Boolean))];
  if (categories.length < 1) {
    errors.push({ path: "categories", message: "Select at least one category or cuisine." });
  }
  if (categories.length > 8) {
    errors.push({ path: "categories", message: "Select no more than eight categories." });
  }
  categories.forEach((category, index) => addMaximumError(errors, `categories.${index}`, category, 80));

  const rawIngredients = Array.isArray(source.ingredients) ? source.ingredients : [];
  if (rawIngredients.length > 60) {
    errors.push({ path: "ingredients", message: "A recipe can contain no more than 60 ingredients." });
  }
  const ingredients = rawIngredients.map((value) => {
    const ingredient = asRecord(value);
    return {
      item: cleanText(ingredient.item),
      amount: cleanText(ingredient.amount),
      unit: cleanText(ingredient.unit),
      note: cleanText(ingredient.note),
    };
  }).filter((ingredient) => ingredient.item || ingredient.amount || ingredient.unit || ingredient.note);

  if (ingredients.length < 2) {
    errors.push({ path: "ingredients", message: "Add at least two ingredients." });
  }
  ingredients.forEach((ingredient, index) => {
    addLengthError(errors, `ingredients.${index}.item`, ingredient.item, 2, 120);
    addMaximumError(errors, `ingredients.${index}.amount`, ingredient.amount, 32);
    addMaximumError(errors, `ingredients.${index}.unit`, ingredient.unit, 32);
    addMaximumError(errors, `ingredients.${index}.note`, ingredient.note, 160);
  });

  const rawSteps = Array.isArray(source.steps) ? source.steps : [];
  if (rawSteps.length > 80) {
    errors.push({ path: "steps", message: "A recipe can contain no more than 80 preparation steps." });
  }
  const steps = rawSteps.map((value) => {
    const step = asRecord(value);
    const instruction = cleanText(step.instruction);
    const timerValue = step.timerMinutes === "" || step.timerMinutes === null || step.timerMinutes === undefined
      ? null
      : cleanInteger(step.timerMinutes);
    return { instruction, timerMinutes: timerValue };
  }).filter((step) => step.instruction || step.timerMinutes !== null);

  if (steps.length < 2) {
    errors.push({ path: "steps", message: "Add at least two preparation steps." });
  }
  steps.forEach((step, index) => {
    addLengthError(errors, `steps.${index}.instruction`, step.instruction, 10, 1000);
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
    categories: categories.slice(0, 8),
    ingredients: ingredients.slice(0, 60),
    steps: steps.slice(0, 80),
  };

  return {
    valid: errors.length === 0,
    errors,
    draft: errors.length === 0 ? draft : null,
  };
}
