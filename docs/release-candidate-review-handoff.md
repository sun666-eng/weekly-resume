# 发布候选审查交接（2026-09-26）

给下一位审查者：本文件说明最终候选版本是什么、哪些 diff 风险最高、怎么独立复现、门槛逐条状态，以及哪些地方仍然不能下结论。

## 1. 候选版本标识

- 仓库：`D:\MyProjects\Weekly  Resume\weekly-resume-release`，分支 `main`，HEAD `a57d9d0a98446b5b484cff216db9b87f27b24ac0`（未提交/未推送/未部署）。
- 工作区含三方改动：并行会话的中文编辑器实现（约 100 文件）、复核者文件（`docs/nightly-independent-review-2026-09-26.md`、`docs/nightly-review-evidence/`、`tooling/review-nightly-ats.mts`）、本会话修复（见 `docs/release-blockers-fix-report.md` 第 0 节）。
- 最终镜像：`nightly_audit-app` ID `32a5bfd0ae24`（2026-09-26 04:35 +0800），由该工作区源码构建（含全部未提交修复与 71.6MB 同源字体）。运行栈 `compose.nightly.yml`（端口 3100 / Mailpit 8025 / 独立数据卷）。
- 镜像内已验证：迁移自动执行、`/api/health` 全 healthy、注册/登录/编辑/导出/并发/恢复全流程在本镜像上复测通过。
- 快照方式：因不提交，源码快照以工作区 + 本报告 diff 清单为准；如需精确快照请审查者自行 `git add -A && git stash create` 或打补丁归档（本会话未执行提交类操作）。

## 2. 必审高风险 diff（按风险排序）

1. **`apps/web/src/features/resume/builder/draft.ts` + 新文件 `draft-recovery.ts`**：自动保存主路径被改动——新增 `expectedUpdatedAt` 乐观锁、409 冲突三方合并重试（上限 2 次）、失败时 localStorage stash、恢复动作。审查点：`mergeResumeVersions` 的合并单元粒度（basics 下钻一层按字段、sections 按章节 id、customSections 按 id）；stash 键含 userId+resumeId 且读写全 try/catch；`baseRetryCount` 防死循环。测试 26+6 全绿，另经两轮真实双标签实验验证（修复前覆盖实锤、修复后两侧修改均存活）。
2. **`packages/api/src/dto/resume.ts` + `crud.ts` + `service.ts`**：整文档 PUT 新增可选 `expectedUpdatedAt`，不匹配抛 409。不传时行为与旧版完全一致；`resumeVersionConflict` 复用 PATCH 路径的既有工厂。
3. **`packages/resume/src/ats/section-aliases.ts`**：中文别名直接进入 `SECTION_TITLE_ALIASES`（builder lint 的 `titleRules` 有 `locale.startsWith("en")` 门控，英文行为不变），PDF 标题判定是整行精确匹配——请抽查正文含"工作经历"的句子不会被当成标题。
4. **`packages/resume/src/ats-pdf/analyze/{text-quality,dates}.ts` / `extract.ts` / `rules/sections.ts`**：语言判定删除 `LATIN.test` 短路；日期端点新增年.月/年月格式 + `startsInsideNumber` 中段过滤；CJK 逐字计词；非英语且有可识别标题时章节检查照常运行。英文基线有测试锁定。
5. **`packages/fonts/src/index.ts` + `local-fonts.json` + `apps/web/public/fonts/**`**：同源解析优先，71.6MB 进入镜像；`getWebFontSource` 对内置字族的 italic 回退保持在本地解析内。
6. **`apps/web/src/routes/builder/$resumeId/route.tsx`**：恢复提示以整页替换编辑器（防误操作继续编辑冲突版本），两按钮均立即消费 stash。
7. **po 文件（55 个）**：仅 zh-CN/zh-TW 有语义修改；其余是 `lingui extract --clean --overwrite` 对当前工作区（含并行会话源码）的目录刷新——是否整批收下由审查者定夺。

## 3. 可重复复现入口

```bash
docker compose -f compose.nightly.yml --env-file .env.nightly up -d --build   # 隔离栈（3100/8025）
corepack pnpm --filter @reactive-resume/tooling exec tsx review-nightly-ats.mts      # 独立复核脚本（Node 端 ATS）
corepack pnpm --filter @reactive-resume/tooling exec tsx ats-fix-verify.mts          # 修复后全检查状态
corepack pnpm --filter @reactive-resume/tooling exec tsx release-acceptance-checks.mts  # ATS/日期/字体断言
# 定向测试
cd packages/resume && corepack pnpm exec vitest run            # 1390
cd apps/web && corepack pnpm exec vitest run src/features/resume/builder src/features/auth/pages src/libs/locale-catalogs.test.ts
```

浏览器步骤（会话失效恢复、双标签并发、模板冒烟、390px）的操作序列逐步写在 `release-blockers-fix-report.md` 第 1/2/4 节，可用任意两个浏览器 profile 重放；测试账号 `nightly-a@test.local`（隔离库，密码见隔离 `.env.nightly` 会话记录，不入库）。

## 4. 发布门槛逐条状态

| 门槛 | 状态 | 依据 |
| --- | --- | --- |
| 会话失效不丢内容，可恢复/放弃 | 通过（本地隔离环境） | 恢复/放弃双路径浏览器验证 + stash 键隔离单测 |
| 冲突不静默覆盖 | 通过（本地隔离环境） | 双标签真实并发：修复前覆盖实锤 → 修复后两处修改均存活 |
| 跨账号不泄露草稿/简历 | 通过 | 存储键校验单测 + B 访问 A 简历被 owner 过滤（上一轮验证） |
| Google 字体域名不可达时默认/中文路径可用 | 通过（构造证明） | 冷加载+导出 0 个 Google 域请求断言；未做真实 DNS 阻断 |
| 中文简历 ATS 不误报 | 通过 | Node 端 99 分无 cap；浏览器深度检查 99 分；正反样例测试 10 项 |
| 英文 ATS 基线保留 | 通过 | 英文 fixture isEnglish=true 断言 + 既有英文规则测试全绿 |
| 四处小修复直接回归 | 通过 | 不等值计数/引号/注册边界/成绩标签，18+5+6 测试 |
| 全部 15 模板基础冒烟 | 通过 | 每款切换后内容可见、无错误页（单页样例；多页矩阵未做） |
| 移动端 390px | 通过 | 编辑/预览/设计可用、无错误、0 Google 请求 |
| 生产镜像启动/迁移/健康 | 通过 | 32a5bfd0ae24 健康检查 + 启动日志无错误 |
| 真实 LLM Agent | 未验证 | 仅本地 mock（正常/审批/撤销/无效补丁已验）；重复 tool-call ID、流中断、超时未构造 |
| 全量 web 测试套件（无负载） | 未验证 | 本轮仅定向套件；历史上并发负载会假超时 |
| 真实 SMTP / S3 / DNS 阻断环境 | 未验证 | Mailpit / 本地存储 / 构造性阻断替代 |
| 生产部署后验证 | 未验证 | 按约定未触碰线上 |

## 5. 结论与依据

**建议：可以进入发布准备（推送/部署仍需人工拍板），但不要在"未验证"四项未补齐前对外宣告全功能可用。**

依据：三项上线阻塞在隔离生产镜像上以"复现 → 最小修复 → 直接回归 → 浏览器端到端"闭环修掉，修复均保留旧行为兼容（optional 字段、解析优先级、localStorage 独立键）；无内容丢失路径、无跨账号泄露路径、默认预览/导出与中文 ATS 误导已消除。剩余未验证项集中在真实第三方服务与极端异常路径，其中任何一项转为失败都不影响"本地候选通过"的结论本身，但会影响宣称范围。

## 6. 已知限制（发布文案必须遵守）

- 关键词匹配对英文职位描述支持最好（UI 已提示）；**不存在岗位检索/中国岗位数据库**，`knowledge/china-job-rules` 未接入运行时。
- 并发编辑的"同合并单元双侧同时修改"为本地优先，非逐字符合并；不要宣传多人实时协同。
- PDF 无障碍标签（UNTAGGED_PDF）与样例无 bullet 的告警是真实发现，不会被隐藏。
- 本地字体集覆盖默认与中文路径；其他 500+ 字族离线渲染会明确报错。
- "在已列范围和条件下未发现"不等于"所有场景无问题"。
