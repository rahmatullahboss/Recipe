export class RecipeSubmissionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RecipeSubmissionError";
    this.code = code;
  }
}
