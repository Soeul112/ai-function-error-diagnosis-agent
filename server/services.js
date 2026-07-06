import {
  analyzeAnswer,
  buildAnalysisSummary,
  buildFollowUpPrompt,
} from "./answerAnalysis.js";
import {
  generatePractice as generateLLMPractice,
  generateTutorTurn,
  getProviderConfig,
  mapDifficulty,
} from "./ai/llmProvider.js";
import {
  getAllReports,
  getAllVariantAttempts,
  getAttempt,
  getAttemptsByStudent,
  getDialogueMessages,
  getDialogueSession,
  getFeedbackEvents,
  getMisconception,
  getParentFeedback,
  getQuestion,
  getQuestions,
  getReportsByStudent,
  getStudent,
  getStudents,
  getTopics,
  getVariant,
  getVariantAttemptsByStudent,
  completeDialogueSession,
  insertDialogueMessage,
  insertDialogueSession,
  insertAttempt,
  insertDiagnosisReport,
  insertFeedbackEvent,
  insertParentFeedback,
  insertVariantAttempt,
  updateDialogueSession,
} from "./db.js";

export function listStudents() {
  return getStudents();
}

export function listTopics() {
  return getTopics();
}

export function listQuestions(topicId) {
  return getQuestions(topicId);
}

export function submitAttempt({ studentId, questionId, answer }) {
  const student = getStudent(studentId);
  const question = getQuestion(questionId);
  if (!student) throw new Error("学生不存在");
  if (!question) throw new Error("题目不存在");
  if (!String(answer ?? "").trim()) throw new Error("请先输入学生答案");
  const analysis = analyzeAnswer(answer, question);

  const attempt = insertAttempt({
    studentId,
    questionId,
    answer: String(answer),
    isCorrect: analysis.equivalent,
  });

  return { attempt, student, question, analysis };
}

export function startDialogue({ studentId, questionId, answer }) {
  const { attempt, student, question, analysis } = submitAttempt({ studentId, questionId, answer });
  const followUp = buildFollowUpPrompt(analysis, question);
  const session = insertDialogueSession({
    studentId: student.id,
    questionId: question.id,
    attemptId: attempt.id,
    answer: String(answer),
    analysis,
    tutorQuestion: followUp,
    hintLevel: analysis.equivalent ? 1 : 2,
  });
  insertDialogueMessage({ sessionId: session.id, role: "student", content: String(answer) });
  insertDialogueMessage({ sessionId: session.id, role: "tutor", content: followUp });

  return {
    session,
    attempt,
    student,
    question,
    analysis,
    readyForFinal: false,
    tutorMessage: {
      stage: "follow_up",
      opening: analysis.equivalent
        ? "结构化校验通过。我们先确认你是否真的理解关键条件。"
        : "我先不直接给完整答案，先根据你的答案追问一个关键点。",
      followUp,
      hint: question.hint,
      analysisSummary: buildAnalysisSummary(analysis),
    },
    messages: getDialogueMessages(session.id),
  };
}

export function replyDialogue({ sessionId, reply, quickFinalize = false }) {
  const session = getDialogueSession(Number(sessionId));
  if (!session) throw new Error("对话不存在");
  const student = getStudent(session.studentId);
  const question = getQuestion(session.questionId);
  const attempt = getAttempt(session.attemptId);
  if (!student || !question || !attempt) throw new Error("对话上下文缺失");
  const content = quickFinalize ? "老师快速模式：跳过学生追问，直接生成可编辑报告。" : String(reply ?? "").trim();
  if (!content) throw new Error("请先回应追问");

  insertDialogueMessage({ sessionId: session.id, role: quickFinalize ? "teacher" : "student", content });
  const finalPayload = createFinalDiagnosis({
    student,
    question,
    attempt,
    analysis: session.analysis,
    dialogueSessionId: session.id,
    learnerReply: content,
    quickFinalize,
  });
  insertDialogueMessage({
    sessionId: session.id,
    role: "tutor",
    content: `${finalPayload.tutorMessage.diagnosis} ${finalPayload.tutorMessage.nextPlan}`,
  });
  completeDialogueSession(session.id);

  return {
    ...finalPayload,
    session: getDialogueSession(session.id),
    messages: getDialogueMessages(session.id),
  };
}

export function diagnoseAnswer(payload) {
  if (payload.attemptId && !payload.answer) {
    const attempt = getAttempt(Number(payload.attemptId));
    if (!attempt) throw new Error("作答记录不存在");
    return diagnoseAnswer({
      studentId: attempt.studentId,
      questionId: attempt.questionId,
      answer: attempt.answer,
      quickFinalize: payload.quickFinalize,
    });
  }
  if (payload.quickFinalize) {
    const started = startDialogue(payload);
    return replyDialogue({
      sessionId: started.session.id,
      quickFinalize: true,
      reply: "老师快速模式：直接生成报告。",
    });
  }
  return startDialogue(payload);
}

export async function startAiDiagnosis(payload) {
  const base = buildAiAttemptContext(payload);
  const providerConfig = getProviderConfig();
  const initialTutor = buildFallbackTutorPayload({
    ...base,
    hintLevel: 1,
    forceFullSolution: false,
  });
  const session = insertDialogueSession({
    studentId: base.student.id,
    questionId: base.question.id,
    attemptId: base.attempt.id,
    answer: base.attempt.answer,
    analysis: base.analysis,
    tutorQuestion: initialTutor.nextQuestion,
    hintLevel: 1,
    aiProvider: providerConfig.provider,
    modelName: providerConfig.model,
    llmStatus: "pending",
  });
  insertDialogueMessage({ sessionId: session.id, role: "student", content: base.attempt.answer });

  const turn = await produceTutorTurn({
    ...base,
    session,
    hintLevel: 1,
    forceFullSolution: false,
  });
  insertDialogueMessage({
    sessionId: session.id,
    role: "tutor",
    content: formatTutorMessageForHistory(turn.payload),
  });
  const updatedSession = updateDialogueSession(session.id, {
    tutorQuestion: turn.payload.nextQuestion,
    hintLevel: turn.payload.hintLevel,
    aiProvider: turn.meta.provider,
    modelName: turn.meta.model,
    llmStatus: turn.meta.status,
  });

  return buildAiResponse({
    ...base,
    session: updatedSession,
    aiTutor: turn.payload,
    llm: turn.meta,
  });
}

export async function continueAiFollowup({ sessionId, reply }) {
  const session = getDialogueSession(Number(sessionId));
  if (!session) throw new Error("AI 对话不存在");
  if (session.status === "completed") throw new Error("本轮 AI 诊断已结束，请重新提交错题或生成练习题。");
  const student = getStudent(session.studentId);
  const question = getQuestion(session.questionId);
  const attempt = getAttempt(session.attemptId);
  if (!student || !question || !attempt) throw new Error("AI 对话上下文缺失");
  const content = String(reply ?? "").trim();
  if (!content) throw new Error("请先输入学生回应");

  insertDialogueMessage({ sessionId: session.id, role: "student", content });
  const messages = getDialogueMessages(session.id);
  const studentTurnCount = messages.filter((message) => message.role === "student").length;
  const hintLevel = Math.min(3, Math.max(Number(session.hintLevel || 1) + 1, studentTurnCount));
  const analysis = session.analysis;
  const base = buildAiContext({
    student,
    question,
    attempt,
    analysis,
    hintLevel,
    forceFullSolution: hintLevel >= 3,
  });
  const turn = await produceTutorTurn(base);
  const aiTutor = enforceFullSolutionWhenNeeded(turn.payload, {
    ...base,
    forceFullSolution: hintLevel >= 3,
  });

  insertDialogueMessage({
    sessionId: session.id,
    role: "tutor",
    content: formatTutorMessageForHistory(aiTutor),
  });

  updateDialogueSession(session.id, {
    status: aiTutor.showFullSolution ? "completed" : "waiting_reply",
    tutorQuestion: aiTutor.nextQuestion,
    hintLevel: aiTutor.hintLevel,
    aiProvider: turn.meta.provider,
    modelName: turn.meta.model,
    llmStatus: turn.meta.status,
  });
  const updatedSession = aiTutor.showFullSolution
    ? completeDialogueSession(session.id)
    : getDialogueSession(session.id);
  const report = aiTutor.showFullSolution
    ? createAiDiagnosisReport({ ...base, session: updatedSession, aiTutor })
    : null;

  return buildAiResponse({
    ...base,
    session: updatedSession,
    aiTutor,
    llm: turn.meta,
    report,
  });
}

export async function generateAiPractice(payload) {
  const base = buildPracticeContext(payload);
  try {
    const turn = await generateLLMPractice(base);
    return {
      sourceQuestion: base.question,
      practice: turn.payload,
      llm: turn.meta,
    };
  } catch (error) {
    const variant = getVariant(base.question.id);
    const practice = variant
      ? {
          prompt: variant.prompt,
          answer: variant.answer,
          steps: variant.steps,
          knowledgePoint: base.question.knowledgePoints[0] ?? base.topic?.name ?? "当前知识点",
          difficulty: mapDifficulty(base.question.difficulty),
          strategy: variant.strategy,
        }
      : {
          prompt: base.question.prompt,
          answer: base.question.correctAnswer,
          steps: base.question.steps,
          knowledgePoint: base.question.knowledgePoints[0] ?? base.topic?.name ?? "当前知识点",
          difficulty: mapDifficulty(base.question.difficulty),
          strategy: "同知识点复练",
        };
    return {
      sourceQuestion: base.question,
      practice,
      llm: {
        ...fallbackLLMMeta(error),
        reason: safeLLMReason(error),
      },
    };
  }
}

function buildAiAttemptContext(payload) {
  if (payload.attemptId && !payload.answer) {
    const attempt = getAttempt(Number(payload.attemptId));
    if (!attempt) throw new Error("作答记录不存在");
    const student = getStudent(attempt.studentId);
    const question = getQuestion(attempt.questionId);
    if (!student || !question) throw new Error("作答上下文缺失");
    const analysis = analyzeAnswer(attempt.answer, question);
    return buildAiContext({
      student,
      question,
      attempt,
      analysis,
      hintLevel: 1,
      forceFullSolution: false,
    });
  }
  const submitted = submitAttempt(payload);
  return buildAiContext({
    ...submitted,
    hintLevel: 1,
    forceFullSolution: false,
  });
}

function buildAiContext({ student, question, attempt, analysis, hintLevel, forceFullSolution, session = null, aiTutor = null }) {
  const topic = getTopics().find((item) => item.id === question.topicId) ?? null;
  const misconceptionId = analysis.equivalent
    ? null
    : analysis.misconceptionCandidates[0]?.id ?? question.misconceptionId;
  const misconception = misconceptionId
    ? getMisconception(misconceptionId) ?? getMisconception(question.misconceptionId)
    : null;
  const currentErrorType = classifyErrorType({ analysis, misconception });
  const messages = session ? getDialogueMessages(session.id) : [];
  return {
    student: {
      id: student.id,
      name: student.name,
      grade: student.grade,
      profileType: student.profileType,
      baseline: student.baseline,
      goal: student.goal,
      learningStage: student.grade,
    },
    question: {
      id: question.id,
      title: question.title,
      prompt: question.prompt,
      type: topic?.name ?? question.topicId,
      topicId: question.topicId,
      knowledgePoints: question.knowledgePoints,
      difficulty: question.difficulty,
      correctAnswer: question.correctAnswer,
      followUp: question.followUp,
      hint: question.hint,
      steps: question.steps,
    },
    topic,
    attempt,
    analysis,
    misconception,
    currentErrorType,
    studentAnswer: attempt.answer,
    hintLevel,
    forceFullSolution,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    history: buildStudentAiHistory(student.id, attempt.id),
    aiTutor,
  };
}

function buildPracticeContext(payload) {
  let session = null;
  let student = payload.studentId ? getStudent(payload.studentId) : null;
  let question = payload.questionId ? getQuestion(payload.questionId) : null;
  let attempt = null;
  let analysis = null;
  let aiTutor = payload.aiTutor ?? null;

  if (payload.sessionId) {
    session = getDialogueSession(Number(payload.sessionId));
    if (!session) throw new Error("AI 对话不存在");
    student = getStudent(session.studentId);
    question = getQuestion(session.questionId);
    attempt = getAttempt(session.attemptId);
    analysis = session.analysis;
  }

  if (!question) throw new Error("题目不存在");
  if (!student) student = getStudents()[0];
  if (!attempt) {
    attempt = {
      id: null,
      studentId: student.id,
      questionId: question.id,
      answer: payload.answer ?? "",
      isCorrect: false,
    };
  }
  if (!analysis) analysis = analyzeAnswer(attempt.answer, question);
  return buildAiContext({
    student,
    question,
    attempt,
    analysis,
    hintLevel: session?.hintLevel ?? 1,
    forceFullSolution: false,
    session,
    aiTutor,
  });
}

async function produceTutorTurn(context) {
  try {
    return await generateTutorTurn(context);
  } catch (error) {
    return {
      payload: buildFallbackTutorPayload(context),
      meta: {
        ...fallbackLLMMeta(error),
        reason: safeLLMReason(error),
      },
    };
  }
}

function buildFallbackTutorPayload(context) {
  const question = context.question;
  const analysis = context.analysis;
  const misconception = context.misconception;
  const evidence = [
    ...(analysis.evidence ?? []),
    context.history.repeatedErrors.length
      ? `历史错题中也出现过：${context.history.repeatedErrors.slice(0, 2).join("、")}。`
      : "",
  ].filter(Boolean);
  const hintLevel = Math.min(3, Math.max(1, Number(context.hintLevel || 1)));
  const showFullSolution = Boolean(context.forceFullSolution || hintLevel >= 3);
  const keyPoint = question.knowledgePoints[0] ?? context.topic?.name ?? "当前知识点";
  const nextQuestion = showFullSolution
    ? "请你重新写一遍答案，并在每一步后面标注依据。"
    : hintLevel >= 2
      ? `${question.hint} 你能先指出答案里最需要补上的条件或步骤吗？`
      : buildFollowUpPrompt(analysis, question);
  const fullSolution = showFullSolution
    ? `\n\n完整解析：${question.steps.map((step, index) => `${index + 1}. ${step}`).join(" ")}`
    : "";

  return {
    reply: showFullSolution
      ? `你已经尝试了几轮，我们现在把思路完整梳理一遍。你的可取之处是已经写出了部分相关条件；关键问题是${evidence[0] ?? "答案与标准答案还不等价"}。${fullSolution}`
      : `你已经完成了作答，这一步很好。我们先不直接看标准答案，先抓住一个关键疑点：${evidence[0] ?? "你的答案与标准答案还不等价"} 请先想一想：${nextQuestion}`,
    errorType: context.currentErrorType,
    diagnosis: analysis.equivalent
      ? "答案结构与标准答案等价，但仍建议复述关键依据。"
      : `主要错因是${misconception?.name ?? context.currentErrorType}，需要回到题目条件和答案形式之间逐步核对。`,
    evidence: evidence.length ? evidence : ["学生答案与标准答案存在关键差异。"],
    nextQuestion,
    hintLevel,
    showFullSolution,
    reviewSuggestions: [
      `重温“${keyPoint}”`,
      `完成 3 道${context.topic?.name ?? "同类"}相似题`,
      "明天进行一次间隔复习，并要求写出每一步依据",
    ],
    practiceRecommendation: {
      knowledgePoint: keyPoint,
      difficulty: mapDifficulty(question.difficulty),
    },
  };
}

function enforceFullSolutionWhenNeeded(aiTutor, context) {
  if (!context.forceFullSolution || aiTutor.showFullSolution) return aiTutor;
  const solutionText = context.question.steps.map((step, index) => `${index + 1}. ${step}`).join(" ");
  return {
    ...aiTutor,
    showFullSolution: true,
    reply: `${aiTutor.reply}\n\n完整解析：${solutionText}`,
    nextQuestion: "请你重新作答，并说明每一步依据。",
  };
}

function createAiDiagnosisReport({ student, question, attempt, analysis, session, aiTutor, misconception }) {
  const weakPoints = [
    ...new Set([
      ...question.knowledgePoints,
      aiTutor.errorType,
      ...(misconception?.tags ?? []),
      ...(analysis.missingConditions ?? []),
    ]),
  ].slice(0, 8);
  const nextPlan = [
    ...aiTutor.reviewSuggestions,
    `再完成 1 道${aiTutor.practiceRecommendation.knowledgePoint}相近难度练习。`,
  ].join(" ");
  const parentSummary = `${student.name}本次主要属于${aiTutor.errorType}。${aiTutor.diagnosis} 家长监督时可以让孩子先复述题目条件，再重新作答。`;
  return insertDiagnosisReport({
    attemptId: attempt.id,
    studentId: student.id,
    questionId: question.id,
    dialogueSessionId: session.id,
    misconceptionId: analysis.equivalent ? null : misconception?.id ?? analysis.misconceptionCandidates[0]?.id ?? question.misconceptionId,
    followUp: aiTutor.nextQuestion,
    diagnosis: aiTutor.diagnosis,
    weakPoints,
    nextPlan,
    parentSummary,
    analysis: {
      ...analysis,
      aiTutor,
    },
  });
}

function buildAiResponse({ session, attempt, student, question, analysis, aiTutor, llm, report = null }) {
  return {
    session,
    attempt,
    student,
    question,
    analysis,
    aiTutor,
    report,
    llm,
    messages: getDialogueMessages(session.id),
  };
}

function formatTutorMessageForHistory(aiTutor) {
  return [aiTutor.reply, aiTutor.nextQuestion ? `追问：${aiTutor.nextQuestion}` : ""].filter(Boolean).join("\n");
}

function buildStudentAiHistory(studentId, currentAttemptId) {
  const attempts = getAttemptsByStudent(studentId)
    .filter((attempt) => attempt.id !== currentAttemptId)
    .slice(0, 6)
    .map((attempt) => ({
      questionTitle: attempt.questionTitle,
      answer: attempt.answer,
      isCorrect: attempt.isCorrect,
      createdAt: attempt.createdAt,
    }));
  const reports = getReportsByStudent(studentId).slice(0, 6);
  const repeatedErrors = [...new Set(reports.flatMap((report) => report.weakPoints ?? []))].slice(0, 6);
  return {
    recentAttempts: attempts,
    recentReports: reports.map((report) => ({
      questionTitle: report.questionTitle,
      diagnosis: report.diagnosis,
      weakPoints: report.weakPoints,
      createdAt: report.createdAt,
    })),
    repeatedErrors,
  };
}

function classifyErrorType({ analysis, misconception }) {
  const name = `${misconception?.name ?? ""} ${(analysis.misconceptionCandidates ?? []).map((item) => item.name).join(" ")}`;
  const answerType = analysis.answerType ?? "";
  if (/因式分解|计算|对称轴/.test(name)) return "计算错误";
  if (/条件遗漏|限定区间|定义域|题目/.test(name)) return "审题错误";
  if (/边界|对数|公式|规则/.test(name)) return "规则记忆错误";
  if (/以点代证|证明|推理|步骤/.test(name)) return "推理错误";
  if (/表达|coordinate|坐标/.test(name) || answerType === "coordinate-point") return "概念错误";
  if (/开口方向|奇偶性|零点|值域|单调性|概念/.test(name)) return "概念错误";
  return "粗心失误";
}

function fallbackLLMMeta(error) {
  const config = getProviderConfig();
  return {
    provider: config.provider,
    model: config.model,
    status: "fallback",
    code: error?.code ?? "LLM_FALLBACK",
  };
}

function safeLLMReason(error) {
  if (error?.code === "MISSING_API_KEY") return "未配置 API Key，已使用本地规则诊断。";
  if (error?.code === "TIMEOUT") return "模型请求超时，已使用本地规则诊断。";
  if (error?.code === "INVALID_JSON") return "模型返回格式不稳定，已使用本地规则诊断。";
  return "模型暂不可用，已使用本地规则诊断。";
}

function createFinalDiagnosis({ student, question, attempt, analysis, dialogueSessionId, learnerReply, quickFinalize }) {
  const candidateId = analysis.equivalent ? null : analysis.misconceptionCandidates[0]?.id ?? question.misconceptionId;
  const misconception = candidateId ? getMisconception(candidateId) ?? getMisconception(question.misconceptionId) : null;
  const weakPoints = analysis.equivalent
    ? question.knowledgePoints.slice(0, 2)
    : [...new Set([...question.knowledgePoints, ...(misconception?.tags ?? []), ...analysis.missingConditions])];
  const reflectionSignal = quickFinalize
    ? "本次由老师快速模式生成，建议课上补一次口头追问。"
    : learnerReply.length >= 8
      ? "学生已回应追问，可继续用变式题验证迁移。"
      : "学生回应较短，建议老师要求其补充完整依据。";

  const diagnosis = analysis.equivalent
    ? `答案与参考答案等价。系统识别为${analysis.answerType}，但仍需检查步骤表达是否完整。${reflectionSignal}`
    : `本题主要暴露“${misconception?.name ?? "表达不规范"}”。${analysis.evidence.join(" ")} ${misconception?.description ?? ""}`;

  const nextPlan = analysis.equivalent
    ? `保留本题步骤，继续完成 1 道同类变式题，确认不是只记住当前题型。`
    : `${misconception?.remedy ?? "先补全关键条件，再用端点代回原式检查。"} 之后完成系统生成的变式题，重点检查“换条件后是否仍能识别同类结构”。`;

  const parentSummary = analysis.equivalent
    ? `${student.name}本题答案正确，家长可以追问孩子“这一步为什么能取这个端点”，确认步骤不是背出来的。`
    : `${student.name}本题的薄弱点是${weakPoints.slice(0, 3).join("、")}。${misconception?.parentGuidance ?? "家长监督时可以让孩子复述每个限制条件从哪里来。"}`;

  const report = insertDiagnosisReport({
    attemptId: attempt.id,
    studentId: student.id,
    questionId: question.id,
    dialogueSessionId,
    misconceptionId: analysis.equivalent ? null : misconception?.id ?? candidateId,
    followUp: buildFollowUpPrompt(analysis, question),
    diagnosis,
    weakPoints,
    nextPlan,
    parentSummary,
    analysis,
  });

  return {
    attempt,
    question,
    misconception: analysis.equivalent ? null : misconception,
    analysis,
    report,
    tutorMessage: {
      stage: "final",
      opening: analysis.equivalent
        ? "这次答案通过了结构化校验，我们继续看步骤是否稳定。"
        : "我根据你的原答案和追问回应，给出最终诊断。",
      followUp: report.followUp,
      hint: question.hint,
      diagnosis,
      nextPlan,
      analysisSummary: buildAnalysisSummary(analysis),
    },
  };
}

export function generateVariant({ questionId }) {
  const question = getQuestion(questionId);
  const variant = getVariant(questionId);
  if (!question || !variant) throw new Error("变式题不存在");
  return {
    sourceQuestion: question,
    variant,
    productReason:
      "该变式通过条件替换或知识点组合扩展，验证学生是否真正掌握同类结构，而不是只会原题。",
  };
}

export function submitVariantAttempt({ studentId, questionId, variantId, answer }) {
  const student = getStudent(studentId);
  const question = getQuestion(questionId);
  const variant = getVariant(questionId);
  if (!student) throw new Error("学生不存在");
  if (!question) throw new Error("题目不存在");
  if (!variant || variant.id !== variantId) throw new Error("变式题不存在");
  if (!String(answer ?? "").trim()) throw new Error("请先输入变式题答案");

  const analysis = analyzeAnswer(answer, variant, { sourceQuestion: question });
  const isCorrect = analysis.equivalent;
  const gapText = [
    analysis.missingConditions.length ? `缺少 ${analysis.missingConditions.join("、")}` : "",
    analysis.extraConditions.length ? `多出/误排除 ${analysis.extraConditions.join("、")}` : "",
  ].filter(Boolean).join("；");
  const feedback = isCorrect
    ? "迁移掌握：结构化校验显示学生能在条件替换后完成同类题，说明不是只记住原题答案。"
    : `仍需巩固：${gapText || analysis.evidence[0] || "答案集合与参考答案不等价"}。需要回到原题结构，重新识别限制条件和关键步骤。`;

  const attempt = insertVariantAttempt({
    studentId,
    sourceQuestionId: question.id,
    variantId: variant.id,
    answer: String(answer),
    isCorrect,
    feedback,
  });

  return {
    attempt,
    student,
    sourceQuestion: question,
    variant,
    transferStatus: isCorrect ? "迁移掌握" : "仍需巩固",
    feedback,
    analysis,
  };
}

export function buildStudentReport(studentId) {
  const student = getStudent(studentId);
  if (!student) throw new Error("学生不存在");

  const topics = getTopics();
  const reports = getReportsByStudent(studentId);
  const attempts = getAttemptsByStudent(studentId);
  const variantAttempts = getVariantAttemptsByStudent(studentId);
  const feedbackEvents = getFeedbackEvents({ studentId });
  const parentFeedback = getParentFeedback({ studentId });

  const topicStats = topics.map((topic) => {
    const topicAttempts = attempts.filter((attempt) => attempt.topicId === topic.id);
    const correctCount = topicAttempts.filter((attempt) => attempt.isCorrect).length;
    const total = topicAttempts.length;
    return {
      topicId: topic.id,
      topicName: topic.name,
      total,
      correctCount,
      mastery: total ? Math.round((correctCount / total) * 100) : 0,
    };
  });

  const weakCounter = new Map();
  reports.forEach((report) => {
    report.weakPoints.forEach((point) => weakCounter.set(point, (weakCounter.get(point) ?? 0) + 1));
  });
  const weakPoints = [...weakCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  const latest = reports[0] ?? null;
  const latestVariant = variantAttempts[0] ?? null;
  const correctVariantCount = variantAttempts.filter((item) => item.isCorrect).length;
  const variantStats = {
    total: variantAttempts.length,
    correct: correctVariantCount,
    accuracy: variantAttempts.length ? Math.round((correctVariantCount / variantAttempts.length) * 100) : 0,
    latest: latestVariant,
  };
  const transferStatus = latestVariant
    ? latestVariant.isCorrect
      ? "最近一次变式题已迁移掌握"
      : "最近一次变式题仍需巩固"
    : "尚未完成变式题迁移验证";
  const progressText = attempts.length
    ? `已完成 ${attempts.length} 次函数题诊断，其中 ${attempts.filter((item) => item.isCorrect).length} 次答案正确。`
    : "暂无真实作答记录，建议先从定义域基础题开始。";
  const productivity = buildProductivityMetrics(reports, feedbackEvents);
  const parentFeedbackStats = buildParentFeedbackStats(parentFeedback);

  const copyableFeedback = buildCopyableFeedback({
    student,
    latest,
    weakPoints,
    nextPlan: latest
      ? latest.nextPlan
      : "第一阶段先完成定义域和值域基础题，建立“限制条件清单”和“配方求值域”两个固定流程。",
    parentAdvice: latest
      ? latest.parentSummary
      : `${student.name}当前还没有诊断记录。建议家长先监督孩子完成 2 道基础题，并要求写出每一步依据。`,
    variantStats,
    transferStatus,
  });

  return {
    student,
    progressText,
    latest,
    weakPoints,
    topicStats,
    variantStats,
    transferStatus,
    copyableFeedback,
    productivity,
    parentFeedbackStats,
    recentReports: reports.slice(0, 5),
    parentAdvice: latest
      ? latest.parentSummary
      : `${student.name}当前还没有诊断记录。建议家长先监督孩子完成 2 道基础题，并要求写出每一步依据。`,
    nextPlan: latest
      ? latest.nextPlan
      : "第一阶段先完成定义域和值域基础题，建立“限制条件清单”和“配方求值域”两个固定流程。",
  };
}

export function buildTeacherOverview() {
  const students = getStudents();
  const reports = getAllReports();
  const variantAttempts = getAllVariantAttempts();
  const topics = getTopics();
  const questions = getQuestions();
  const feedbackEvents = getFeedbackEvents();
  const parentFeedback = getParentFeedback();

  const studentCards = students.map((student) => {
    const studentReports = reports.filter((report) => report.studentId === student.id);
    const studentVariantAttempts = variantAttempts.filter((attempt) => attempt.studentId === student.id);
    const studentParentFeedback = parentFeedback.filter((item) => item.studentId === student.id);
    const correctVariantCount = studentVariantAttempts.filter((attempt) => attempt.isCorrect).length;
    const weakCounter = new Map();
    studentReports.forEach((report) => {
      report.weakPoints.forEach((point) => weakCounter.set(point, (weakCounter.get(point) ?? 0) + 1));
    });
    const transferRate = studentVariantAttempts.length
      ? Math.round((correctVariantCount / studentVariantAttempts.length) * 100)
      : 0;
    const latestReport = studentReports[0] ?? null;
    const riskFlags = [
      studentVariantAttempts.length >= 2 && transferRate < 50 ? "迁移正确率偏低" : "",
      studentParentFeedback.some((item) => !item.helpful) ? "家长反馈未解决疑问" : "",
      studentReports.length && !feedbackEvents.some((event) => event.studentId === student.id && event.reportId === latestReport?.id && event.eventType === "sent")
        ? "反馈待发送"
        : "",
    ].filter(Boolean);
    return {
      ...student,
      reportCount: studentReports.length,
      variantTotal: studentVariantAttempts.length,
      variantCorrect: correctVariantCount,
      transferRate,
      latestReport,
      priority: riskFlags.length ? "高" : studentReports.length ? "中" : "低",
      riskFlags,
      nextAction: buildNextAction(student, studentReports, studentVariantAttempts),
      topWeakPoints: [...weakCounter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count })),
    };
  });

  const misconceptionCounter = new Map();
  reports.forEach((report) => {
    const key = report.misconceptionName ?? "步骤表达待完善";
    misconceptionCounter.set(key, (misconceptionCounter.get(key) ?? 0) + 1);
  });

  return {
    summary: {
      studentCount: students.length,
      questionCount: questions.length,
      topicCount: topics.length,
      reportCount: reports.length,
    },
    students: studentCards,
    tasks: buildTeacherTasks(studentCards, reports, feedbackEvents),
    productivity: buildProductivityMetrics(reports, feedbackEvents),
    parentFeedbackStats: buildParentFeedbackStats(parentFeedback),
    recentReports: reports.slice(0, 8),
    recentVariantAttempts: variantAttempts.slice(0, 8),
    weakRank: [...misconceptionCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count })),
    teacherDraft:
      reports.length > 0
        ? "本周学生主要问题集中在限制条件识别、边界判断和概念表达。建议下次课先用 10 分钟复盘错题类型，再做 2 道变式题检查迁移。"
        : "暂无诊断记录。建议先安排每位学生完成 1 道定义域题，建立首批错因样本。",
  };
}

export function buildTeacherTasksView() {
  return buildTeacherOverview().tasks;
}

export function recordFeedbackEvent(payload) {
  const student = getStudent(payload.studentId);
  if (!student) throw new Error("学生不存在");
  return insertFeedbackEvent({
    studentId: payload.studentId,
    reportId: payload.reportId ?? null,
    eventType: payload.eventType,
    source: payload.source ?? "teacher",
    payload: payload.payload ?? {},
    elapsedSeconds: Number(payload.elapsedSeconds ?? 42),
    editChars: Number(payload.editChars ?? 0),
  });
}

export function recordParentFeedback(payload) {
  const student = getStudent(payload.studentId);
  if (!student) throw new Error("学生不存在");
  return insertParentFeedback({
    studentId: payload.studentId,
    reportId: payload.reportId ?? null,
    helpful: Boolean(payload.helpful),
    comment: String(payload.comment ?? ""),
  });
}

function buildProductivityMetrics(reports, feedbackEvents) {
  const copyOrSendEvents = feedbackEvents.filter((event) => ["copy", "sent"].includes(event.eventType));
  const averageEditSeconds = copyOrSendEvents.length
    ? Math.round(copyOrSendEvents.reduce((sum, event) => sum + event.elapsedSeconds, 0) / copyOrSendEvents.length)
    : 42;
  const generatedCount = reports.length;
  const estimatedSavedMinutes = generatedCount
    ? Math.max(0, Math.round((generatedCount * 30 * 60 - generatedCount * averageEditSeconds) / 60))
    : 0;
  return {
    generatedCount,
    copiedCount: feedbackEvents.filter((event) => event.eventType === "copy").length,
    sentCount: feedbackEvents.filter((event) => event.eventType === "sent").length,
    averageEditSeconds,
    estimatedSavedMinutes,
    evidenceStatus: copyOrSendEvents.length ? "基于本地事件记录" : "暂无真实复制事件，使用演示基准 42 秒",
  };
}

function buildParentFeedbackStats(items) {
  const helpfulCount = items.filter((item) => item.helpful).length;
  return {
    total: items.length,
    helpfulCount,
    unresolvedCount: items.length - helpfulCount,
    latest: items[0] ?? null,
  };
}

function buildTeacherTasks(students, reports, feedbackEvents) {
  const tasks = [];
  students.forEach((student) => {
    const latestReport = student.latestReport;
    if (latestReport && !feedbackEvents.some((event) => event.reportId === latestReport.id && event.eventType === "sent")) {
      tasks.push({
        id: `send-${student.id}-${latestReport.id}`,
        studentId: student.id,
        studentName: student.name,
        type: "待发送家长反馈",
        priority: "高",
        title: `发送 ${student.name} 的本次反馈`,
        description: latestReport.analysis?.evidence?.[0] ?? latestReport.diagnosis,
        dueLabel: "今日",
      });
    }
    if (student.variantTotal === 0 || student.transferRate < 60) {
      tasks.push({
        id: `transfer-${student.id}`,
        studentId: student.id,
        studentName: student.name,
        type: "今日待跟进",
        priority: student.variantTotal === 0 ? "中" : "高",
        title: `${student.name} 需要变式迁移验证`,
        description: student.nextAction,
        dueLabel: "下节课前",
      });
    }
    if (student.riskFlags.length) {
      tasks.push({
        id: `risk-${student.id}`,
        studentId: student.id,
        studentName: student.name,
        type: "续费/满意度风险",
        priority: "高",
        title: `${student.name} 有服务感知风险`,
        description: student.riskFlags.join("、"),
        dueLabel: "本周",
      });
    }
  });
  return tasks.slice(0, 8);
}

function buildNextAction(student, reports, variantAttempts) {
  const latestReport = reports[0];
  const latestVariant = variantAttempts[0];
  if (!latestReport) return `先安排 ${student.name} 完成 1 道定义域题，建立首个错因样本。`;
  if (!latestVariant) return `用 1 道同类变式题验证“${latestReport.questionTitle}”是否真正迁移。`;
  if (!latestVariant.isCorrect) return `下节课先复盘 ${latestReport.weakPoints.slice(0, 2).join("、")}，再做低变形和高变形各 1 题。`;
  return `保留当前节奏，下节课用限时题检查是否能独立复现步骤。`;
}

function buildCopyableFeedback({ student, latest, weakPoints, nextPlan, parentAdvice, variantStats, transferStatus }) {
  const weakText = weakPoints.length
    ? weakPoints.slice(0, 4).map((point) => point.name).join("、")
    : "暂未形成稳定薄弱点";
  const latestText = latest
    ? `本次错题：${latest.questionTitle}。主要问题：${latest.diagnosis}`
    : "本次还没有形成错题诊断记录。";
  const transferText = variantStats.total
    ? `变式迁移：已完成 ${variantStats.total} 次变式题，正确 ${variantStats.correct} 次，正确率 ${variantStats.accuracy}%。${transferStatus}。`
    : `变式迁移：${transferStatus}。`;

  return [
    `【${student.name} 高一函数学习反馈】`,
    latestText,
    `薄弱点：${weakText}。`,
    transferText,
    `下一步计划：${nextPlan}`,
    `家长监督建议：${parentAdvice}`,
  ].join("\n");
}
