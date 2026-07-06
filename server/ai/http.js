import { LLMProviderError } from "./errors.js";

export async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new LLMProviderError(`模型接口返回 ${response.status}: ${text.slice(0, 180)}`, "PROVIDER_HTTP_ERROR");
    }
    return text ? JSON.parse(text) : {};
  } catch (error) {
    if (error.name === "AbortError") {
      throw new LLMProviderError("模型请求超时", "TIMEOUT");
    }
    if (error instanceof LLMProviderError) throw error;
    throw new LLMProviderError(error.message || "模型请求失败", "NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}
