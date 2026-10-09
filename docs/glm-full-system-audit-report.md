# Weekly Resume 全量系统测试与审计报告（2026-09-27）

- 审计对象：`D:\MyProjects\Weekly  Resume\weekly-resume-release`，分支 `main`
- HEAD：`a57d9d0a98446b5b484cff216db9b87f27b24ac0`（领先 origin/main 9 个提交、落后 0）
- 工作区：审计开始时 314 个未提交变更（含并行会话的中文编辑器实现、i18n 批次、字体本地化、照片 URL 修复 WIP）；审计结束时 321 个（增量为本审计产出的 3 个文档/证据路径与并行会话的持续改动）
- 隔离测试环境：`compose.nightly.yml`（项目 `nightly_audit`），应用 `http://127.0.0.1:3100`，Mailpit `http://127.0.0.1:8025`，独立 postgres/redis/数据卷
- 被测镜像：`nightly_audit-app:latest`，ID `9aebe31dbdc6`，2026-09-27 15:05 +0800 从当时工作区源码构建（含并行会话当日上午对 `picture.tsx`、`packages/pdf/src/browser.tsx`、`packages/utils/picture-url.ts` 的未提交改动）
- 健康：`/api/health` 200，database healthy，storage local healthy
- 测试账号：`fullaudit-a@test.local` / `fullaudit-b@test.local`（本轮新建，隔离卷）；主简历 id `01a0e1ca-082f-76a9-903d-6fb533426c0b`
- 本轮未修改任何源码、测试、配置、迁移、依赖、Docker 与 Git 文件；写入仅限本报告、交接清单与 `docs/glm-full-system-audit-evidence/`

## 0. 测试结论

**条件放行（不可直接上线）。**

- 全部关键链路（注册→创建→编辑→保存→照片→模板→导出→公开分享→ATS→并发→恢复）在隔离生产镜像上以真实浏览器验证通过，未发现数据丢失或跨账号泄露路径。
- 放行前必须处理：P1-1（会话失效后 builder 不再重定向登录页，行为与已验收基线相矛盾）。
- 以下事项未验证，禁止在补齐前对外宣称对应能力：真实 LLM Agent、真实 SMTP/S3、真实 DNS 阻断环境、生产部署后验证、15 模板×多页长文全矩阵、全量测试套件（本轮为定向套件）。
- 测试环境清理方式：`docker compose -f compose.nightly.yml --env-file .env.nightly down -v`（删除 nightly_* 数据卷即清除本轮全部测试数据；未删除卷中此前会话的 glmaudit/nightly-a 等账号数据）。

## 1. 实际读取的文件与建议修改的文件

**本轮已读取**（节选，全部为只读）：

- 文档：`AGENTS.md`、`CONTEXT-MAP.md`、根 `package.json`、`docs/template-reference-mapping.md`、`docs/release-blockers-fix-report.md`、`docs/release-candidate-review-handoff.md`、`docs/template-library-acceptance-report.md`、`docs/editor-localization-implementation-report.md`
- 源码：`apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/picture.tsx`、`packages/utils/src/picture-url.ts`、`packages/pdf/src/browser.tsx`（diff）、`apps/web/src/features/resume/builder/section-recovery.tsx`、`apps/web/src/features/resume/builder/section-recovery.test.tsx`、`packages/resume/src/editor-sections.ts`、`apps/web/src/components/input/rich-input.tsx`（关键段）、`apps/web/src/features/resume/builder/draft.ts`（SSE/合并/恢复段）、`apps/web/src/features/resume/builder/draft-recovery.ts`（索引）、`apps/web/src/routes/builder/$resumeId/route.tsx`、`apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/summary.tsx`、`apps/web/src/routes/builder/$resumeId/-sidebar/right/sections/notes.tsx`、`apps/web/src/libs/root-context.ts`、`apps/web/src/libs/auth/session.ts`、`apps/web/src/libs/orpc/client.ts`、`packages/api/src/features/storage/service.ts`（上传/删除实现）、`packages/api/src/features/storage/router.ts`（deleteFile 守卫）、`apps/web/src/libs/error-message.ts`（文件大小映射）、`packages/auth/src/config.ts`（会话配置）、`compose.nightly.yml`
- Git/环境：`git status/log/rev-list`、`.env.nightly`（仅确认关键变量存在，未记录值）

**建议修改的文件**（本轮未动，交修复工程师）：见第 4 节各问题条目。

## 2. 定向测试结果（未修改任何测试）

| 套件 | 结果 |
| --- | --- |
| `packages/utils`（vitest，含新增 picture-url 10 项） | 9 文件 / 225 通过 |
| `packages/import` | 10 文件 / 173 通过 |
| `packages/api`（resume 功能域：crud/service/validation/export） | 14 文件 / 144 通过 |
| `apps/web` 定向（builder + auth/pages + locale-catalogs + template catalog） | 12 文件 / 108 中 **107 通过 1 失败** |
| `packages/pdf` templates | 44 文件 / 494 通过 |
| `packages/docx` | 9 文件 / 77 通过 |
| `packages/fonts` | 1 文件 / 58 通过 |
| `packages/schema` | 10 文件 / 143 通过 |
| `packages/resume`（全量） | 35 文件 / 1407 通过 |
| 合计 | **约 2829 通过 / 1 失败** |

唯一失败：`apps/web/src/features/resume/builder/section-recovery.test.tsx > hidden section recovery > shows an unplaced hidden section without choosing a layout location`——详见 P2-1。失败与本审计无关的归因排查：非并行负载假超时，单独重跑稳定复现。

## 3. 浏览器测试矩阵（真实 IAB 浏览器，逐项含 UI + 网络响应或持久化双重证据）

| 场景 | 桌面 1280 | 390px | 刷新 | 结果 |
| --- | --- | --- | --- | --- |
| 注册（新账号即自动登录） | ✓ DB 落库 | — | — | 通过 |
| 登录/退出（UI + API 双路径） | ✓ /dashboard 守卫跳登录 | ✓ | — | 通过 |
| 创建中文简历（通用场景，四场景选择器在列） | ✓ | ✓ | — | 通过 |
| 基本信息五项编辑 + 自动保存 | ✓ DB 逐字段核对 | ✓ | ✓ 刷新后持久 | 通过 |
| 教育/技能分组（ChipInput 3+4 词）/工作/项目/个人评价 | ✓ 全部落库 | ✓ | — | 通过 |
| 照片上传全链路 | ✓ 见第 5 节 | — | ✓ | 通过（3 个边缘缺陷） |
| 15 模板逐个"预览→使用此模板" | ✓ 数据零丢失 | — | — | 通过 |
| 导出 PDF/DOCX/Markdown/JSON | ✓ 四格式内容核验 | — | — | 通过（2 个缺陷） |
| JSON 回导 | ✓ 全字段保留 | — | — | 通过 |
| 公开分享开/关 + 匿名访问 | ✓ | — | — | 通过 |
| 跨账号隔离（B 读/写 A 简历） | ✓ 404 | — | — | 通过 |
| 中文 ATS 深度检查 | ✓ 99/100 | — | — | 通过 |
| 双标签并发 + 乐观锁 + SSE | ✓ 三处修改共存 | — | — | 通过 |
| 会话失效（DB 删会话）+ 草稿 stash + 恢复 | ⚠ 见 P1-1 | — | ✓ | **部分通过** |
| 密码重置邮件（Mailpit 捕获） | ✓ | — | — | 通过（英文未本地化，已知待办） |
| Agent 未配置 AI 提供商 | ✓ 本地化降级提示 | — | — | 通过（真实 LLM 未验证） |

## 4. 问题清单（按优先级；均为"已复现"，附根因证据与建议）

### P1-1 会话失效后 builder 不再重定向登录页（行为回归 + 恢复提示不出现）

- 复现：登录 → DB `DELETE FROM session WHERE user_id=...`（三次重放）→ 浏览器整页刷新 `GET /builder/{id}`。观察：三次均停留 builder URL，编辑器完整渲染，显示"无法保存"；`/api/auth/get-session` 返回 200+`null`；浏览器内直接调用 `resume.getById` 返回 401 UNAUTHORIZED；无 cookie 的 curl 同样 401。恢复提示 UI（`route.tsx` 的 recovery 分支）未出现。
- 期望：按 `docs/release-blockers-fix-report.md` 第 1 节已验收口径，"新开标签直接访问 builder URL → 跳转 /auth/login"，即 `route.tsx:29-32` 的 `if (!context.session) throw redirect` 应生效；重新登录后应看到恢复提示（该提示在重新登录后确实出现，恢复/放弃双路径实测可用）。
- 数据第一变形节点：路由守卫判定（`context.session`）与服务端实际鉴权（401）不一致；`loadRootContext()` → `authClient.getSession()`（`apps/web/src/libs/auth/session.ts`）返回 null，但守卫未重定向。
- 根因候选（供定位）：① `getSession()` 的 null 语义在 root context 组装处被旁路；② builder `loader` 走服务端 data-only SSR 时鉴权上下文与浏览器端不一致（`orpc/client.ts` 服务端 base URL 为 `http://localhost:3000/api/rpc` 且原生 fetch 不带 cookie，loader 的 `ensureQueryData` 鉴权行为需复核）；③ 401 后 query 错误未阻断组件渲染，编辑器由 stash/缓存数据初始化。
- 建议修复位置：`apps/web/src/routes/__root.tsx`/`root-context.ts`/`builder/$resumeId/route.tsx` 守卫链 + `libs/orpc/client.ts` 服务端路径。影响范围：登录态守卫与草稿恢复入口。兼容性：需保持已登录路径零变化；回滚 = 还原守卫判定。
- 残余风险：数据未丢失（stash 生效），但用户停留在永远无法保存的死胡同且得不到登录引导；与既有验收记录矛盾，属工作区未提交改动引入的回归或暴露的既有边界。

### P2-1 工作区行为违反已提交测试契约（section-recovery）

- 复现：`pnpm --filter web exec vitest run src/features/resume/builder/section-recovery.test.tsx` 稳定失败 1 项。断言"恢复未放置的隐藏章节不改变布局"，实际 `experience` 被推入 `pages[0].main`。
- 根因：已提交测试（基线 e6e586d 未改）契约 = "Show 只翻转 hidden"；并行会话新增未跟踪文件 `packages/resume/src/editor-sections.ts` 的 `enableEditorSection`（70-77 行）会自动补布局位置，`section-recovery.tsx:96-112` 调用它。
- 两种消解均合理，需产品拍板：①"Show 应让内容可见"则保留行为并更新测试断言；②"位置显式放置"则去掉自动补位（隐藏章节用户可在布局面板手动放置）。建议修改：二选一改 `section-recovery.test.tsx` 或 `editor-sections.ts`，不要两处都动。

### P2-2 透明 PNG/WebP 上传后透明区域变黑

- 复现：页面内构造左上 100×100 红色、其余全透明的 200×200 PNG（fit=contain 直传）。服务端回读实测：存储文件为 JPEG，右上角透明区像素 `[0,0,0,255]`（不透明黑），红色区 `[254,0,0,255]`。
- 根因：`packages/api/src/features/storage/service.ts` `processImageForUpload` 对所有图片无条件 `sharp(...).jpeg({quality:80})`（85-111 行），透明通道被压平且 sharp 默认背景为黑；仅 `FLAG_DISABLE_IMAGE_PROCESSING` 可关闭。
- 建议：PNG/WebP 且含 alpha 时保留原格式（或转 WebP），或压平背景改白。影响范围：所有头像/logo 上传。回滚 = 关闭该环境开关。

### P2-3 私人备注随 JSON 导出/回导泄露

- 复现：简历 `metadata.notes` 写入唯一标记「备注机密标记NQ0927」→ JSON 导出含该标记（PDF/DOCX/Markdown 均不含，实测 0 命中）；JSON 回导后备注进入新简历。对照：公开 API `resume.getBySlug` 把 `metadata.notes` 消毒为 `""`，`password` 字段不返回——说明服务端已有消毒意识，仅导出路径遗漏。
- 冲突点：UI 文案"只有你能看到"（notes.tsx）与 JSON 导出"用于备份或导入的完整简历数据"（用户分享备份即泄露）。
- 建议：导出 JSON 前剥离或显式询问是否包含备注；或schema 层给 notes 打上"导出即确认"标记。修改位置：`packages/api/src/features/resume/export*` 或前端导出链。

### P2-4 DOCX 导出不包含照片

- 证据：导出的 DOCX zip 内无 `media/` 条目；`grep -r picture packages/docx/src/` 零引用。PDF 正常含 1 张图。Markdown 无图属预期。
- 建议：`packages/docx/builder.ts` 增加照片 ImageRun（注意相对 URL 需服务端可取或前端内嵌 base64）。若为有意裁剪需在文档/模板说明中标注差异。

### P2-5 邮件未本地化（已知待办，非新缺陷）

- Mailpit 实测：注册验证与密码重置邮件主题/正文均为英文（"Open this link to reset your Weekly Resume password"）。i18n 决策（邮件固定简体中文）在 Batch 4 中尚未实施。上线前若目标用户为中文，需完成或明确宣称范围。

### P3-1 损坏图片上传返回 500

- 复现：魔数被破坏的 20KB JPEG 直传 → `storage.uploadFile` 返回 500 INTERNAL_SERVER_ERROR（sharp 解析失败未捕获为 4xx）。UI 侧兜底正常：显示本地化 toast「上传图片失败。请重试。」（实测捕获）。
- 建议：`processImageForUpload` 捕获 sharp 异常 → 400 + 业务码（如 `STORAGE_FILE_UNREADABLE`）+ `error-message.ts` 别名。

### P3-2 上传 loading toast 残留

- 复现：连续多次上传（含 400/500 失败）后，页面堆叠 4 个「正在上传图片…」loading toast 长时间可见（`[role=dialog]` 区域实测）。`picture.tsx` 的 `toast.close(toastId)` 在部分路径未生效或 error 替换失败。
- 建议：核对 `onSettled`/`onError` 中 toast id 替换逻辑（`@reactive-resume/ui` toast 实现）。

### 观察项（不计缺陷）

- 撤销公开访问后 `GET /{username}/{slug}` 仍 200（SPA 外壳），数据由客户端 API 决定（匿名 `getBySlug` 404，安全边界在 API 层，正确）。
- 同源字体集已扩展至约 176MB（此前报告口径 71.6MB/16 文件），含根目录散置 TTF 与 22 个字族目录 + `download-manifest.json`；镜像 1.97GB。清单与实际文件一致性、许可与体积影响建议在合入前复核。
- 会话 stash 键格式已演进为 version:2（`weekly-resume:unsaved-draft:{userId}:{resumeId}:{draftId}`），与旧报告记录的三段式键不同——并行会话改动，功能实测正常。

## 5. 照片 bug 专项结论（本轮重点）

| 检查节点 | 实测结果 |
| --- | --- |
| 上传 API 返回 URL | `http://127.0.0.1:3100/api/uploads/{userId}/pictures/{ts}.jpeg`（200） |
| 数据库 `picture.url` | 与 API 返回逐字符一致 |
| 编辑器缩略图/预览 `<img>` src | 与 DB 一致；`naturalWidth=800`，complete=true |
| 磁盘文件 | `nightly_audit-app-1:/app/data/uploads/...` 存在，魔数 `ffd8`，字节数与响应一致 |
| 图片请求 | 200，`image/jpeg`，`cache-control: public, max-age=31536000, immutable` |
| 刷新/重登后 | URL 不变，图片加载成功 |
| 模板切换（15 款）后 | `picture.url` 保留，PDF 含 1 张图 |
| 导出 PDF | 1 页 1 图，正文与照片同在 |
| 公开页面（匿名） | 图片 200 可见 |
| 裁剪路径 | cover → 裁剪对话框 → 裁剪并上传：193KB 原图裁为 800×800 输出，成功 |
| 跳过裁剪路径 | contain → 直传成功 |
| 上传回调时序 | 并行会话修复生效：`persist({...form.state.values, url: normalizedUrl})` 显式写入新 URL，DB 无旧 URL 残留 |
| 删除与越权 | UI 删除调用 deleteFile；跨用户删除 403、路径穿越 403（实测） |
| 超限（10.57MB） | 直传 400 + zod `too_big`（上限 10485760）+ zh-CN 映射「文件大小不能超过 10MB」；裁剪路径自动降采样至 2.7KB 后成功 |
| 遗留缺陷 | 透明区域变黑（P2-2）、损坏文件 500（P3-1） |

**结论：照片链路在当前工作区代码上端到端一致且可用；遗留 P2-2/P3-1 两个边缘缺陷与 P2-4（DOCX 无照片）。**

## 6. 未验证项 / 环境限制

- 真实 LLM 的 Agent 会话（重复 tool-call ID、流中断、超时等异常路径）；本轮仅验证未配置提供商的降级提示。
- 真实 SMTP/S3、真实 DNS 阻断（改 hosts 超出边界）、生产部署后验证。
- 15 模板 × 3 页以上长文全矩阵（本轮为单页内容冒烟 + 15 模板切换数据完整性；多页此前轮次有抽测证据）。
- 全量 `pnpm test`（历史并行负载会造成假超时，本轮为定向套件）；Playwright e2e 套件。
- zh-TW/English 完整链路、真机 IME 输入。
- 工作区在审计期间仍被并行会话持续修改（12:22 后有 picture/pdf/utils 改动；314→321），镜像构建时点后的源码变化未纳入本轮浏览器验证。

## 7. 证据索引

- `docs/glm-full-system-audit-evidence/photo-chain-and-templates.json` — 照片链路逐节点数据、超限/透明/损坏实测、15 模板切换完整性
- `docs/glm-full-system-audit-evidence/exports-and-public.json` — 四格式导出核验、公开分享/撤销、跨账号隔离
- `docs/glm-full-system-audit-evidence/session-concurrency-recovery.json` — ATS 深度检查、双标签并发、会话失效时间线、密码重置、390px、JSON 回导、Agent 降级
- 导出样例与测试素材保存在会话临时目录（未入仓库）：export.pdf / export.docx / export.md / export.json、透明 PNG 构造脚本逻辑（见 JSON 记录）
