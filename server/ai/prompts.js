export const AI_TUTOR_SYSTEM_PROMPT = `你是一名耐心、专业、善于启发的 AI 家教。你的任务是帮助学生理解错误原因，而不是直接替学生完成题目。

当学生答错时，你必须先根据题目、正确答案、学生答案和历史记录判断错误类型。优先通过提问引导学生发现问题，不要直接给出最终答案。

你的回答应遵循以下规则：

1. 先肯定学生已经完成的正确部分，再指出一个最关键的疑点。
2. 一次只提出一个问题或提示。
3. 使用学生当前年级能够理解的语言。
4. 不使用羞辱、否定或过度复杂的表达。
5. 连续两轮未解决时，逐步增加提示强度。
6. 连续三轮未解决时，给出完整分步解析。
7. 最终必须总结：

   * 错误类型
   * 错误发生位置
   * 正确思路
   * 需要复习的知识点
   * 一道相似练习建议
8. 输出必须结构化，便于前端展示。

请使用 JSON 返回，格式如下：

{
"reply": "给学生展示的家教回复",
"errorType": "概念错误/计算错误/审题错误/推理错误/规则记忆错误/粗心失误",
"diagnosis": "对错误原因的简短总结",
"evidence": [
"学生答案与标准答案的关键差异",
"学生推理或计算中出现的问题"
],
"nextQuestion": "下一轮引导问题",
"hintLevel": 1,
"showFullSolution": false,
"reviewSuggestions": [
"建议1",
"建议2"
],
"practiceRecommendation": {
"knowledgePoint": "对应知识点",
"difficulty": "easy/medium/hard"
}
}`;

export const TUTOR_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "reply",
    "errorType",
    "diagnosis",
    "evidence",
    "nextQuestion",
    "hintLevel",
    "showFullSolution",
    "reviewSuggestions",
    "practiceRecommendation",
  ],
  properties: {
    reply: { type: "string" },
    errorType: {
      type: "string",
      enum: ["概念错误", "计算错误", "审题错误", "推理错误", "规则记忆错误", "粗心失误"],
    },
    diagnosis: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    nextQuestion: { type: "string" },
    hintLevel: { type: "integer", minimum: 1, maximum: 3 },
    showFullSolution: { type: "boolean" },
    reviewSuggestions: { type: "array", items: { type: "string" } },
    practiceRecommendation: {
      type: "object",
      additionalProperties: false,
      required: ["knowledgePoint", "difficulty"],
      properties: {
        knowledgePoint: { type: "string" },
        difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
      },
    },
  },
};

export const PRACTICE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "answer", "steps", "knowledgePoint", "difficulty", "strategy"],
  properties: {
    prompt: { type: "string" },
    answer: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    knowledgePoint: { type: "string" },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
    strategy: { type: "string" },
  },
};

const TUTOR_SCHEMA_INSTRUCTIONS = `只返回一个 JSON 对象，不要使用 Markdown 代码块。字段必须符合：reply, errorType, diagnosis, evidence, nextQuestion, hintLevel, showFullSolution, reviewSuggestions, practiceRecommendation。`;

const PRACTICE_SCHEMA_INSTRUCTIONS = `只返回一个 JSON 对象，不要使用 Markdown 代码块。字段必须符合：prompt, answer, steps, knowledgePoint, difficulty, strategy。题目难度要与原题相近，知识点要相同或高度相关。`;

export function buildTutorUserPrompt(context) {
  return [
    TUTOR_SCHEMA_INSTRUCTIONS,
    "",
    "【当前教学目标】",
    context.forceFullSolution
      ? "学生已经连续多轮没有解决，请给出完整分步解析，但仍要解释学生错在哪里，并要求学生完成相似练习。"
      : "先通过一个关键问题引导学生自己发现错误，不要直接公布完整答案。",
    "",
    "【学生信息】",
    JSON.stringify(context.student, null, 2),
    "",
    "【当前题目】",
    JSON.stringify(context.question, null, 2),
    "",
    "【学生本次答案与结构化校验】",
    JSON.stringify(
      {
        studentAnswer: context.studentAnswer,
        correctAnswer: context.question.correctAnswer,
        currentErrorType: context.currentErrorType,
        analysis: context.analysis,
        hintLevel: context.hintLevel,
      },
      null,
      2
    ),
    "",
    "【历史作答与错题记录】",
    JSON.stringify(context.history, null, 2),
    "",
    "【当前对话记录】",
    JSON.stringify(context.messages, null, 2),
  ].join("\n");
}

export function buildPracticeUserPrompt(context) {
  return [
    PRACTICE_SCHEMA_INSTRUCTIONS,
    "",
    "请生成一道新的同知识点、相近难度练习题，不能照抄原题数字和表达式。",
    "",
    "【学生信息】",
    JSON.stringify(context.student, null, 2),
    "",
    "【原题】",
    JSON.stringify(context.question, null, 2),
    "",
    "【诊断结论】",
    JSON.stringify(context.aiTutor ?? {}, null, 2),
    "",
    "【结构化校验】",
    JSON.stringify(context.analysis ?? {}, null, 2),
  ].join("\n");
}
