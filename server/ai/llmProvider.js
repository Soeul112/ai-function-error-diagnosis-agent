import "dotenv/config";
import {
  AI_TUTOR_SYSTEM_PROMPT,
  PRACTICE_JSON_SCHEMA,
  TUTOR_JSON_SCHEMA,
  buildPracticeUserPrompt,
  buildTutorUserPrompt,
} from "./prompts.js";
import { LLMProviderError } from "./errors.js";
import { callGeminiJson } from "./providers/gemini.js";
import { callGroqJson } from "./providers/groq.js";
import { callOpenRouterJson } from "./providers/openrouter.js";

const PROVIDERS = {
  gemini: {
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-1.5-flash",
    callJson: callGeminiJson,
  },
  groq: {
    envKey: "GROQ_API_KEY",
    defaultModel: "llama-3.1-8b-instant",
    callJson: callGroqJson,
  },
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    defaultModel: "meta-llama/llama-3.1-8b-instruct:free",
    callJson: callOpenRouterJson,
  },
};

export function getProviderConfig(providerName = process.env.LLM_PROVIDER || "gemini") {
  const normalized = String(providerName || "gemini").toLowerCase();
  const provider = PROVIDERS[normalized] ? normalized : "gemini";
  const definition = PROVIDERS[provider];
  const modelEnv = `${provider.toUpperCase()}_MODEL`;
  return {
    provider,
    apiKey: process.env[definition.envKey],
    model: process.env[modelEnv] || definition.defaultModel,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 12000),
    callJson: definition.callJson,
  };
}

export async function generateTutorTurn(context) {
  const config = getProviderConfig();
  const payload = await generateJson({
    config,
    userPrompt: buildTutorUserPrompt(context),
    schema: TUTOR_JSON_SCHEMA,
    schemaName: "aiTutorDiagnosis",
  });
  return {
    payload: normalizeTutorPayload(payload, context),
    meta: {
      provider: config.provider,
      model: config.model,
      status: "live",
    },
  };
}

export async function generatePractice(context) {
  const config = getProviderConfig();
  const payload = await generateJson({
    config,
    userPrompt: buildPracticeUserPrompt(context),
    schema: PRACTICE_JSON_SCHEMA,
    schemaName: "aiPractice",
  });
  return {
    payload: normalizePracticePayload(payload, context),
    meta: {
      provider: config.provider,
      model: config.model,
      status: "live",
    },
  };
}

async function generateJson({ config, userPrompt, schema, schemaName }) {
  if (!config.apiKey) {
    throw new LLMProviderError(`${config.provider} API Key 未配置`, "MISSING_API_KEY");
  }
  const rawText = await config.callJson({
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs,
    systemPrompt: AI_TUTOR_SYSTEM_PROMPT,
    userPrompt,
    schema,
    schemaName,
  });
  return parseJsonObject(rawText);
}

export function parseJsonObject(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) throw new LLMProviderError("模型返回为空", "EMPTY_RESPONSE");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1].trim() : text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new LLMProviderError("模型未返回 JSON 对象", "INVALID_JSON");
  }
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    throw new LLMProviderError("模型 JSON 解析失败", "INVALID_JSON");
  }
}

export function normalizeTutorPayload(payload, context = {}) {
  const allowedErrorTypes = new Set(["概念错误", "计算错误", "审题错误", "推理错误", "规则记忆错误", "粗心失误"]);
  const fallbackPoint = context.question?.knowledgePoints?.[0] ?? "当前知识点";
  const hintLevel = clampInteger(payload.hintLevel, context.hintLevel ?? 1, 1, 3);
  return {
    reply: nonEmptyString(payload.reply, "我们先抓住一个关键点：你的答案和题目条件之间还差一步核对。"),
    errorType: allowedErrorTypes.has(payload.errorType) ? payload.errorType : context.currentErrorType ?? "概念错误",
    diagnosis: nonEmptyString(payload.diagnosis, "本次错误主要来自对题目条件和答案形式的对应关系判断不完整。"),
    evidence: normalizeStringArray(payload.evidence, context.analysis?.evidence ?? ["学生答案与标准答案存在差异。"]),
    nextQuestion: nonEmptyString(payload.nextQuestion, context.question?.followUp ?? "你能说出这一步依据来自题目中的哪个条件吗？"),
    hintLevel,
    showFullSolution: Boolean(payload.showFullSolution) || Boolean(context.forceFullSolution),
    reviewSuggestions: normalizeStringArray(payload.reviewSuggestions, [
      `重温“${fallbackPoint}”`,
      "完成 3 道同类题并写出每一步依据",
      "明天进行一次间隔复习",
    ]),
    practiceRecommendation: {
      knowledgePoint: nonEmptyString(payload.practiceRecommendation?.knowledgePoint, fallbackPoint),
      difficulty: ["easy", "medium", "hard"].includes(payload.practiceRecommendation?.difficulty)
        ? payload.practiceRecommendation.difficulty
        : mapDifficulty(context.question?.difficulty),
    },
  };
}

export function normalizePracticePayload(payload, context = {}) {
  const fallbackPoint = context.question?.knowledgePoints?.[0] ?? "当前知识点";
  return {
    prompt: nonEmptyString(payload.prompt, context.question?.prompt ?? "请完成一道同类练习题。"),
    answer: nonEmptyString(payload.answer, context.question?.correctAnswer ?? ""),
    steps: normalizeStringArray(payload.steps, context.question?.steps ?? []),
    knowledgePoint: nonEmptyString(payload.knowledgePoint, fallbackPoint),
    difficulty: ["easy", "medium", "hard"].includes(payload.difficulty)
      ? payload.difficulty
      : mapDifficulty(context.question?.difficulty),
    strategy: nonEmptyString(payload.strategy, "同知识点相近难度练习"),
  };
}

export function mapDifficulty(difficulty = "") {
  if (String(difficulty).includes("综合")) return "hard";
  if (String(difficulty).includes("易错")) return "medium";
  return "easy";
}

function nonEmptyString(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeStringArray(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return source.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 6);
}

function clampInteger(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
