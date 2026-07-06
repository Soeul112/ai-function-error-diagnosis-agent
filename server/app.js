import express from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeDatabase, resetDatabaseForDemo } from "./db.js";
import { createAIRateLimiter } from "./ai/rateLimit.js";
import {
  buildStudentReport,
  buildTeacherTasksView,
  buildTeacherOverview,
  diagnoseAnswer,
  generateAiPractice,
  generateVariant,
  continueAiFollowup,
  listQuestions,
  listStudents,
  listTopics,
  recordFeedbackEvent,
  recordParentFeedback,
  replyDialogue,
  startAiDiagnosis,
  startDialogue,
  submitVariantAttempt,
  submitAttempt,
} from "./services.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  initializeDatabase();
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  const aiRateLimiter = createAIRateLimiter();

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, product: "高一函数 AI 错题诊断与学习陪伴系统" });
  });

  app.get("/api/students", (_req, res) => {
    res.json(listStudents());
  });

  app.get("/api/topics", (_req, res) => {
    res.json(listTopics());
  });

  app.get("/api/questions", (req, res) => {
    res.json(listQuestions(req.query.topicId));
  });

  app.post("/api/attempts", (req, res, next) => {
    try {
      res.json(submitAttempt(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/diagnose", (req, res, next) => {
    try {
      res.json(diagnoseAnswer(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/dialogue/start", (req, res, next) => {
    try {
      res.json(startDialogue(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/dialogue/reply", (req, res, next) => {
    try {
      res.json(replyDialogue(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ai-diagnosis", aiRateLimiter, async (req, res, next) => {
    try {
      res.json(await startAiDiagnosis(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ai-followup", aiRateLimiter, async (req, res, next) => {
    try {
      res.json(await continueAiFollowup(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ai-practice", aiRateLimiter, async (req, res, next) => {
    try {
      res.json(await generateAiPractice(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/variants", (req, res, next) => {
    try {
      res.json(generateVariant(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/variant-attempts", (req, res, next) => {
    try {
      res.json(submitVariantAttempt(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reports/:studentId", (req, res, next) => {
    try {
      res.json(buildStudentReport(req.params.studentId));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/teacher/overview", (_req, res, next) => {
    try {
      res.json(buildTeacherOverview());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/teacher/tasks", (_req, res, next) => {
    try {
      res.json(buildTeacherTasksView());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/feedback-events", (req, res, next) => {
    try {
      res.json(recordFeedbackEvent(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/parent-feedback", (req, res, next) => {
    try {
      res.json(recordParentFeedback(req.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/demo/reset", (_req, res) => {
    resetDatabaseForDemo();
    res.json({ ok: true });
  });

  const distDir = path.join(__dirname, "..", "dist");
  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.use((error, _req, res, _next) => {
    res.status(400).json({
      error: error.message || "请求处理失败",
    });
  });

  return app;
}
