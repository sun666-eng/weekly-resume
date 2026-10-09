# 夜间验收审查交接（2026-09-26）

供另一位审查者复核 `docs/nightly-release-audit-report.md` 的结论。本文件回答：最该看什么、怎么复现、哪些结论的可信度边界在哪、哪些工作不是本会话做的、哪些地方还不能下结论。

## 1. 最需要审查的改动（按优先级）

### 1.1 `apps/web/src/features/auth/pages/register.tsx`（唯一的功能代码改动）

```diff
-	name: z.string().min(3).max(64),
+	name: z.string().min(2, { error: () => t`Name must be at least 2 characters.` }).max(64),
 	username: z
 		.string()
-		.min(3)
+		.min(3, { error: () => t`Username must be at least 3 characters.` })
 	...
-	email: z.email().toLowerCase(),
+	email: z.email({ error: () => t`Enter a valid email address.` }).toLowerCase(),
```

外加姓名 `<Input minLength={3}>` → `minLength={2}`。

审查点：
1. **email 的 `.toLowerCase()` 是否保留**——我特意保留了原行为；zod v4 下 `z.email({error}).toLowerCase()` 链式行为请确认与原先等价（typecheck 已过，但行为等价性建议肉眼确认一次注册后邮箱是否仍被小写入库）。
2. **name min 3→2 的产品影响**：上游 Reactive Resume 的约束是 3；放宽到 2 是为两字中文名。服务端 better-auth 对 name 无 min 约束（已核对），但请确认没有别处假设 name>=3。
3. `t` 宏在 zod `error: () =>` 里是惰性求值，模式与同文件 password 一致；确认提取器没有把这批字符串记成 explicit-id 重复条目（`git diff apps/web/locales/en-US.po` 应只有普通条目追加）。

### 1.2 `apps/web/locales/zh-CN.po`（4 处语义修复 + 2 条新译文）

占位符顺序是本次修复的核心，请逐条对照 msgid 的占位符注释（`#. placeholder {0}: report.passedChecks` 等）核对：

| msgid | 原错误 msgstr | 修正后 |
| --- | --- | --- |
| `{0} of {1} applicable checks passed` | `{0} 项适用检查中，{1} 项已通过` | `{1} 项适用检查中，{0} 项已通过` |
| `{0} of {1} applicable checks passed.` | 同上（带句号） | 同上修正 |
| `{0} of {1} terms found` | `找到 {0} 个词中的 {1} 个` | `找到 {1} 个词中的 {0} 个` |
| `{passedRules} of {totalRules} checks passed` | `{passedRules} 项检查中，{totalRules} 项已通过` | `{totalRules} 项检查中，{passedRules} 项已通过` |
| `Warning` | `警告”` | `警告` |

### 1.3 55 个 po 文件的提取刷新（需要你来划定提交边界）

我执行了 `lingui extract --clean --overwrite`（仓库惯例），它按**当前工作区**（含并行会话约 100 个未提交源文件）刷新了全部 55 个 po。语义改动只有 zh-CN/zh-TW 两处文件；en-US.po 的新增条目是编译所必需；其余 50 个语言文件是引用行/空条目刷新（zh-TW 有 199 个空 msgstr 来自并行会话的未提交字符串）。
**审查者需要决策**：提交时是全量收下（与下一个功能批次一起），还是只挑 zh-CN/zh-TW/en-US 三个文件（其余 `git checkout --` 回退）。我没有提交，两种方案都可行。

### 1.4 `compose.nightly.yml` + `docs/nightly-audit-evidence/`

新文件，无风险面。注意 `docs/nightly-audit-evidence/mock-llm.mjs` 是测试替身（会无限循环提出补丁——真实模型不会），勿接生产；`.env.nightly` 被 .gitignore 覆盖，密钥仅限本地。

## 2. 如何复现与验证

完整命令在审计报告第 8 节。最小验证路径：

1. 注册表单：`http://127.0.0.1:3100/auth/register`（需先登出）。姓名「王」→应显示「姓名至少需要 2 个字符。」；再填「王芳」+合法其余字段→应能注册成功。**注意：需要重建镜像后验证**（`docker compose -f compose.nightly.yml --env-file .env.nightly up -d --build app`），旧的 `weekly-resume:deploy-test` 等镜像不含修复。
2. ATS 数字：登录后打开任意中文简历 → 右栏 ATS检查 → 快速面板应为「N 项检查中，M 项已通过」且 M≤N。修复前截图对比在 `docs/nightly-audit-evidence/screenshots/register-zod-english-errors.png`（另一缺陷）与 `ats-fixed-numbers.png`。
3. 回归：`corepack pnpm --filter web typecheck`；`cd apps/web && corepack pnpm exec vitest run src/libs/locale-catalogs.test.ts "src/routes/builder/\$resumeId/-sidebar/right/sections/ats-check.test.tsx"`（18 个）。
4. 缺陷 #5（未修，请复核复现）：登录 → 编辑器改一个字段 → `docker exec nightly_audit-postgres-1 psql -U nightly -d weekly_resume -c "DELETE FROM session"` → 再改一个字段 → 页面跳登录页 → 重登后第一次的修改丢失。

## 3. 结论来源分级

**真实浏览器操作（可信度高，可点对点复核）**：注册/登录/退出/验证邮件/密码重置全流程；中文空白简历创建、11 类章节填写、刷新持久化（15 项断言）；模板三次切换保持；PDF/DOCX/MD/JSON 导出与内容断言（导出文件在 `docs/nightly-audit-evidence/exports/`，用 pypdf/unzip 可独立验证）；JSON 回导；公开分享/隐藏章节/匿名/跨账号隔离；双标签页实时同步；移动端 390px；Agent 批准/拒绝/恢复（mock LLM）；ATS 数字修复与注册修复的最终复核。

**单元测试/静态分析（可信度中）**：po 修复的回归（18 个测试）；typecheck；深度检查 CJK 问题的根因推断（Node 端同库提取成功 642 字符 vs 浏览器端失败，推断为浏览器提取路径问题——**未在浏览器中逐层定位到行**）；"服务端 better-auth 无 name 最小长度"（代码阅读，非运行时验证——但王芳注册成功是运行时证据）。

**未验证/不能下结论**（详见下节）：真实 LLM 行为、大陆无代理下的字体加载、生产对象存储、全量 web 测试套件。

## 4. 哪些改动不是本会话做的

- **并行会话（另一个 AI 会话，约 100 个未提交文件）**：中文简历编辑器全部字段/章节实现（`packages/schema/src/resume/cn-fields.ts`、`blank-zh-cn.ts`、`apps/web/src/dialogs/resume/sections/*`、左栏 sections、`packages/pdf`、`packages/docx`、`packages/import` 等），清单见 `docs/zh-cn-resume-editor-implementation-report.md` 第 1 节与 `docs/zh-cn-resume-editor-review-followup.md` 第 5 节。这些代码是本次镜像构建与验收的对象，但**作者不是本会话**；验收中发现的「性别不公开正确隐藏」「实习/校园章节进预览」「长字段无溢出」等通过项，功劳属于那批代码。
- 已提交链（dc0c9fb…a57d9d0，Batch 1–3 i18n 修复）是更早会话的工作。
- 本会话新增/修改的文件全集见审计报告第 5 节，共 2 个功能文件 + 55 个 po + 新增文件。

## 5. 仍不能下结论的地方

1. **真实模型下的 Agent**：批准/拒绝/恢复流程是用确定性 mock 验证的（mock 总能产出契约合法的补丁）。真实模型会有失败重试、流式中断、内容幻觉等路径，未测。
2. **大陆网络下的字体**：本机当前能访问 fonts.gstatic.com（200），所以"预览/导出在大陆失败"仍是**推断**（基于 3755 处 gstatic 引用的代码事实 + 既定 P0 结论），本次未在断网/无代理环境实测。上线前应在一台无代理机器复测一次。
3. **深度检查 CJK 问题的精确根因**：确定浏览器端提取丢 CJK（证据充分），但 cMap 缺失 vs worker 争用两个假说未分辨；修复方案需要一次专门的浏览器端调试。
4. **重复导入、超限文件**：只做了静态确认（导入无去重、MAX_UPLOAD_BYTES 存在），未跑完整 UI 用例。
5. **全量测试套件**：本次只跑了定向 18 个 + typecheck。按 review-followup 的经验，全量 web 套件要在无并发负载时单独跑。
6. **旧版简历数据兼容**：验收库里没有真实旧数据（v3/upstream 导入、繁体 locale 旧简历）。导入解析的 145 个包级测试通过是唯一依据。
7. **申请人/求职信/ATS 独立页** 等次要页面只做了可达性确认，未做深度操作。

## 6. 环境遗留（审查后可清理）

- 运行中的栈：`docker compose -f compose.nightly.yml --env-file .env.nightly down -v`（会删数据卷）。
- `nightly_mock` 容器随栈删除即可；宿主机 9931 端口可能残留一个沙箱期启动的 node 进程（`netstat -ano | grep 9931`）。
- 测试账号/简历都在隔离卷里，`down -v` 一并清除。
