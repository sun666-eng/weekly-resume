# 残留英文全量清单（2026-09-25 扫描）

> 用途：逐条标注是否翻译为中文。标注方法：在每条末尾的 `标注:` 处写「改」/「不改」/改为你想要的文案，或直接回复编号清单。
> 原则：专有名词（PDF、ATS、JD、AI、Agent、OAuth、SMTP、Passkey、MCP、API Key、GitHub、LinkedIn、Word、JSON、DOCX、URL 等）默认保留英文。
>
> **英文漏出的根本原因**（决定修复方式，不只是翻译）：
> 1. Lingui 只扫描 `apps/web/src`，packages/ 里的字符串永远不会进翻译目录；
> 2. `apps/web/src/libs/error-message.ts` 的 `getReadableErrorMessage` 会把服务端英文 message **原样透传**到 toast（全站 60 处调用）；
> 3. better-auth 约 50 个错误码在前端没有中文映射；
> 4. 认证邮件模板是硬编码英文纯文本。
>
> 标注约定：【译】=建议翻译（已给译文初稿）【留】=建议保留英文 【待】=请你决定。

---

## 第一组：结构性机制（4 个决策，影响面最大）

### D1. 服务端报错直通机制 【译】标注:
策略：不再逐条翻译服务端 message，而是前端统一改为「错误码 → 中文映射 + 中文兜底」，
未知错误一律显示中文兜底。受影响的英文原文（toast 直出）共 45 组，见第三组 S 系列。

### D2. 求职阶段标签 STAGES（packages/schema/src/applications/data.ts:11-18）【译】标注:
硬编码英文，被看板列头、批量菜单、状态下拉、漏斗图直接渲染——目前页面上面积最大的英文。
⚠ 修订：`STAGES.label` 还被洞察漏斗（insights.ts:29）与 CSV 导出（csv.ts:258）消费——
修复改为「显示/数据分离」：web 层 `stageDisplayLabel()` 仅用于界面渲染；schema 标签与 CSV 导出/导入英文值保持不动。详见文末修订记录第 3 点。

| # | 原文 | 建议译文 | 出现位置 |
|---|---|---|---|
| 1 | Saved | 已保存 | 看板列头/状态下拉/漏斗图 |
| 2 | Applied | 已投递 | 同上 |
| 3 | Screening | 筛选中 | 同上 |
| 4 | Interview | 面试中 | 同上 |
| 5 | Offer | 录用（或保留 Offer，中文招聘口语常用） | 同上 |
| 6 | Rejected | 已拒绝 | 同上 |

### D3. 认证邮件全部英文（packages/auth/src/config.ts:201-235）【译】标注:
| # | 邮件 | 现状 | 建议 |
|---|---|---|---|
| 7 | 重置密码邮件 | 纯文本英文：主题 `Weekly Resume password reset`，正文 `Open this link to reset your Weekly Resume password: {url}` | 主题「Weekly Resume 密码重置」，正文「请打开以下链接重置你的 Weekly Resume 密码：{url}」 |
| 8 | 验证邮箱邮件 | 纯文本英文：主题 `Weekly Resume email verification`，正文 `Open this link to verify your Weekly Resume email: {url}` | 主题「Weekly Resume 邮箱验证」，正文「请打开以下链接验证你的 Weekly Resume 邮箱：{url}」 |
| 9 | 换邮箱确认邮件 | React 模板全英文（Verify your new email / Confirm Email Change / Verify New Email 按钮…） | 模板翻译为中文 |

### D4. better-auth 未映射错误码（约 50 个，登录/注册/2FA/passkey 页面会漏英文）【译】标注:
策略建议：高频错误码补中文映射，其余在 `getAuthErrorMessage` 统一中文兜底，保证任何未知码都不漏英文。
高频优先映射：
| # | 错误码 | 英文原文 | 建议译文 |
|---|---|---|---|
| 10 | USERNAME_IS_ALREADY_TAKEN | Username is already taken | 用户名已被占用 |
| 11 | INVALID_USERNAME_OR_PASSWORD | Invalid username or password | 用户名或密码不正确 |
| 12 | FAILED_TO_CREATE_USER | Failed to create user | 注册失败，请重试 |
| 13 | FAILED_TO_CREATE_SESSION | Failed to create session | 登录失败，请重试 |
| 14 | CREDENTIAL_ACCOUNT_NOT_FOUND | Credential account not found | 账号不存在或未设置密码 |
| 15 | SOCIAL_ACCOUNT_ALREADY_LINKED | Social account already linked | 该第三方账号已绑定其他用户 |
| 16 | VERIFICATION_EMAIL_NOT_ENABLED | Verification email isn't enabled | 本实例未启用邮箱验证 |
| 17 | TOTP_NOT_ENABLED / TWO_FACTOR_NOT_ENABLED 等 8 条 2FA 状态码 | OTP not enabled 等 | 两步验证未启用/未配置 |
| 18 | PASSKEY 系列 15 条 | You are not allowed to register this passkey 等 | 通行密钥注册/验证失败统一中文 |
| 19 | VALIDATION_ERROR / MISSING_FIELD | Validation Error 等 | 请求参数不正确 |

---

## 第二组：前端硬编码英文（apps/web/src，18 条 + 1 条 ATS 报告）

| # | 原文 | 位置 | 场景 | 建议译文 | 标注 |
|---|---|---|---|---|---|
| 20 | Unable to display PDF preview. | features/resume/public/pdf-viewer.tsx:241 | 公开简历 PDF 预览失败 | 无法显示 PDF 预览。 | |
| 21 | A resume with this slug already exists. | libs/error-message.ts:50 | 简历操作失败 toast | 已存在相同链接标识的简历。 | |
| 22 | This resume is locked. Unlock it first to make changes. | libs/error-message.ts:51 | 同上 | 该简历已锁定，请先解锁再修改。 | |
| 23 | Something went wrong. Please try again. | libs/error-message.ts:53 | 同上（兜底） | 出了点问题，请重试。 | |
| 24 | Cancel（兜底值） | hooks/use-confirm.tsx:87 | 所有确认弹窗取消按钮 | 取消 | |
| 25 | Confirm（兜底值） | hooks/use-confirm.tsx:88 | 所有确认弹窗确认按钮 | 确认 | |
| 26 | File must be a PDF | dialogs/resume/import.tsx:46 | 导入文件校验 | 文件必须是 PDF | |
| 27 | File must be a Microsoft Word document | dialogs/resume/import.tsx:57 | 导入文件校验 | 文件必须是 Word 文档 | |
| 28 | File must be a JSON file | dialogs/resume/import.tsx:64,70,76 | 导入文件校验（3 处同文） | 文件必须是 JSON 文件 | |
| 29 | New password cannot be the same as the current password. | dialogs/auth/change-password.tsx:31 | 改密码校验 | 新密码不能与当前密码相同。 | |
| 30 | Username can only contain lowercase letters, numbers, dots, hyphens and underscores. | features/auth/pages/register.tsx:28 | 注册校验 | 用户名只能包含小写字母、数字、点、连字符和下划线。 | |
| 31 | Star | components/input/github-stars-button.tsx:25 | GitHub 按钮文字 | 保留 Star（GitHub 术语）或「点个 Star」 | |
| 32 | Needs follow-up | features/applications/components/application-card.tsx:61 | 投递卡片 hover 提示 | 需要跟进 | |
| 33 | Total applications / in this view | features/applications/insights.ts:48 | 洞察统计卡 | 投递总数 / 当前视图内 | |
| 34 | Applied / past saved | insights.ts:49 | 同上 | 已投递 / 来自已保存 | |
| 35 | Response rate / reached screening | insights.ts:50 | 同上 | 回复率 / 进入筛选 | |
| 36 | Interviews / interview or beyond | insights.ts:51 | 同上 | 面试数 / 面试及以后阶段 | |
| 37 | Offers / so far / `${rejected} rejected` | insights.ts:52 | 同上 | 录用 / 至今 / 已拒绝 N 家 | |
| 38 | Page {evidence.page} | features/ats-checker/report/finding-row.tsx:47 | ATS 报告证据条 | 第 {page} 页 | |

---

## 第三组：服务端错误消息（经 D1 机制直出 toast，S 系列）

> 修复方式随 D1：前端错误码映射 + 中文兜底。以下为受影响原文全集与译文初稿。
> 标注只需对 D1 表态（逐条翻译 or 统一映射），下面译文供映射表使用。

### Agent 附件/对话（packages/api/src/features/agent/service.ts）
| # | 原文 | 建议译文 |
|---|---|---|
| S1 | Attachment IDs must be an array. | 附件 ID 列表格式不正确。 |
| S2 | Too many attachments for one message. | 单条消息附件数量超限。 |
| S3 | Attachment IDs must be non-empty strings. | 附件 ID 不能为空。 |
| S4 | Attachment IDs must be unique. | 附件 ID 不能重复。 |
| S5 | One or more attachments are unavailable or already linked to a message.（:328,:337） | 部分附件不可用，或已关联到其他消息。 |
| S6 | One or more attachments were already linked to another message.（:369） | 部分附件已关联到其他消息。 |
| S7 | Attachment ${filename} could not be read.（:379） | 附件 ${filename} 无法读取。 |
| S8 | The answered assistant message was not found.（:489） | 找不到待回答的 AI 消息。 |
| S9 | This approval was already answered with a different decision.（:501） | 该确认已用不同决定回复过。 |
| S10 | This response was already handled.（:507） | 该回复已处理过。 |
| S11 | No matching unanswered user question was found.（:509） | 找不到对应的未回答提问。 |
| S12 | Review settings cannot change while a run is active.（:1063） | 任务进行中无法修改审阅设置。 |
| S13 | This thread is archived.（:1136） | 该对话已归档。 |
| S14 | This thread already has an active run.（:1140,:1182） | 该对话已有正在进行的任务。 |
| S15 | This thread is read-only.（:1151） | 该对话为只读。 |
| S16 | Agent messages must be user messages or tool results.（:1154） | （内部校验）消息类型不合法。 |
| S17 | Invalid UI message parts.（:1160） | （内部校验）消息内容不合法。 |
| S18 | Tool result messages cannot include attachments.（:1203） | （内部校验）工具结果不能包含附件。 |
| S19 | Only resume patch actions can be rolled back.（:1491） | 只有简历补丁操作可以撤销。 |
| S20 | The edited resume no longer exists.（:1495） | 原简历已不存在。 |
| S21 | This legacy patch does not have a rollback snapshot.（:1497） | 该旧版补丁没有撤销快照。 |
| S22 | This patch is no longer applied.（:1516） | 该补丁当前未处于应用状态。 |
| S23 | New thread（:952 默认线程标题） | ⚠ 分类修正：前端目录已有翻译（zh-CN.po:3736「新建会话」，命令面板/侧栏在用）；漏出的是服务端写入 DB 的英文标题——Batch 2 在展示层做哨兵映射，不改存储值 |
| S24 | This edit was applied, but the run was interrupted…（runs.ts:116 内嵌提示） | 该修改已应用，但任务在记录最新简历前被中断，请先重新读取简历再继续编辑。 |
| S25 | The resume changed after this action was applied.（service.ts:63） | 简历已更新，此操作结果已被覆盖。 |
| S26 | This patch was rolled back when the resume was restored to an earlier state.（:64） | 简历恢复到较早版本时，该补丁已一并回滚。 |
| S27 | User answer failed.（messages-merge.ts:93） | 回答提交失败。 |

### AI 功能（packages/api/src/features/ai/、applications/ai.ts）
| # | 原文 | 建议译文 |
|---|---|---|
| S28 | Could not reach the AI provider. | 无法连接 AI 服务商。 |
| S29 | Invalid AI provider configuration. | AI 服务商配置无效。 |
| S30 | AI providers are unavailable because ENCRYPTION_SECRET is not configured. | 未配置 ENCRYPTION_SECRET，AI 功能不可用。 |
| S31 | Invalid resume data structure | 简历数据结构无效 |
| S32 | Invalid ATS review structure | ATS 审查结果结构无效 |
| S33 | No tested AI provider is available. | 没有可用的已验证 AI 服务商。 |
| S34 | The AI response could not be parsed. | AI 返回内容无法解析。 |
| S35 | No AI provider is configured. Add one in Settings → Integrations to use AI features. | 尚未配置 AI 服务商。请在「设置 → 集成」中添加后使用 AI 功能。 |
| S36 | Link a resume to this application first. | 请先为该投递关联简历。 |
| S37 | Paste the job description into this application first. | 请先为该投递填写岗位描述。 |

### 求职信 / 简历 / 导出
| # | 原文 | 建议译文 |
|---|---|---|
| S38 | This cover letter changed elsewhere. Reload it before saving again.（cover-letters/service.ts:97） | 该求职信已在别处被修改，请刷新后再保存。 |
| S39 | This cover letter changed elsewhere. Reload it before deleting.（:171） | 该求职信已在别处被修改，请刷新后再删除。 |
| S40 | The patch operations are invalid or produced an invalid resume.（resume/crud.ts:177） | 补丁操作无效，或生成结果不合法。 |
| S41 | The resume changed after this patch was generated.（crud.ts:181、service.ts:27） | 简历已更新，此补丁已过期。 |
| S42 | Failed to apply patch operations（service.ts:157） | 补丁应用失败 |
| S43 | Failed to create resume（service.ts:608） | 创建简历失败 |
| S44 | Failed to update resume（service.ts:680） | 保存简历失败 |
| S45 | No cover letter found for this resume（export.ts:28） | 该简历没有关联的求职信 |
| S46 | Failed to generate resume PDF（export.ts:49、resume-pdf.ts:55） | 生成简历 PDF 失败 |
| S47 | Resume data does not match the canonical schema.（resume-data-validation.ts:25） | 简历数据不符合标准结构。 |
| S48 | AI agent workspace is unavailable because REDIS_URL or ENCRYPTION_SECRET is not configured.（agent/routing.ts:10） | 未配置 REDIS_URL 或 ENCRYPTION_SECRET，AI Agent 工作区不可用。 |
| S49 | JSON Patch 8 条英文（packages/resume/src/patch.ts:49-62，如 `Cannot perform an 'add' operation at the desired path.`） | 统一为「补丁操作无法执行」+ 保留细节到日志，或逐条翻译 |

### 投递追踪 / 校验
| # | 原文 | 建议译文 |
|---|---|---|
| S50 | Date must use YYYY-MM-DD format.（applications/service.ts:22,:37、dto:15） | 日期格式应为 YYYY-MM-DD。 |
| S51 | Application timeline is missing its current stage entry.（:65） | 投递时间线缺少当前阶段记录。 |
| S52 | Current stage date cannot be older than another stage entry.（:70） | 当前阶段日期不能早于其他阶段记录。 |
| S53 | Application documents must be PDF files.（:332、dto:20） | 投递附件必须是 PDF 文件。 |
| S54 | Stage timeline text is derived and cannot be edited.（:446） | 阶段时间线为自动生成，不能编辑。 |
| S55 | The current stage timeline entry cannot be deleted.（:492） | 当前阶段记录不能删除。 |
| S56 | File size must be less than 10MB（storage/router.ts:9） | 文件大小不能超过 10MB |
| S57 | At least one style slot must be configured.（schema/resume/data.ts:601） | 至少需要配置一个样式槽位。 |
| S58 | zod 默认消息（`Invalid input: expected string…`，出现在所有直通界面） | 不逐条翻；BAD_REQUEST issues 统一映射为「内容格式不正确，请检查后重试」 |
| S59 | The file could not be read as a valid resume.（packages/import/src/error.ts:10） | 无法将该文件解析为有效简历。 |
| S60 | Problem fields: …（and N more fields）（error.ts:24） | 问题字段：…（以及另外 N 个字段） |

---

## 第四组：packages/ui 与服务端 HTTP / SEO

| # | 原文 | 位置 | 场景 | 建议 | 标注 |
|---|---|---|---|---|---|
| 39 | Submit（fallback） | packages/ui/src/components/questionnaire.tsx:157 | 问卷提交按钮 | 提交 | |
| 40 | Toggle Sidebar | packages/ui/src/components/sidebar.tsx:272,275 | 悬浮提示 | 收起/展开侧栏 | |
| 41 | Sidebar / Displays the mobile sidebar. | sidebar.tsx:188-189 | 读屏文本 | 侧栏 | |
| 42 | Loading（aria-label） | packages/ui/src/components/spinner.tsx:8 | 读屏 | 加载中 | |
| 43 | Close toast（aria-label） | packages/ui/src/components/toast.tsx:103 | 读屏 | 关闭提示 | |
| 44 | Download link expired | apps/server/src/http/resume-pdf.ts:13 | PDF 下载链接过期页 | 下载链接已过期 | |
| 45 | Failed to generate public resume PDF / Public resume PDF unavailable | apps/server/src/http/public-resume-pdf.ts:39 | 公开简历导出失败页 | 公开简历 PDF 生成失败 / 暂不可用 | |
| 46 | 首页 SEO：`{APP_NAME} — A free and open-source resume builder` + 英文描述 | apps/server/src/static/web.ts:71-74 | 浏览器标签页/搜索结果/分享卡 | 翻译为中文（面向中文搜索引擎） | |
| 47 | SEO FAQ 6 组问答（Is Weekly Resume really free? 等） | web.ts:76-101 | 搜索结果富摘要 | 翻译为中文 | |
| 48 | ATS 页 SEO：`ATS Checker - Weekly Resume` 等 | web.ts:164-167 | 搜索结果 | 翻译为中文 | |
| 49 | Bad Request / Forbidden / Not Found（uploads.ts:8-16、web.ts:282,294） | 图片 404 / 禁止访问 | 【留】HTTP 语义文本（或待） | |
| 50 | `Resume`（公开简历 PDF 文件名兜底） | packages/api/src/features/resume/public-pdf.ts:79 | 下载文件名 | 简历 | |

---

## 第五组：生成物与文件名（灰色地带，请判断）

| # | 项 | 位置 | 说明 | 标注 |
|---|---|---|---|---|
| 51 | 导出文件名后缀 `... Cover Letter` | apps/web/src/features/resume/export/use-resume-export.ts:42 | 求职信导出文件名，可改「求职信」 | |
| 52 | Markdown 导出固定前缀 `Grade: ` | packages/resume/src/markdown.ts:140 | 成绩条目 | |
| 53 | AI 回复/ATS AI 审查的语言 | packages/ai/src/prompts/chat-system.md、ats-review-system.md | 提示词未指定语言，中文用户可能收到英文 AI 回复。建议加「始终使用用户界面语言（当前 zh-CN）回复」 | |
| 54 | DOCX/PDF/Markdown 节标题 | 已确认走 locale catalog，无硬编码 | 无需修改（简历 locale=英文时输出英文属预期） | |

---

## 第六组：翻译目录本身的问题（zh-CN.po / 错误文案）

| # | 项 | 位置 | 说明 | 标注 |
|---|---|---|---|---|
| 55 | `msgstr "ATS检查”"` 多了一个全角引号 | apps/web/locales/zh-CN.po:819 | 应为「ATS检查」，这是目录里唯一的实际缺陷 | |
| 56 | 错误提示写死「密码长度不能少于 6 位」，服务端要求 8 位 | apps/web/src/features/auth/error-message.ts:13 | 与服务端 `minPasswordLength: 8` 矛盾（此前审计已列为修复项） | |
| 57 | 「你/您」混用 | zh-CN.po 全目录（如 :768 用「您」、:777 用「你」） | 建议统一（产品多数处用「你」） | |
| 58 | zh-TW 20 条空翻译 | apps/web/locales/zh-TW.po（:259 等 20 处） | 空翻会回退显示英文。若面向繁体用户需补齐；若不主推可忽略 | |

---

## 第七组：专有名词保留清单（默认不动，列出供复核）【留】

- 下载/导入按钮中的 PDF、DOCX、Markdown、JSON（download-dialog.tsx、import.tsx）
- 模板名（宝可梦名 Azurill/Chikorita…，zh-CN 下已映射中文显示名）
- 模板标签映射键（Two-column、ATS friendly…，仅作映射键）
- CSV 导入表头匹配别名（job title、contact email…，用于匹配用户上传文件，必须保留英文）
- 页面 title 中的品牌名 Weekly Resume
- auth 错误映射键（"User already exists." 等，是匹配键不是显示文本）
- MCP 全部（工具描述、prompt、服务器卡——面向开发者/AI 客户端）
- AI 系统提示词（packages/ai/src/prompts/*.md、agent 工具描述）
- AI 供应商显示名（OpenAI、Anthropic、Google Gemini…）
- OpenAPI 元数据（Swagger 用）
- 日志/健康检查文本（Database、Storage、Unknown error…）
- 错误码本身（RESUME_LOCKED、NEED_PASSWORD…）
- 示例邮箱 john.doe@example.com、示例人名 Alex Morgan、模型名 gpt-4.1 等 placeholder
- aria-label 中的 Download PDF 等格式名（读屏，可保留，也可与 #39-43 一起译）

---

## 修复实施方式（2026-09-25 按评审五点修订）

### 修订记录

1. **错误协议改为「业务码」方案**（原 D1 不可行处已修正）：多条服务端错误共用 `BAD_REQUEST`/`CONFLICT` 等 oRPC 标准码，仅靠码无法对应具体文案。方案：给需要精确提示的错误新增**稳定业务码**（沿用仓库既有模式，如 `RESUME_SLUG_ALREADY_EXISTS`，见 `packages/api/src/features/resume/service.ts`），前端按业务码映射文案；未加码的错误按界面语言显示**该场景的通用提示**（msg 宏，随语言切换），原始 message 保留在 `console.error` 供排查。**zod 校验失败不笼统化**：issues 按字段名/校验规则映射常见类目（必填/长度/格式），未命中的类目保留原文并记录日志，不做一刀切的「内容格式不正确」。
2. **不写中文全局兜底**：所有新文案走 `t`/`msg` 宏，**源文案保持英文**，中文只写入 `zh-CN.po`，en-US 界面显示英文。执行中发现的反向案例：`apps/web/src/features/auth/error-message.ts` 源码硬编码中文（英文界面用户会看到中文错误提示），Batch 1 一并改为 msg 宏架构。
3. **STAGES 显示/数据分离**（原 D2 范围修正）：`STAGES.label` 还被洞察漏斗（`insights.ts:29`）和 CSV 导出（`csv.ts:258`）消费，全局替换会破坏 CSV 导入导出往返与数据一致性。方案：新增 web 层 `stageDisplayLabel()`（msg 宏映射），**仅**用于看板列头、状态菜单、表单下拉、漏斗图等界面渲染；`packages/schema` 的标签与 CSV 导出/导入的英文数据值保持不动。同类拆分：S23「New thread」前端目录已有翻译（zh-CN.po:3736「新建会话」），漏出的是**服务端写入数据库的英文线程标题**——在展示层做哨兵映射，不改服务端存储值。
4. **邮件/SEO/AI 输出语言 = 产品决策批次**（原 D3/D4 范围修正）：三封认证邮件与 SEO 文案若直接改中文，会使其他语言用户收到中文邮件、单一 URL 下的 SEO 语言无依据。产品决策（按 README 定位「面向中文求职者」）：**邮件与 SEO 固定简体中文，写入本文档作为产品决策；UI 文案保持多语言**。后续如需按用户 locale 发送邮件，再按 locale 分化模板。
5. **清单分类误差已修正**：S23 拆为「前端目录翻译（已完成）」与「服务端 DB 标题哨兵映射（Batch 2）」两处；packages/ui 的 5 条（#39-43）因需扩展 Lingui 扫描范围（`lingui.config.ts` include 目前仅 `apps/web/src`，upstream 同），从 Batch 1 挪至 Batch 2 单独验证。

### 批次划分

| 批次 | 内容 | 涉及 |
|---|---|---|
| Batch 1（当前） | apps/web 前端可见文案 t/msg 宏化（英文源+中文入 po）；密码 6→8（register/reset/change-password 校验与错误文案）；zh-CN.po:819 错字 | apps/web/src、zh-CN.po |
| Batch 2 | 错误协议：服务端业务码（S 系列）+ 前端业务码映射 + 通用提示随语言；packages/ui 接入 lingui（扩展 include）；「New thread」DB 标题哨兵 | packages/api、apps/web |
| Batch 3 | STAGES 显示映射 `stageDisplayLabel()`（仅界面渲染处） | apps/web/src/features/applications |
| Batch 4（产品决策） | 认证邮件中文（3 封）、SEO 中文（web.ts）、AI 输出语言锁定（提示词） | packages/auth、apps/server、packages/ai |

### 每批验证清单

1. `pnpm --filter web lingui:extract`（即 `lingui extract --clean --overwrite`）后核对 `git diff apps/web/locales/`：各语言目录**只新增本批 msgid**，无既有条目重排/丢失。
2. zh-CN 与 en-US 双语走查本批涉及的界面与错误提示（zh 显示中文、en 显示英文）。
3. `pnpm --filter web typecheck` + 受影响模块的 vitest。
4. zh-CN.po 新条目全部填写中文译文，不留空 msgstr。
