export class LLMProviderError extends Error {
  constructor(message, code = "LLM_ERROR") {
    super(message);
    this.name = "LLMProviderError";
    this.code = code;
  }
}
