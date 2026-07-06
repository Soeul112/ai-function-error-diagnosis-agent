import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clipboard,
  ClipboardList,
  Clock3,
  GraduationCap,
  HelpCircle,
  Home,
  LineChart,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import "./styles.css";

const api = {
  async get(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
  async post(path, body = {}) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
};

const navItems = [
  { id: "dashboard", label: "学习看板", icon: Home },
  { id: "student", label: "诊断Copilot", icon: Bot },
  { id: "parent", label: "家长报告", icon: ClipboardList },
  { id: "teacher", label: "老师工作台", icon: Users },
  { id: "portfolio", label: "验证说明", icon: BriefcaseBusiness },
];

const params = new URLSearchParams(window.location.search);
const initialView = ["dashboard", "student", "parent", "teacher", "portfolio"].includes(params.get("view"))
  ? params.get("view")
  : "dashboard";
const initialStudentId = params.get("studentId") || "stu-basic";

function App() {
  const [activeView, setActiveView] = useState(initialView);
  const [students, setStudents] = useState([]);
  const [topics, setTopics] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [selectedTopicId, setSelectedTopicId] = useState("domain");
  const [selectedQuestionId, setSelectedQuestionId] = useState("q-domain-1");
  const [answer, setAnswer] = useState("");
  const [answerFeedback, setAnswerFeedback] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [dialogueReply, setDialogueReply] = useState("");
  const [practice, setPractice] = useState(null);
  const [variant, setVariant] = useState(null);
  const [variantAnswer, setVariantAnswer] = useState("");
  const [variantResult, setVariantResult] = useState(null);
  const [studentReport, setStudentReport] = useState(null);
  const [teacherOverview, setTeacherOverview] = useState(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isShareMode = activeView === "parent" && params.get("view") === "parent";
  const selectedStudent = students.find((student) => student.id === selectedStudentId);
  const topicQuestions = questions.filter((question) => question.topicId === selectedTopicId);
  const selectedQuestion =
    questions.find((question) => question.id === selectedQuestionId) ?? topicQuestions[0] ?? questions[0];
  const groupedQuestions = useMemo(() => {
    return topics.map((topic) => ({
      ...topic,
      questions: questions.filter((question) => question.topicId === topic.id),
    }));
  }, [topics, questions]);

  async function refreshReports(studentId = selectedStudentId) {
    const [report, overview] = await Promise.all([
      api.get(`/api/reports/${studentId}`),
      api.get("/api/teacher/overview"),
    ]);
    setStudentReport(report);
    setTeacherOverview(overview);
  }

  async function loadInitialData() {
    setLoading(true);
    setError("");
    try {
      const [studentData, topicData, questionData] = await Promise.all([
        api.get("/api/students"),
        api.get("/api/topics"),
        api.get("/api/questions"),
      ]);
      setStudents(studentData);
      setTopics(topicData);
      setQuestions(questionData);
      await refreshReports(selectedStudentId);
    } catch {
      setError("数据加载失败，请确认后端服务已启动。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (students.length) {
      refreshReports(selectedStudentId).catch(() => setError("报告刷新失败。"));
    }
  }, [selectedStudentId]);

  useEffect(() => {
    const firstQuestion = questions.find((question) => question.topicId === selectedTopicId);
    if (firstQuestion) {
      setSelectedQuestionId(firstQuestion.id);
      resetTutorState();
    }
  }, [selectedTopicId, questions.length]);

  function resetTutorState() {
    setAnswer("");
    setAnswerFeedback(null);
    setDiagnosis(null);
    setDialogueReply("");
    setPractice(null);
    setVariant(null);
    setVariantAnswer("");
    setVariantResult(null);
  }

  async function handleAnswerSubmit() {
    if (!answer.trim() || !selectedQuestion) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = await api.post("/api/attempts", {
        studentId: selectedStudentId,
        questionId: selectedQuestion.id,
        answer,
      });
      setAnswerFeedback(payload);
      setDiagnosis(null);
      setDialogueReply("");
      setPractice(null);
      setVariant(null);
      setVariantAnswer("");
      setVariantResult(null);
    } catch {
      setError("答案提交失败，请检查输入。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAskAi() {
    if (!answerFeedback?.attempt?.id) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = await api.post("/api/ai-diagnosis", {
        attemptId: answerFeedback.attempt.id,
      });
      setDiagnosis(payload);
      setDialogueReply("");
      setPractice(null);
    } catch {
      setError("AI 诊断启动失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDialogueReply() {
    if (!diagnosis?.session?.id || !dialogueReply.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = await api.post("/api/ai-followup", {
        sessionId: diagnosis.session.id,
        reply: dialogueReply,
      });
      setDiagnosis(payload);
      setDialogueReply("");
      await refreshReports(selectedStudentId);
    } catch {
      setError("AI 追问处理失败。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePractice() {
    if (!selectedQuestion) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = await api.post("/api/ai-practice", {
        sessionId: diagnosis?.session?.id,
        questionId: selectedQuestion.id,
        studentId: selectedStudentId,
        aiTutor: diagnosis?.aiTutor,
      });
      setPractice(payload);
    } catch {
      setError("再练一题生成失败。");
    } finally {
      setSubmitting(false);
    }
  }


  async function handleQuickDiagnose() {
    if (!answer.trim() || !selectedQuestion) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = await api.post("/api/diagnose", {
        studentId: selectedStudentId,
        questionId: selectedQuestion.id,
        answer,
        quickFinalize: true,
      });
      setDiagnosis(payload);
      await refreshReports(selectedStudentId);
    } catch {
      setError("老师快速报告生成失败。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVariant() {
    if (!selectedQuestion) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = await api.post("/api/variants", { questionId: selectedQuestion.id });
      setVariant(payload);
      setVariantAnswer("");
      setVariantResult(null);
    } catch {
      setError("变式题生成失败。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVariantSubmit() {
    if (!variant || !variantAnswer.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = await api.post("/api/variant-attempts", {
        studentId: selectedStudentId,
        questionId: selectedQuestion.id,
        variantId: variant.variant.id,
        answer: variantAnswer,
      });
      setVariantResult(payload);
      await refreshReports(selectedStudentId);
    } catch {
      setError("变式题提交失败。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy(text, label = "反馈", event = {}) {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyStatus(`${label}已复制，并记录为老师提效事件。`);
      } else {
        setCopyStatus("当前浏览器不支持自动复制，请手动选择文案复制。");
      }
      if (event.studentId) {
        await api.post("/api/feedback-events", {
          studentId: event.studentId,
          reportId: event.reportId,
          eventType: event.eventType ?? "copy",
          source: event.source ?? "teacher",
          elapsedSeconds: event.elapsedSeconds ?? 42,
          editChars: event.editChars ?? 0,
          payload: { label },
        });
        await refreshReports(event.studentId);
      }
    } catch {
      setCopyStatus("复制成功与否无法确认，请手动检查；提效事件可能未记录。");
    }
    window.setTimeout(() => setCopyStatus(""), 2600);
  }

  async function handleParentFeedback({ helpful, comment }) {
    if (!studentReport?.student?.id) return;
    setSubmitting(true);
    try {
      await api.post("/api/parent-feedback", {
        studentId: studentReport.student.id,
        reportId: studentReport.latest?.id,
        helpful,
        comment,
      });
      await refreshReports(studentReport.student.id);
      setCopyStatus("家长反馈已记录。");
    } catch {
      setError("家长反馈记录失败。");
    } finally {
      setSubmitting(false);
      window.setTimeout(() => setCopyStatus(""), 2200);
    }
  }

  async function handleMarkSent(studentId, reportId) {
    if (!studentId) return;
    await api.post("/api/feedback-events", {
      studentId,
      reportId,
      eventType: "sent",
      source: "teacher",
      elapsedSeconds: 45,
      payload: { channel: "manual-demo" },
    });
    await refreshReports(studentId);
    setCopyStatus("已标记为发送给家长。");
    window.setTimeout(() => setCopyStatus(""), 2200);
  }

  async function handleReset() {
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/demo/reset");
      resetTutorState();
      await refreshReports(selectedStudentId);
    } catch {
      setError("重置失败。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <Sparkles size={28} />
        <p>正在加载高一函数学习数据...</p>
      </main>
    );
  }

  return (
    <main className={`app-shell ${isShareMode ? "share-mode" : ""}`}>
      {!isShareMode && (
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="eyebrow">Tutor Copilot MVP</p>
              <h1>错题诊断与反馈</h1>
            </div>
          </div>

          <nav className="nav-list">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-btn ${activeView === item.id ? "active" : ""}`}
                  onClick={() => setActiveView(item.id)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="student-switcher">
            <label>当前学生</label>
            <select
              value={selectedStudentId}
              onChange={(event) => {
                setSelectedStudentId(event.target.value);
                resetTutorState();
              }}
            >
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} · {student.profileType}
                </option>
              ))}
            </select>
          </div>

          <button className="ghost-btn" onClick={handleReset} disabled={submitting}>
            <RefreshCw size={16} />
            重置演示数据
          </button>
        </aside>
      )}

      <section className="main-content">
        {!isShareMode && (
          <header className="topbar">
            <div>
              <p className="eyebrow">可解释诊断 · 多轮追问 · 老师提效证据</p>
              <h2>{viewTitle(activeView)}</h2>
            </div>
            <div className="topbar-actions">
              <span className="data-pill">{questions.length} 道题</span>
              <span className="data-pill">{topics.length} 个模块</span>
              <span className="data-pill">{teacherOverview?.summary.reportCount ?? 0} 份报告</span>
            </div>
          </header>
        )}

        {error && <div className="error-banner">{error}</div>}
        {copyStatus && <div className="success-banner">{copyStatus}</div>}

        {activeView === "dashboard" && (
          <Dashboard
            student={selectedStudent}
            report={studentReport}
            overview={teacherOverview}
            groupedQuestions={groupedQuestions}
          />
        )}

        {activeView === "student" && (
          <StudentTutor
            topics={topics}
            topicQuestions={topicQuestions}
            selectedTopicId={selectedTopicId}
            setSelectedTopicId={setSelectedTopicId}
            selectedQuestionId={selectedQuestionId}
            setSelectedQuestionId={(id) => {
              setSelectedQuestionId(id);
              resetTutorState();
            }}
            selectedQuestion={selectedQuestion}
            answer={answer}
            setAnswer={setAnswer}
            answerFeedback={answerFeedback}
            diagnosis={diagnosis}
            dialogueReply={dialogueReply}
            setDialogueReply={setDialogueReply}
            practice={practice}
            submitting={submitting}
            onAnswerSubmit={handleAnswerSubmit}
            onAskAi={handleAskAi}
            onDialogueReply={handleDialogueReply}
            onPractice={handlePractice}
          />
        )}

        {activeView === "parent" && (
          <ParentReport
            report={studentReport}
            isShareMode={isShareMode}
            onCopy={(text) =>
              handleCopy(text, "家长反馈", {
                studentId: studentReport?.student?.id,
                reportId: studentReport?.latest?.id,
                source: "parent-report",
              })
            }
            onParentFeedback={handleParentFeedback}
          />
        )}

        {activeView === "teacher" && (
          <TeacherView
            overview={teacherOverview}
            selectedStudentId={selectedStudentId}
            onCopy={handleCopy}
            onMarkSent={handleMarkSent}
          />
        )}

        {activeView === "portfolio" && <PortfolioCaseStudy />}
      </section>
    </main>
  );
}

function viewTitle(view) {
  return {
    dashboard: "学习看板",
    student: "可解释诊断 Copilot",
    parent: "家长可读学习报告",
    teacher: "老师工作台",
    portfolio: "产品验证说明",
  }[view];
}

function Dashboard({ student, report, overview, groupedQuestions }) {
  const variantStats = report?.variantStats ?? { total: 0, correct: 0, accuracy: 0 };
  const productivity = overview?.productivity ?? report?.productivity ?? {};

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Positioning</p>
          <h3>{student?.name} · 家教老师错题诊断与家长反馈 Copilot</h3>
          <p>
            当前版本不宣称“万能 AI 家教”，而是用可解释答案校验、多轮追问和反馈事件记录，
            验证家教老师课后服务是否真的提效。
          </p>
        </div>
        <div className="metric-strip">
          <Metric label="已生成反馈" value={productivity.generatedCount ?? 0} />
          <Metric label="平均编辑" value={`${productivity.averageEditSeconds ?? 42}s`} />
          <Metric label="估算节省" value={`${productivity.estimatedSavedMinutes ?? 0}min`} />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <ShieldCheck size={18} />
          <h3>可信诊断证据</h3>
        </div>
        <div className="report-copy">
          <strong>{report?.latest?.analysis?.equivalenceResult === "equivalent" ? "最近一次结构化校验通过" : "最近一次仍需诊断"}</strong>
          <p>{report?.latest?.analysis?.evidence?.[0] ?? "完成一次诊断后，这里会展示系统判错依据，而不是只展示模板结论。"}</p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <Sparkles size={18} />
          <h3>迁移验证</h3>
        </div>
        <div className="report-copy">
          <strong>{report?.transferStatus ?? "等待变式迁移验证"}</strong>
          <p>
            已完成 {variantStats.total} 次变式题，正确 {variantStats.correct} 次，
            正确率 {variantStats.accuracy}%。
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <LineChart size={18} />
          <h3>知识点掌握</h3>
        </div>
        <div className="mastery-list">
          {report?.topicStats?.map((item) => (
            <div key={item.topicId} className="mastery-row">
              <span>{item.topicName}</span>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${item.mastery}%` }} />
              </div>
              <strong>{item.mastery}%</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <BookOpenCheck size={18} />
          <h3>模块题库</h3>
        </div>
        <div className="topic-grid">
          {groupedQuestions.map((topic) => (
            <div key={topic.id} className="topic-tile">
              <strong>{topic.name}</strong>
              <span>{topic.questions.length} 道题</span>
              <p>{topic.summary}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StudentTutor(props) {
  const {
    topics,
    topicQuestions,
    selectedTopicId,
    setSelectedTopicId,
    selectedQuestionId,
    setSelectedQuestionId,
    selectedQuestion,
    answer,
    setAnswer,
    answerFeedback,
    diagnosis,
    dialogueReply,
    setDialogueReply,
    practice,
    submitting,
    onAnswerSubmit,
    onAskAi,
    onDialogueReply,
    onPractice,
  } = props;
  const isWrong = answerFeedback && !answerFeedback.analysis?.equivalent;
  const isCorrect = answerFeedback && answerFeedback.analysis?.equivalent;
  const isFinal = diagnosis?.aiTutor?.showFullSolution || diagnosis?.session?.status === "completed";

  return (
    <div className="student-layout">
      <section className="panel question-panel">
        <div className="section-heading">
          <MessageSquareText size={18} />
          <h3>原题作答</h3>
        </div>

        <div className="two-col">
          <label>
            知识模块
            <select value={selectedTopicId} onChange={(event) => setSelectedTopicId(event.target.value)}>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            题目
            <select value={selectedQuestionId} onChange={(event) => setSelectedQuestionId(event.target.value)}>
              {topicQuestions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="question-box">
          <div className="tag-row">
            <span>{selectedQuestion?.difficulty}</span>
            {selectedQuestion?.knowledgePoints.map((point) => <span key={point}>{point}</span>)}
          </div>
          <p>{selectedQuestion?.prompt}</p>
          <button className="sample-link" onClick={() => setAnswer(selectedQuestion?.commonWrongAnswer ?? "")}>
            填入常见错误答案
          </button>
        </div>

        <label>
          学生答案
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="例如：[1,3)∪(3,+∞)，或 x>=1 且 x≠3。系统会先判定是否正确，答错后再开启 AI 家教追问。"
          />
        </label>

        <div className="action-row">
          <button className="primary-btn" onClick={onAnswerSubmit} disabled={submitting || !answer.trim()}>
            <HelpCircle size={16} />
            提交答案
          </button>
        </div>

        {answerFeedback && (
          <AnswerFeedback
            feedback={answerFeedback}
            hasAiDiagnosis={Boolean(diagnosis)}
            submitting={submitting}
            onAskAi={onAskAi}
          />
        )}
      </section>

      <section className="panel tutor-panel">
        <div className="section-heading">
          <Bot size={18} />
          <h3>多轮诊断与依据</h3>
        </div>
        {!answerFeedback ? (
          <div className="empty-state">
            <p>先提交答案。答错后这里会出现 AI 家教对话、错误类型、诊断依据和复习建议。</p>
          </div>
        ) : isCorrect ? (
          <div className="empty-state">
            <p>这次答案通过了结构化校验。可以让学生口头复述关键依据，确认不是只记住答案。</p>
          </div>
        ) : !diagnosis ? (
          <div className="ai-waiting-card">
            <p className="eyebrow">Ask AI</p>
            <h4>你的答案不正确</h4>
            <p>点击“问 AI 帮我分析”后，系统会把题目、知识点、正确答案、学生答案、历史记录和当前错因一起传给后端 AI 家教。</p>
            <button className="primary-btn" onClick={onAskAi} disabled={submitting || !isWrong}>
              <Bot size={16} />
              问 AI 帮我分析
            </button>
          </div>
        ) : (
          <div className="chat-stack">
            <div className="ai-status-row">
              <span>{diagnosis.llm?.status === "live" ? "AI 模型实时生成" : "本地规则降级"}</span>
              <strong>{diagnosis.llm?.provider} · {diagnosis.llm?.model}</strong>
            </div>
            {diagnosis.llm?.reason && <p className="muted-text compact-note">{diagnosis.llm.reason}</p>}

            <ChatBubble text={diagnosis.aiTutor.reply} />
            {!isFinal && diagnosis.aiTutor.nextQuestion && (
              <ChatBubble text={diagnosis.aiTutor.nextQuestion} />
            )}
            <AnalysisEvidence analysis={diagnosis.analysis} />
            <AiDiagnosisSummary diagnosis={diagnosis} />

            {!isFinal && (
              <div className="reply-card">
                <label>
                  学生回应追问
                  <textarea
                    value={dialogueReply}
                    onChange={(event) => setDialogueReply(event.target.value)}
                    placeholder="让学生先回答 AI 的追问。连续多轮仍无法解决时，AI 会逐步给出更明确提示。"
                  />
                </label>
                <button className="primary-btn" onClick={onDialogueReply} disabled={submitting || !dialogueReply.trim()}>
                  <Send size={16} />
                  发送给 AI 家教
                </button>
              </div>
            )}

            <button className="secondary-btn inline-action" onClick={onPractice} disabled={submitting || !selectedQuestion}>
              <Sparkles size={16} />
              再练一题
            </button>
          </div>
        )}

        {practice && <PracticeBlock payload={practice} />}
      </section>
    </div>
  );
}

function AnswerFeedback({ feedback, hasAiDiagnosis, submitting, onAskAi }) {
  const isCorrect = feedback.analysis?.equivalent;
  return (
    <div className={`answer-feedback ${isCorrect ? "pass" : "warn"}`}>
      <div>
        <strong>{isCorrect ? "你的答案正确" : "你的答案不正确"}</strong>
        <p>{isCorrect ? "结构化校验通过，建议继续复述关键步骤。" : "错误原因诊断"}</p>
      </div>
      <AnalysisEvidence analysis={feedback.analysis} compact />
      {!isCorrect && (
        <button className="secondary-btn" onClick={onAskAi} disabled={submitting || hasAiDiagnosis}>
          <Bot size={16} />
          {hasAiDiagnosis ? "AI 已开始分析" : "问 AI 帮我分析"}
        </button>
      )}
    </div>
  );
}

function AiDiagnosisSummary({ diagnosis }) {
  const aiTutor = diagnosis.aiTutor;
  if (!aiTutor) return null;
  return (
    <div className="diagnosis-block ai-diagnosis-block">
      <div className="tag-row">
        <span>{aiTutor.errorType}</span>
        <span>提示强度 {aiTutor.hintLevel}/3</span>
        {aiTutor.showFullSolution && <span>已给出完整解析</span>}
      </div>

      <strong>AI 诊断结论</strong>
      <p>{aiTutor.diagnosis}</p>

      <strong>诊断依据</strong>
      <ul className="evidence-list">
        {aiTutor.evidence.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <strong>复习建议</strong>
      <ul className="evidence-list">
        {aiTutor.reviewSuggestions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function PracticeBlock({ payload }) {
  const practice = payload.practice;
  if (!practice) return null;
  return (
    <div className="variant-block practice-block">
      <div className="ai-status-row">
        <span>再练一题</span>
        <strong>{payload.llm?.status === "live" ? "AI 生成" : "本地题库生成"}</strong>
      </div>
      <p className="eyebrow">{practice.knowledgePoint} · {practice.difficulty}</p>
      <h4>{practice.strategy}</h4>
      <p>{practice.prompt}</p>
      <details>
        <summary>查看参考答案与步骤</summary>
        <p>参考答案：{practice.answer}</p>
        <ol>
          {practice.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function AnalysisEvidence({ analysis, compact = false }) {
  if (!analysis) return null;
  return (
    <div className={`analysis-card ${analysis.equivalent ? "pass" : "warn"} ${compact ? "compact" : ""}`}>
      <div className="analysis-head">
        <strong>{analysis.equivalent ? "数学等价校验通过" : "数学等价校验未通过"}</strong>
        <span>{analysis.answerType} · {Math.round((analysis.confidence ?? 0) * 100)}%</span>
      </div>
      <p>{analysis.evidence?.[0] ?? "暂无诊断依据。"}</p>
      <div className="tag-row">
        {analysis.missingConditions?.map((item) => <span key={`m-${item}`}>缺少 {item}</span>)}
        {analysis.extraConditions?.map((item) => <span key={`e-${item}`}>{item}</span>)}
        {analysis.misconceptionCandidates?.map((item) => <span key={item.id}>{item.name}</span>)}
      </div>
    </div>
  );
}

function ParentReport({ report, isShareMode, onCopy, onParentFeedback }) {
  const [helpful, setHelpful] = useState(true);
  const [comment, setComment] = useState("");
  if (!report) return null;

  const variantStats = report.variantStats ?? { total: 0, correct: 0, accuracy: 0 };
  const latest = report.latest;
  const copyableFeedback = report.copyableFeedback ?? "暂无可复制反馈，请先完成一次错题诊断和变式练习。";

  return (
    <div className={`page-grid parent-report ${isShareMode ? "shared-parent" : ""}`}>
      <section className="hero-panel parent-hero">
        <div>
          <p className="eyebrow">Parent First</p>
          <h3>{report.student.name} 本次错因与监督建议</h3>
          <p>{latest ? latest.parentSummary : "暂无诊断记录。建议先完成一道基础题，生成可解释诊断。"}</p>
        </div>
        <div className="metric-strip">
          <Metric label="变式正确率" value={`${variantStats.accuracy}%`} />
          <Metric label="诊断记录" value={report.recentReports?.length ?? 0} />
          <Metric label="家长反馈" value={`${report.parentFeedbackStats?.helpfulCount ?? 0}/${report.parentFeedbackStats?.total ?? 0}`} />
        </div>
      </section>

      <section className="panel parent-priority">
        <div className="section-heading">
          <AlertTriangle size={18} />
          <h3>本次为什么错</h3>
        </div>
        {latest ? (
          <div className="report-copy">
            <strong>{latest.questionTitle}</strong>
            <p>{latest.diagnosis}</p>
            <AnalysisEvidence analysis={latest.analysis} compact />
          </div>
        ) : (
          <p className="muted-text">暂无诊断记录。</p>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <Target size={18} />
          <h3>下一步怎么监督</h3>
        </div>
        <div className="report-copy">
          <strong>{report.transferStatus ?? "等待变式迁移验证"}</strong>
          <p>{report.nextPlan}</p>
          <p>
            已完成 {variantStats.total} 次变式题，正确 {variantStats.correct} 次，
            正确率 {variantStats.accuracy}%。
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <BarChart3 size={18} />
          <h3>薄弱知识点</h3>
        </div>
        <div className="weak-list">
          {report.weakPoints?.length ? (
            report.weakPoints.map((point) => (
              <div key={point.name} className="weak-row">
                <span>{point.name}</span>
                <strong>{point.count} 次</strong>
              </div>
            ))
          ) : (
            <p className="muted-text">完成诊断后自动生成。</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <Clock3 size={18} />
          <h3>反馈提效证据</h3>
        </div>
        <div className="report-copy">
          <strong>估算节省 {report.productivity?.estimatedSavedMinutes ?? 0} 分钟</strong>
          <p>{report.productivity?.evidenceStatus}</p>
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="section-heading">
          <Clipboard size={18} />
          <h3>可复制家长反馈</h3>
        </div>
        <pre className="copy-box">{copyableFeedback}</pre>
        <div className="action-row">
          <button className="primary-btn" onClick={() => onCopy(copyableFeedback)}>
            <Clipboard size={16} />
            复制反馈
          </button>
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="section-heading">
          <MessageSquareText size={18} />
          <h3>家长反馈采集</h3>
        </div>
        <div className="feedback-form">
          <div className="segmented">
            <button className={helpful ? "active" : ""} onClick={() => setHelpful(true)}>有帮助</button>
            <button className={!helpful ? "active" : ""} onClick={() => setHelpful(false)}>仍有疑问</button>
          </div>
          <label>
            家长还想了解什么
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="例如：希望老师下次重点讲端点为什么不能取。" />
          </label>
          <button className="secondary-btn" onClick={() => onParentFeedback({ helpful, comment })}>
            <Send size={16} />
            提交反馈
          </button>
        </div>
      </section>
    </div>
  );
}

function TeacherView({ overview, selectedStudentId, onCopy, onMarkSent }) {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft(overview?.teacherDraft ?? "");
  }, [overview?.teacherDraft]);
  if (!overview) return null;

  const selectedStudent = overview.students.find((student) => student.id === selectedStudentId) ?? overview.students[0];
  const selectedReport = selectedStudent?.latestReport;

  return (
    <div className="teacher-layout">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Teacher Workspace</p>
          <h3>今日任务优先级</h3>
          <p>老师端不再只看统计，而是把待发送反馈、迁移验证、风险学生和下节课安排排成工作台。</p>
        </div>
        <div className="metric-strip">
          <Metric label="待办任务" value={overview.tasks?.length ?? 0} />
          <Metric label="已发送" value={overview.productivity?.sentCount ?? 0} />
          <Metric label="估算节省" value={`${overview.productivity?.estimatedSavedMinutes ?? 0}min`} />
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="section-heading">
          <Target size={18} />
          <h3>待办工作流</h3>
        </div>
        <div className="task-grid">
          {overview.tasks?.map((task) => (
            <div key={task.id} className={`task-card priority-${task.priority}`}>
              <span>{task.type} · {task.dueLabel}</span>
              <strong>{task.title}</strong>
              <p>{task.description}</p>
            </div>
          ))}
          {!overview.tasks?.length && <p className="muted-text">暂无待办任务。</p>}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <Users size={18} />
          <h3>学生跟进卡</h3>
        </div>
        <div className="student-card-list">
          {overview.students.map((student) => (
            <div key={student.id} className="student-card workspace-card">
              <div className="student-avatar" style={{ background: student.avatarColor }}>
                {student.name.slice(0, 1)}
              </div>
              <div>
                <strong>{student.name} · 优先级{student.priority}</strong>
                <p>{student.nextAction}</p>
                <div className="tag-row">
                  {student.riskFlags.length ? student.riskFlags.map((flag) => <span key={flag}>{flag}</span>) : <span>稳定跟进</span>}
                </div>
              </div>
              <b>{student.transferRate}%</b>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <BarChart3 size={18} />
          <h3>高频错因</h3>
        </div>
        <div className="weak-list">
          {overview.weakRank.length ? (
            overview.weakRank.map((item) => (
              <div key={item.name} className="weak-row">
                <span>{item.name}</span>
                <strong>{item.count} 次</strong>
              </div>
            ))
          ) : (
            <p className="muted-text">暂无诊断记录。</p>
          )}
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="section-heading">
          <MessageSquareText size={18} />
          <h3>反馈草稿工作流</h3>
        </div>
        <label>
          老师可编辑草稿
          <textarea className="draft-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <div className="action-row">
          <button
            className="primary-btn"
            onClick={() => onCopy(draft, "老师反馈草稿", {
              studentId: selectedStudent?.id,
              reportId: selectedReport?.id,
              source: "teacher-workspace",
              editChars: Math.abs(draft.length - (overview.teacherDraft?.length ?? 0)),
            })}
          >
            <Clipboard size={16} />
            复制草稿
          </button>
          <button className="secondary-btn" onClick={() => onMarkSent(selectedStudent?.id, selectedReport?.id)}>
            <CheckCircle2 size={16} />
            标记已发送
          </button>
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="section-heading">
          <ClipboardList size={18} />
          <h3>最近变式练习</h3>
        </div>
        <div className="record-list">
          {overview.recentVariantAttempts?.map((record) => (
            <div key={record.id} className="record-row">
              <span>{record.studentName}</span>
              <strong>{record.isCorrect ? "迁移掌握" : "仍需巩固"}</strong>
              <p>{record.sourceTitle}：{record.feedback}</p>
            </div>
          ))}
          {!overview.recentVariantAttempts?.length && <p className="muted-text">暂无变式练习记录。</p>}
        </div>
      </section>
    </div>
  );
}

function PortfolioCaseStudy() {
  return (
    <div className="case-layout">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Validation Case</p>
          <h3>从 AI 家教口号改为可验证的老师 Copilot</h3>
          <p>
            第一版的问题是“AI 能力说得太满”。新版明确用可解释校验器、多轮追问和事件指标来证明产品假设，
            LLM 只作为后续增强方向，而不是当前可信度来源。
          </p>
        </div>
      </section>

      <section className="panel">
        <h3>已验证能力</h3>
        <ul className="case-list">
          <li>区间、不等式、零点集合和坐标点混淆的结构化识别。</li>
          <li>提交答案后先追问，学生回应后再生成最终诊断。</li>
          <li>反馈复制、发送、家长满意度会写入本地事件。</li>
          <li>老师端输出待办、风险和下节课建议。</li>
        </ul>
      </section>

      <section className="panel">
        <h3>待验证假设</h3>
        <ul className="case-list">
          <li>真实老师是否愿意在课后编辑并发送系统草稿。</li>
          <li>平均反馈时间能否从 30 分钟下降到 5 分钟以内。</li>
          <li>家长是否认为监督建议更可执行。</li>
          <li>学生长期变式迁移正确率是否提升。</li>
        </ul>
      </section>

      <section className="panel">
        <h3>技术边界</h3>
        <p className="report-copy">
          当前不做泛化 CAS，也不宣称接入真实大模型。系统只覆盖高一函数常见答案形态：
          区间、不等式、零点集合、坐标点和概念标签。这样更容易解释、测试和被老师信任。
        </p>
      </section>

      <section className="panel">
        <h3>下一步试点</h3>
        <p className="report-copy">
          找 3-5 位家教老师连续使用 2 周，记录反馈生成时间、编辑时间、发送率、家长反馈和学生变式迁移正确率，
          用真实事件替代作品集假设。
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChatBubble({ text }) {
  return (
    <div className="chat-bubble ai">
      <p>{text}</p>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
