import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { misconceptions, questions, students, topics } from "./seedData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "app.db");

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);

function toJson(value) {
  return JSON.stringify(value ?? []);
}

export function fromJson(value, fallback = []) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function one(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function many(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

function ensureColumn(tableName, columnName, definition) {
  const columns = many(`PRAGMA table_info(${tableName})`);
  if (!columns.some((column) => column.name === columnName)) {
    run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      grade TEXT NOT NULL,
      profile_type TEXT NOT NULL,
      baseline TEXT NOT NULL,
      goal TEXT NOT NULL,
      avatar_color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      order_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS misconceptions (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      remedy TEXT NOT NULL,
      parent_guidance TEXT NOT NULL,
      tags TEXT NOT NULL,
      FOREIGN KEY (topic_id) REFERENCES topics(id)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      knowledge_points TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      common_wrong_answer TEXT NOT NULL,
      misconception_id TEXT NOT NULL,
      follow_up TEXT NOT NULL,
      hint TEXT NOT NULL,
      steps TEXT NOT NULL,
      FOREIGN KEY (topic_id) REFERENCES topics(id),
      FOREIGN KEY (misconception_id) REFERENCES misconceptions(id)
    );

    CREATE TABLE IF NOT EXISTS variant_templates (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      strategy TEXT NOT NULL,
      prompt TEXT NOT NULL,
      answer TEXT NOT NULL,
      added_knowledge_points TEXT NOT NULL,
      steps TEXT NOT NULL,
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      answer TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS diagnosis_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      dialogue_session_id INTEGER,
      misconception_id TEXT,
      follow_up TEXT NOT NULL,
      diagnosis TEXT NOT NULL,
      weak_points TEXT NOT NULL,
      next_plan TEXT NOT NULL,
      parent_summary TEXT NOT NULL,
      analysis_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (attempt_id) REFERENCES attempts(id),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (question_id) REFERENCES questions(id),
      FOREIGN KEY (misconception_id) REFERENCES misconceptions(id)
    );

    CREATE TABLE IF NOT EXISTS variant_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      source_question_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      answer TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      feedback TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (source_question_id) REFERENCES questions(id),
      FOREIGN KEY (variant_id) REFERENCES variant_templates(id)
    );

    CREATE TABLE IF NOT EXISTS dialogue_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      attempt_id INTEGER NOT NULL,
      answer TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting_reply',
      tutor_question TEXT NOT NULL,
      hint_level INTEGER NOT NULL DEFAULT 1,
      ai_provider TEXT,
      model_name TEXT,
      llm_status TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      completed_at TEXT,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (question_id) REFERENCES questions(id),
      FOREIGN KEY (attempt_id) REFERENCES attempts(id)
    );

    CREATE TABLE IF NOT EXISTS dialogue_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (session_id) REFERENCES dialogue_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS feedback_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      report_id INTEGER,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      elapsed_seconds INTEGER NOT NULL DEFAULT 42,
      edit_chars INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (report_id) REFERENCES diagnosis_reports(id)
    );

    CREATE TABLE IF NOT EXISTS parent_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      report_id INTEGER,
      helpful INTEGER NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (report_id) REFERENCES diagnosis_reports(id)
    );

    CREATE TABLE IF NOT EXISTS teacher_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      priority TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      due_label TEXT NOT NULL DEFAULT '今日',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      completed_at TEXT,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  ensureColumn("diagnosis_reports", "dialogue_session_id", "INTEGER");
  ensureColumn("diagnosis_reports", "analysis_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn("dialogue_sessions", "ai_provider", "TEXT");
  ensureColumn("dialogue_sessions", "model_name", "TEXT");
  ensureColumn("dialogue_sessions", "llm_status", "TEXT NOT NULL DEFAULT 'local'");

  if (!one("SELECT id FROM students LIMIT 1")) {
    seedDatabase();
  }
}

function seedDatabase() {
  const insertStudent = db.prepare(`
    INSERT INTO students (id, name, grade, profile_type, baseline, goal, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTopic = db.prepare(`
    INSERT INTO topics (id, name, summary, order_index)
    VALUES (?, ?, ?, ?)
  `);
  const insertMisconception = db.prepare(`
    INSERT INTO misconceptions (id, topic_id, name, description, remedy, parent_guidance, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertQuestion = db.prepare(`
    INSERT INTO questions (
      id, topic_id, title, prompt, difficulty, knowledge_points, correct_answer,
      common_wrong_answer, misconception_id, follow_up, hint, steps
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVariant = db.prepare(`
    INSERT INTO variant_templates (
      id, question_id, strategy, prompt, answer, added_knowledge_points, steps
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  students.forEach((student) => {
    insertStudent.run(
      student.id,
      student.name,
      student.grade,
      student.profileType,
      student.baseline,
      student.goal,
      student.avatarColor
    );
  });

  topics.forEach((topic) => {
    insertTopic.run(topic.id, topic.name, topic.summary, topic.orderIndex);
  });

  misconceptions.forEach((item) => {
    insertMisconception.run(
      item.id,
      item.topicId,
      item.name,
      item.description,
      item.remedy,
      item.parentGuidance,
      toJson(item.tags)
    );
  });

  questions.forEach((question) => {
    insertQuestion.run(
      question.id,
      question.topicId,
      question.title,
      question.prompt,
      question.difficulty,
      toJson(question.knowledgePoints),
      question.correctAnswer,
      question.commonWrongAnswer,
      question.misconceptionId,
      question.followUp,
      question.hint,
      toJson(question.steps)
    );
    insertVariant.run(
      `var-${question.id}`,
      question.id,
      question.variant.strategy,
      question.variant.prompt,
      question.variant.answer,
      toJson(question.variant.addedKnowledgePoints),
      toJson(question.variant.steps)
    );
  });
}

export function resetDatabaseForDemo() {
  db.exec(`
    DELETE FROM teacher_tasks;
    DELETE FROM parent_feedback;
    DELETE FROM feedback_events;
    DELETE FROM dialogue_messages;
    DELETE FROM dialogue_sessions;
    DELETE FROM variant_attempts;
    DELETE FROM diagnosis_reports;
    DELETE FROM attempts;
  `);
}

export function getStudents() {
  return many("SELECT * FROM students ORDER BY id").map(mapStudent);
}

export function getStudent(studentId) {
  const row = one("SELECT * FROM students WHERE id = ?", [studentId]);
  return row ? mapStudent(row) : null;
}

export function getTopics() {
  return many("SELECT * FROM topics ORDER BY order_index").map((row) => ({
    id: row.id,
    name: row.name,
    summary: row.summary,
    orderIndex: row.order_index,
  }));
}

export function getQuestions(topicId) {
  const rows = topicId
    ? many("SELECT * FROM questions WHERE topic_id = ? ORDER BY id", [topicId])
    : many("SELECT * FROM questions ORDER BY topic_id, id");
  return rows.map(mapQuestion);
}

export function getQuestion(questionId) {
  const row = one("SELECT * FROM questions WHERE id = ?", [questionId]);
  return row ? mapQuestion(row) : null;
}

export function getMisconception(misconceptionId) {
  const row = one("SELECT * FROM misconceptions WHERE id = ?", [misconceptionId]);
  return row ? mapMisconception(row) : null;
}

export function getVariant(questionId) {
  const row = one("SELECT * FROM variant_templates WHERE question_id = ?", [questionId]);
  return row ? mapVariant(row) : null;
}

export function insertAttempt({ studentId, questionId, answer, isCorrect }) {
  const result = run(
    "INSERT INTO attempts (student_id, question_id, answer, is_correct) VALUES (?, ?, ?, ?)",
    [studentId, questionId, answer, isCorrect ? 1 : 0]
  );
  return getAttempt(Number(result.lastInsertRowid));
}

export function getAttempt(attemptId) {
  const row = one("SELECT * FROM attempts WHERE id = ?", [attemptId]);
  return row ? mapAttempt(row) : null;
}

export function insertDiagnosisReport(report) {
  const result = run(
    `INSERT INTO diagnosis_reports (
      attempt_id, student_id, question_id, dialogue_session_id, misconception_id, follow_up,
      diagnosis, weak_points, next_plan, parent_summary, analysis_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      report.attemptId,
      report.studentId,
      report.questionId,
      report.dialogueSessionId ?? null,
      report.misconceptionId,
      report.followUp,
      report.diagnosis,
      toJson(report.weakPoints),
      report.nextPlan,
      report.parentSummary,
      JSON.stringify(report.analysis ?? {}),
    ]
  );
  return getDiagnosisReport(Number(result.lastInsertRowid));
}

export function getDiagnosisReport(reportId) {
  const row = one("SELECT * FROM diagnosis_reports WHERE id = ?", [reportId]);
  return row ? mapDiagnosisReport(row) : null;
}

export function getReportsByStudent(studentId) {
  const rows = many(
    `SELECT dr.*, q.title AS question_title, q.prompt, q.topic_id, m.name AS misconception_name
     FROM diagnosis_reports dr
     JOIN questions q ON q.id = dr.question_id
     LEFT JOIN misconceptions m ON m.id = dr.misconception_id
     WHERE dr.student_id = ?
     ORDER BY dr.created_at DESC, dr.id DESC`,
    [studentId]
  );
  return rows.map((row) => ({
    ...mapDiagnosisReport(row),
    questionTitle: row.question_title,
    prompt: row.prompt,
    topicId: row.topic_id,
    misconceptionName: row.misconception_name,
  }));
}

export function getAttemptsByStudent(studentId) {
  const rows = many(
    `SELECT a.*, q.title AS question_title, q.topic_id
     FROM attempts a
     JOIN questions q ON q.id = a.question_id
     WHERE a.student_id = ?
     ORDER BY a.created_at DESC, a.id DESC`,
    [studentId]
  );
  return rows.map((row) => ({
    ...mapAttempt(row),
    questionTitle: row.question_title,
    topicId: row.topic_id,
  }));
}

export function getAllReports() {
  const rows = many(`
    SELECT dr.*, s.name AS student_name, s.profile_type, q.title AS question_title,
           q.topic_id, m.name AS misconception_name
    FROM diagnosis_reports dr
    JOIN students s ON s.id = dr.student_id
    JOIN questions q ON q.id = dr.question_id
    LEFT JOIN misconceptions m ON m.id = dr.misconception_id
    ORDER BY dr.created_at DESC, dr.id DESC
  `);
  return rows.map((row) => ({
    ...mapDiagnosisReport(row),
    studentName: row.student_name,
    profileType: row.profile_type,
    questionTitle: row.question_title,
    topicId: row.topic_id,
    misconceptionName: row.misconception_name,
  }));
}

export function insertVariantAttempt({ studentId, sourceQuestionId, variantId, answer, isCorrect, feedback }) {
  const result = run(
    `INSERT INTO variant_attempts (
      student_id, source_question_id, variant_id, answer, is_correct, feedback
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [studentId, sourceQuestionId, variantId, answer, isCorrect ? 1 : 0, feedback]
  );
  return getVariantAttempt(Number(result.lastInsertRowid));
}

export function getVariantAttempt(variantAttemptId) {
  const row = one("SELECT * FROM variant_attempts WHERE id = ?", [variantAttemptId]);
  return row ? mapVariantAttempt(row) : null;
}

export function getVariantAttemptsByStudent(studentId) {
  const rows = many(
    `SELECT va.*, vt.prompt AS variant_prompt, vt.answer AS variant_answer, q.title AS source_title, q.topic_id
     FROM variant_attempts va
     JOIN variant_templates vt ON vt.id = va.variant_id
     JOIN questions q ON q.id = va.source_question_id
     WHERE va.student_id = ?
     ORDER BY va.created_at DESC, va.id DESC`,
    [studentId]
  );
  return rows.map((row) => ({
    ...mapVariantAttempt(row),
    variantPrompt: row.variant_prompt,
    variantAnswer: row.variant_answer,
    sourceTitle: row.source_title,
    topicId: row.topic_id,
  }));
}

export function getAllVariantAttempts() {
  const rows = many(`
    SELECT va.*, vt.prompt AS variant_prompt, vt.answer AS variant_answer, q.title AS source_title,
           q.topic_id, s.name AS student_name
    FROM variant_attempts va
    JOIN variant_templates vt ON vt.id = va.variant_id
    JOIN questions q ON q.id = va.source_question_id
    JOIN students s ON s.id = va.student_id
    ORDER BY va.created_at DESC, va.id DESC
  `);
  return rows.map((row) => ({
    ...mapVariantAttempt(row),
    variantPrompt: row.variant_prompt,
    variantAnswer: row.variant_answer,
    sourceTitle: row.source_title,
    topicId: row.topic_id,
    studentName: row.student_name,
  }));
}

export function insertDialogueSession({
  studentId,
  questionId,
  attemptId,
  answer,
  analysis,
  tutorQuestion,
  hintLevel = 1,
  aiProvider = null,
  modelName = null,
  llmStatus = "local",
}) {
  const result = run(
    `INSERT INTO dialogue_sessions (
      student_id, question_id, attempt_id, answer, analysis_json, tutor_question, hint_level,
      ai_provider, model_name, llm_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      studentId,
      questionId,
      attemptId,
      answer,
      JSON.stringify(analysis ?? {}),
      tutorQuestion,
      hintLevel,
      aiProvider,
      modelName,
      llmStatus,
    ]
  );
  return getDialogueSession(Number(result.lastInsertRowid));
}

export function getDialogueSession(sessionId) {
  const row = one("SELECT * FROM dialogue_sessions WHERE id = ?", [sessionId]);
  return row ? mapDialogueSession(row) : null;
}

export function completeDialogueSession(sessionId) {
  run(
    "UPDATE dialogue_sessions SET status = 'completed', completed_at = datetime('now', 'localtime') WHERE id = ?",
    [sessionId]
  );
  return getDialogueSession(sessionId);
}

export function updateDialogueSession(sessionId, updates = {}) {
  const current = getDialogueSession(sessionId);
  if (!current) return null;
  run(
    `UPDATE dialogue_sessions
     SET status = ?, tutor_question = ?, hint_level = ?, ai_provider = ?, model_name = ?, llm_status = ?
     WHERE id = ?`,
    [
      updates.status ?? current.status,
      updates.tutorQuestion ?? current.tutorQuestion,
      updates.hintLevel ?? current.hintLevel,
      updates.aiProvider ?? current.aiProvider,
      updates.modelName ?? current.modelName,
      updates.llmStatus ?? current.llmStatus,
      sessionId,
    ]
  );
  return getDialogueSession(sessionId);
}

export function insertDialogueMessage({ sessionId, role, content }) {
  const result = run(
    "INSERT INTO dialogue_messages (session_id, role, content) VALUES (?, ?, ?)",
    [sessionId, role, content]
  );
  return getDialogueMessages(sessionId).find((message) => message.id === Number(result.lastInsertRowid));
}

export function getDialogueMessages(sessionId) {
  return many("SELECT * FROM dialogue_messages WHERE session_id = ? ORDER BY id", [sessionId]).map(mapDialogueMessage);
}

export function insertFeedbackEvent({
  studentId,
  reportId = null,
  eventType,
  source = "teacher",
  payload = {},
  elapsedSeconds = 42,
  editChars = 0,
}) {
  const result = run(
    `INSERT INTO feedback_events (
      student_id, report_id, event_type, source, payload_json, elapsed_seconds, edit_chars
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [studentId, reportId, eventType, source, JSON.stringify(payload ?? {}), elapsedSeconds, editChars]
  );
  return getFeedbackEvents().find((event) => event.id === Number(result.lastInsertRowid));
}

export function getFeedbackEvents(filters = {}) {
  let sql = "SELECT * FROM feedback_events";
  const clauses = [];
  const params = [];
  if (filters.studentId) {
    clauses.push("student_id = ?");
    params.push(filters.studentId);
  }
  if (filters.eventType) {
    clauses.push("event_type = ?");
    params.push(filters.eventType);
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
  sql += " ORDER BY created_at DESC, id DESC";
  return many(sql, params).map(mapFeedbackEvent);
}

export function insertParentFeedback({ studentId, reportId = null, helpful, comment = "" }) {
  const result = run(
    "INSERT INTO parent_feedback (student_id, report_id, helpful, comment) VALUES (?, ?, ?, ?)",
    [studentId, reportId, helpful ? 1 : 0, comment]
  );
  return getParentFeedback({ studentId }).find((item) => item.id === Number(result.lastInsertRowid));
}

export function getParentFeedback(filters = {}) {
  let sql = "SELECT * FROM parent_feedback";
  const params = [];
  if (filters.studentId) {
    sql += " WHERE student_id = ?";
    params.push(filters.studentId);
  }
  sql += " ORDER BY created_at DESC, id DESC";
  return many(sql, params).map(mapParentFeedback);
}

function mapStudent(row) {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    profileType: row.profile_type,
    baseline: row.baseline,
    goal: row.goal,
    avatarColor: row.avatar_color,
  };
}

function mapQuestion(row) {
  return {
    id: row.id,
    topicId: row.topic_id,
    title: row.title,
    prompt: row.prompt,
    difficulty: row.difficulty,
    knowledgePoints: fromJson(row.knowledge_points),
    correctAnswer: row.correct_answer,
    commonWrongAnswer: row.common_wrong_answer,
    misconceptionId: row.misconception_id,
    followUp: row.follow_up,
    hint: row.hint,
    steps: fromJson(row.steps),
  };
}

function mapMisconception(row) {
  return {
    id: row.id,
    topicId: row.topic_id,
    name: row.name,
    description: row.description,
    remedy: row.remedy,
    parentGuidance: row.parent_guidance,
    tags: fromJson(row.tags),
  };
}

function mapVariant(row) {
  return {
    id: row.id,
    questionId: row.question_id,
    strategy: row.strategy,
    prompt: row.prompt,
    answer: row.answer,
    addedKnowledgePoints: fromJson(row.added_knowledge_points),
    steps: fromJson(row.steps),
  };
}

function mapAttempt(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    questionId: row.question_id,
    answer: row.answer,
    isCorrect: Boolean(row.is_correct),
    createdAt: row.created_at,
  };
}

function mapDiagnosisReport(row) {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    studentId: row.student_id,
    questionId: row.question_id,
    dialogueSessionId: row.dialogue_session_id,
    misconceptionId: row.misconception_id,
    followUp: row.follow_up,
    diagnosis: row.diagnosis,
    weakPoints: fromJson(row.weak_points),
    nextPlan: row.next_plan,
    parentSummary: row.parent_summary,
    analysis: fromJson(row.analysis_json, {}),
    createdAt: row.created_at,
  };
}

function mapVariantAttempt(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    sourceQuestionId: row.source_question_id,
    variantId: row.variant_id,
    answer: row.answer,
    isCorrect: Boolean(row.is_correct),
    feedback: row.feedback,
    createdAt: row.created_at,
  };
}

function mapDialogueSession(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    questionId: row.question_id,
    attemptId: row.attempt_id,
    answer: row.answer,
    analysis: fromJson(row.analysis_json, {}),
    status: row.status,
    tutorQuestion: row.tutor_question,
    hintLevel: row.hint_level,
    aiProvider: row.ai_provider,
    modelName: row.model_name,
    llmStatus: row.llm_status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapDialogueMessage(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

function mapFeedbackEvent(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    reportId: row.report_id,
    eventType: row.event_type,
    source: row.source,
    payload: fromJson(row.payload_json, {}),
    elapsedSeconds: row.elapsed_seconds,
    editChars: row.edit_chars,
    createdAt: row.created_at,
  };
}

function mapParentFeedback(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    reportId: row.report_id,
    helpful: Boolean(row.helpful),
    comment: row.comment,
    createdAt: row.created_at,
  };
}
