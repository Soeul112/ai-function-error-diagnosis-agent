import { createApp } from "./app.js";

const app = createApp();
const server = app.listen(0, "127.0.0.1");
const baseUrl = await new Promise((resolve) => {
  server.on("listening", () => {
    const address = server.address();
    resolve(`http://127.0.0.1:${address.port}`);
  });
});

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

await request("/api/demo/reset", { method: "POST" });

const students = await request("/api/students");
const topics = await request("/api/topics");
const questions = await request("/api/questions");

if (students.length !== 3) throw new Error(`Expected 3 students, got ${students.length}`);
if (topics.length !== 5) throw new Error(`Expected 5 topics, got ${topics.length}`);
if (questions.length !== 20) throw new Error(`Expected 20 questions, got ${questions.length}`);

const samples = [
  { studentId: "stu-basic", questionId: "q-domain-1", answer: "x≠3" },
  { studentId: "stu-concept", questionId: "q-zero-1", answer: "(2,0) 和 (3,0)" },
  { studentId: "stu-careless", questionId: "q-range-1", answer: "[5,+∞)" },
];

for (const sample of samples) {
  const dialogue = await request("/api/dialogue/start", {
    method: "POST",
    body: JSON.stringify(sample),
  });
  if (!dialogue.attempt?.id) throw new Error("Attempt not saved");
  if (!dialogue.session?.id) throw new Error("Dialogue session not saved");
  if (dialogue.report?.id) throw new Error("Dialogue start should not save final report");
  if (!dialogue.analysis?.answerType) throw new Error("Structured analysis missing");

  const diagnosis = await request("/api/dialogue/reply", {
    method: "POST",
    body: JSON.stringify({
      sessionId: dialogue.session.id,
      reply: "我需要同时检查题目中的限制条件，并把端点代回原式。",
    }),
  });
  if (!diagnosis.report?.id) throw new Error("Diagnosis report not saved");
  if (!diagnosis.report.analysis?.evidence?.length) throw new Error("Diagnosis report missing evidence");

  const variant = await request("/api/variants", {
    method: "POST",
    body: JSON.stringify({ questionId: sample.questionId }),
  });
  if (!variant.variant?.prompt) throw new Error("Variant not generated");

  const variantAttempt = await request("/api/variant-attempts", {
    method: "POST",
    body: JSON.stringify({
      studentId: sample.studentId,
      questionId: sample.questionId,
      variantId: variant.variant.id,
      answer: variant.variant.answer,
    }),
  });
  if (!variantAttempt.attempt?.id) throw new Error("Variant attempt not saved");
  if (variantAttempt.transferStatus !== "迁移掌握") throw new Error("Variant transfer status incorrect");
}

const equivalentDomain = await request("/api/dialogue/start", {
  method: "POST",
  body: JSON.stringify({
    studentId: "stu-basic",
    questionId: "q-domain-1",
    answer: "{x|x>=1,x≠3}",
  }),
});
if (!equivalentDomain.analysis.equivalent) throw new Error("Equivalent inequality answer not accepted");

const coordinateZero = await request("/api/dialogue/start", {
  method: "POST",
  body: JSON.stringify({
    studentId: "stu-concept",
    questionId: "q-zero-1",
    answer: "(2,0) 和 (3,0)",
  }),
});
if (coordinateZero.analysis.misconceptionCandidates[0]?.id !== "m-zero-coordinate") {
    throw new Error("Coordinate zero misconception not detected");
}

const aiAttempt = await request("/api/attempts", {
  method: "POST",
  body: JSON.stringify({
    studentId: "stu-basic",
    questionId: "q-domain-1",
    answer: "x≠3",
  }),
});
if (aiAttempt.analysis.equivalent) throw new Error("AI test attempt should be incorrect");

const aiDiagnosis = await request("/api/ai-diagnosis", {
  method: "POST",
  body: JSON.stringify({ attemptId: aiAttempt.attempt.id }),
});
if (!aiDiagnosis.aiTutor?.reply) throw new Error("AI diagnosis missing tutor reply");
if (!aiDiagnosis.aiTutor?.evidence?.length) throw new Error("AI diagnosis missing evidence");
if (!aiDiagnosis.llm?.status) throw new Error("AI diagnosis missing LLM status");

const aiFollowupOne = await request("/api/ai-followup", {
  method: "POST",
  body: JSON.stringify({
    sessionId: aiDiagnosis.session.id,
    reply: "我还是不确定要检查哪个条件。",
  }),
});
if (aiFollowupOne.aiTutor.hintLevel < 2) throw new Error("AI followup should increase hint level");

const aiFollowupTwo = await request("/api/ai-followup", {
  method: "POST",
  body: JSON.stringify({
    sessionId: aiDiagnosis.session.id,
    reply: "我还是不会订正。",
  }),
});
if (!aiFollowupTwo.aiTutor.showFullSolution) throw new Error("AI followup should show full solution on third hint");
if (!aiFollowupTwo.report?.id) throw new Error("AI final diagnosis report not saved");

const aiPractice = await request("/api/ai-practice", {
  method: "POST",
  body: JSON.stringify({
    sessionId: aiFollowupTwo.session.id,
    questionId: "q-domain-1",
    studentId: "stu-basic",
  }),
});
if (!aiPractice.practice?.prompt) throw new Error("AI practice prompt missing");
if (!aiPractice.practice?.steps?.length) throw new Error("AI practice steps missing");

const parentReport = await request("/api/reports/stu-basic");
if (!parentReport.recentReports.length) throw new Error("Parent report missing recent diagnosis");
if (!parentReport.variantStats?.total) throw new Error("Parent report missing variant stats");
if (!parentReport.productivity) throw new Error("Parent report missing productivity metrics");
if (!parentReport.copyableFeedback?.includes("高一函数学习反馈")) {
  throw new Error("Parent report missing copyable feedback");
}

await request("/api/feedback-events", {
  method: "POST",
  body: JSON.stringify({
    studentId: "stu-basic",
    reportId: parentReport.latest.id,
    eventType: "copy",
    source: "teacher",
    elapsedSeconds: 38,
    editChars: 12,
  }),
});

await request("/api/parent-feedback", {
  method: "POST",
  body: JSON.stringify({
    studentId: "stu-basic",
    reportId: parentReport.latest.id,
    helpful: true,
    comment: "能看懂下一步怎么监督。",
  }),
});

const teacherOverview = await request("/api/teacher/overview");
if (teacherOverview.summary.reportCount < 3) throw new Error("Teacher overview missing report count");
if (!teacherOverview.tasks?.length) throw new Error("Teacher overview missing tasks");
if (!teacherOverview.productivity?.estimatedSavedMinutes) {
  throw new Error("Teacher overview missing productivity metrics");
}
if (!teacherOverview.recentVariantAttempts?.length) {
  throw new Error("Teacher overview missing variant attempts");
}

const teacherTasks = await request("/api/teacher/tasks");
if (!teacherTasks.length) throw new Error("Teacher tasks endpoint missing tasks");

server.close();
console.log("Smoke test passed");
