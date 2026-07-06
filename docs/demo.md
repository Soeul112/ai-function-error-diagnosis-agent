# Demo 验证记录

验证日期：2026-07-06  
验证环境：Windows + Node.js v24.16.0 + npm 11.13.0

## 1. 已执行命令

```powershell
npm.cmd run build
npm.cmd run test:api
npm.cmd run dev
```

结果：

- `npm.cmd run build`：通过，Vite 生产构建成功。
- `npm.cmd run test:api`：通过，输出 `Smoke test passed`。
- `npm.cmd run dev`：前端成功启动；本机已有服务占用 `5173` 和 `5174`，本次 Vite 自动切换到 `http://127.0.0.1:5175/`。

## 2. 端口与服务状态

本次验证时：

- `http://127.0.0.1:5174/api/health` 返回：

```json
{
  "ok": true,
  "product": "高一函数 AI 错题诊断与学习陪伴系统"
}
```

- 前端使用 `http://127.0.0.1:5175/` 截图。
- 常规本地启动时，如果端口未被占用，前端默认地址仍是 `http://127.0.0.1:5173/`，后端默认地址是 `http://127.0.0.1:5174/`。

## 3. 已验证交互

- 访问学习看板，学生、题库、报告和老师概览能正常加载。
- 在诊断 Copilot 页面输入错误答案 `x≠3`。
- 提交后结构化校验识别为不等价，提示缺少 `x≥1`。
- 点击“问 AI 帮我分析”后，因未配置真实 API Key，页面显示“本地规则降级”。
- 连续两轮学生回应后，系统递增提示强度并给出完整解析、错因归因、诊断依据和复习建议。
- 点击“再练一题”后生成本地题库练习。
- 家长报告能展示本次错因、监督建议、薄弱知识点和可复制反馈。
- 老师工作台能展示待办工作流、学生跟进卡、高频错因、反馈草稿和最近变式练习。
- 浏览器控制台未记录 error/warning。

## 4. 截图文件

截图均来自实际运行页面：

- `docs/screenshots/01-dashboard.png`
- `docs/screenshots/02-answer-check.png`
- `docs/screenshots/03-ai-followup.png`
- `docs/screenshots/04-final-practice.png`
- `docs/screenshots/05-parent-report.png`
- `docs/screenshots/06-teacher-workspace.png`

## 5. 已知限制

- 本次验证未配置真实 LLM API Key，因此 AI 诊断走本地规则降级；代码中保留 Gemini/Groq/OpenRouter 接入。
- 当前题库是自建小样本，只覆盖高一函数 5 个模块和 20 道题。
- `data/app.db` 为本地运行时数据库，会在启动和测试中生成/更新，已通过 `.gitignore` 排除。
- PowerShell 当前环境禁止直接执行 `npm.ps1`，因此验证使用 `npm.cmd`。
- 端口 `5173`、`5174` 在本机已有占用，本次截图使用 Vite 自动切换后的 `5175`。

## 6. 后续建议

- 接入一个真实 LLM Provider 并补充模型 JSON 失败的回归样例。
- 扩展题库和错因标签，覆盖更多函数题型和边界输入。
- 增加 Playwright 端到端测试，自动验证学生作答、AI 追问、家长报告和老师工作台。
- 若用于正式展示，可部署到 Render/Railway/Fly.io 等平台，并明确 SQLite 数据持久化策略。

