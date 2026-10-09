# 夜间上线前验收报告（2026-09-26）

- 仓库：`D:\MyProjects\Weekly  Resume\weekly-resume-release`，分支 `main`
- 开始 HEAD：`a57d9d0a98446b5b484cff216db9b87f27b24ac0`；结束 HEAD：同（本次未提交，按约定不提交/不推送）
- 开始工作区：111 个未提交变更（属于并行的中文编辑器/国际化会话）；结束工作区：169 个未提交变更（新增部分见"本次修改的文件"）

## 1. 结论与上线建议

**建议：暂不上线（条件性放行）。**

可以支撑上线的证据：生产镜像可从当前源码构建并启动，迁移自动执行成功，健康检查全绿；注册/登录/退出/密码重置、中文简历从零创建到四种格式导出的完整闭环、公开分享与权限隔离、双标签页并发编辑等核心流程全部在真实浏览器中通过。

上线前必须完成（按优先级）：

1. **P0 fonts.gstatic.com 依赖未修**（`packages/fonts/src/webfontlist.json` 仍 3755 处指向 gstatic）。本机当前可访问 Google CDN（host 与容器均 200），因此验收环境未复现字体失败；但大陆无代理环境预览/导出会整体失败。这是既有的 P0 结论，本次代码未变，风险未消除。
2. **P1 会话过期静默丢内容**（缺陷 #6）：编辑过程中会话失效会直接跳转登录页，未保存的修改丢失、无任何提示。需要产品决策（本地暂存 + 重登录后恢复，或至少提示）。
3. **P1 深度检查对中文简历完全失真**（缺陷 #7）：浏览器端 PDF 文本提取疑似丢失全部 CJK 字符，导致章节全部报"未找到"、得分误导。英文简历不受影响（节点检测为英文导向）。若上线宣传包含"ATS 深度检查/职位匹配"，必须先修。

## 2. 隔离验收环境（全部新建，未复用任何真实凭据）

- 新增 `compose.nightly.yml`：独立 compose 编排（项目名 `nightly_audit`），postgres:17-alpine、redis:7-alpine、Mailpit（`axllent/mailpit`，SMTP 1025 / Web UI 127.0.0.1:8025）、app（从当前源码构建，含并行会话未提交的编辑器代码）。应用端口 `127.0.0.1:3100`，与生产 3000 隔离；数据卷 `nightly_postgres_data` 等三个独立卷。
- 新增 `.env.nightly`（被 .gitignore 覆盖，不会入库）：随机生成的 AUTH_SECRET / ENCRYPTION_SECRET / POSTGRES_PASSWORD（`openssl rand`），APP_URL=`http://127.0.0.1:3100`（与访问 origin 一致，规避 INVALID_ORIGIN），SMTP 四项配齐指向 Mailpit（否则应用会退化为"只打日志"），`FLAG_ALLOW_UNSAFE_AI_BASE_URL=true` 仅用于本地 mock LLM。仓库原有 `.env`（含真实凭据）全程未读取、未使用。
- 生产镜像 `nightly_audit-app:latest`（1.69GB）：`docker compose -f compose.nightly.yml --env-file .env.nightly up -d --build` 构建成功；启动日志 `Running database migrations... Database migrations completed`；`/api/health` 返回 `{"status":"healthy","database":"healthy","storage":"local healthy"}`；日志无缺失模块/迁移失败。
- 修复后重建镜像一次（见第 5 节），并复核通过。

## 3. 流程验收表（★=真实浏览器操作；○=仅单测/静态分析）

| 流程 | 结果 | 证据 |
| --- | --- | --- |
| 注册（含表单错误） | ★ 通过（修复后全中文报错） | screenshots/register-zod-english-errors.png（修复前）、register-fixed-errors.png（修复后） |
| 邮箱验证 | ★ 通过 | Mailpit 捕获验证邮件，链接跳转后自动登录到 /dashboard/resumes |
| 登录/退出 | ★ 通过 | 旧密码拒绝提示"邮箱、用户名或密码不正确。" |
| 密码重置 | ★ 通过 | Mailpit 收到重置邮件→设新密码→旧密码拒绝、新密码成功 |
| 中文空白简历创建 | ★ 通过 | 左栏顺序：图片→基本信息(性别/年龄/博客/GitHub/政治面貌/详细住址)→教育→技能→实习→工作→项目→校园→获奖→证书→个人评价→科研；单栏 zh-CN；Noto Sans SC |
| 填写与持久化 | ★ 通过 | 刷新后 15/15 内容检查全部保持（含"不公开"性别不出现在预览） |
| 模板切换 | ★ 通过 | 商务→技术→校园→商务，内容/顺序/字段全程保持 |
| 导出 PDF | ★ 通过 | 1 页，10 项关键内容全部存在，无性别泄露 |
| 导出 DOCX | ★ 通过 | 全部内容含部门/工作类型/担任角色，无性别泄露（小瑕疵：`Grade:` 前缀英文） |
| 导出 Markdown | ★ 通过 | 页眉顺序邮箱→电话→年龄→城市→住址→政治面貌→博客→GitHub，无性别泄露 |
| 导出 JSON | ★ 通过 | `gender:"undisclosed"` 存储但不显示（设计如此），zh-CN、zh-internship/zh-campus 保留 |
| JSON 回导 | ★ 通过 | 注入同一 JSON 创建新简历，10/10 内容保持；GitHub 不重复 |
| 公开分享 | ★ 通过 | 开关开启→`/nightlya/0926-0112-74` 可访问；隐藏的"证书信息"章节与性别未泄露 |
| 匿名访问私有简历 | ★ 通过 | 匿名访问 /builder/{id} 跳转 /auth/login，无数据泄露 |
| 跨账号隔离 | ★ 通过 | 乙看不到甲的简历列表（空）；访问甲私有 builder 报"出问题了"（owner 过滤）；公开页正常可见 |
| 双标签页并发编辑 | ★ 通过 | A 改→B 实时同步（SSE）；B 改→A 实时同步；刷新后双方一致（last-write-wins，无覆盖丢失） |
| 移动端 390px | ★ 通过 | 底部 编辑/预览/设计 切换；教育弹窗 取消/保存 在底部；预览完整 |
| Agent 修改简历（测试替身） | ★ 通过 | mock LLM（OpenAI 兼容 SSE）：补丁提案→应用→AI 草稿更新；"审核编辑"开启后出现 批准/拒绝 审批卡；拒绝→"编辑已被拒绝"且草稿不变；恢复（Restore）→确认框"将回滚此补丁以及之后应用的所有补丁"→草稿回滚。**真实付费模型未验证** |
| 岗位检索 | ★ 不通过 | 见第 6 节 |
| 重复导入 | ○ 未单独验证 | 导入无去重设计（每次导入生成新简历），首次回导已证明该行为；未在 UI 重复执行第二次 |
| 损坏 JSON 导入 | ★ 通过（有保留） | 无法自动识别格式并提示手动选择；强制类型导入不会创建简历（DB 计数不变）；但 UI 无失败 toast（静默 no-op，低风险） |
| 超限文件导入 | ○ 未验证 | 客户端 MAX_UPLOAD_BYTES 检查存在（代码），未构造 25MB+ 文件实测 |

## 4. 缺陷清单

| # | 严重度 | 状态 | 摘要 |
| --- | --- | --- | --- |
| 1 | P1 | ✅ 已修复 | ATS 中文文案数字颠倒（4 处） |
| 2 | P1 | ✅ 已修复 | 注册表单中文界面显示英文 zod 原始报错 |
| 3 | P2 | ✅ 已修复 | "Warning" 徽标译为「警告”」（多余引号，zh-CN+zh-TW） |
| 4 | P2 | ✅ 已修复 | 注册姓名 minLength=3 拦截两字中文名 |
| 5 | P1 | ❌ 未修复（需产品决策） | 会话过期静默丢失未保存编辑 |
| 6 | P1 | ❌ 未修复（需专项） | 深度检查浏览器端 CJK 文本提取失败 |
| 7 | P2 | ❌ 未修复 | 深度检查日期误报 "22.09 - 2026"（#6 的副作用） |
| 8 | 观察 | 不修 | 验证/重置邮件为英文（Batch 4 产品决策未实施，既知） |
| 9 | 观察 | 不修 | DOCX 中 `Grade:` 标签英文硬编码 |
| 10 | 观察 | 不修 | 导入未知格式时点击"导入"无可见反馈 |

### 修复明细（复现 → 根因 → 修复 → 回归）

**#1 ATS 中文数字颠倒**
- 复现：中文界面编辑器 ATS 面板显示「20 项检查中，21 项已通过」（21>20 不可能）；深度检查「46 项适用检查中，53 项已通过」「3 项适用检查中，4 项已通过」；JD 覆盖「找到 2 个词中的 14 个」。
- 根因：`apps/web/locales/zh-CN.po` 四条 msgstr 把"已通过/命中"占位符放在了"总数"占位符之前：`{0} of {1} applicable checks passed`（{0}=passed, {1}=total）被译成「{0} 项适用检查中，{1} 项已通过」等。
- 修复：四条 msgstr 调换占位符（`zh-CN.po`：score-header、report-view、jd-coverage、ats-check 四处）。
- 回归：`locale-catalogs.test.ts` + `ats-check.test.tsx` 18/18 通过；重建镜像后浏览器实测「21 项检查中，21 项已通过」（screenshots/ats-fixed-numbers.png）。

**#2 注册英文 zod 报错**
- 复现：中文界面注册，姓名填「张」、用户名「a」、邮箱「not-an-email」→ 显示 "Too small: expected string to have >=3 characters"、"Invalid email address"（密码错误却是中文，证明仅部分字段本地化）。截图 register-zod-english-errors.png。
- 根因：`register.tsx` 的 zod schema 中 name/username 的 `.min(3)` 与 `z.email()` 没有配 `error` 回调，走了 zod 默认英文消息；而 password 有（Batch 1 修过）。
- 修复：按同文件既有模式补 `error: () => t\`...\``（Name must be at least 2 characters. / Username must be at least 3 characters. / Enter a valid email address.），`lingui extract` 后 zh-CN 译文「姓名至少需要 2 个字符。」「用户名至少需要 3 个字符。」「请输入有效的电子邮箱地址。」（email 条目复用目录已有译文）。
- 回归：typecheck 通过；重建镜像后浏览器实测四条错误全中文（register-fixed-errors.png）。

**#3 「警告”」杂引号**
- 复现：ATS 检查列表警告徽标显示「警告”」。
- 根因：zh-CN.po 与 zh-TW.po 的 `msgid "Warning"` 译文字符串尾部多了一个右双引号。
- 修复：两处 msgstr 改为「警告」。浏览器复核已无「警告”」。

**#4 两字中文名无法注册**
- 复现：姓名「王芳」被客户端 minLength=3/zod min(3) 拦截。中文两字姓名是主流场景。
- 根因：`register.tsx` name 字段 min(3) + Input minLength={3}（17ca43a 引入）。服务端 better-auth 对 name 无最小长度约束。
- 修复：name 的 zod min 与 HTML minLength 放宽为 2；username 保持 3。配套新文案见 #2。
- 回归：重建镜像后以「王芳 / wangfang / wangfang@test.local」完整注册成功（进入验证邮件页，DB 出现新用户）。

### 未修复缺陷的完整证据

**#5 会话过期静默丢内容（P1）**
- 复现：登录→进入编辑器→直接在数据库删除全部 session（模拟服务端会话失效/7 天过期）→在姓名字段输入新值触发自动保存→页面跳转 /auth/login→重新登录后检查：输入值丢失，简历姓名保持原值。截图 session-expired-autosave.png。
- 根因分析：无全局 401 拦截与保存失败本地兜底（与既有审计 P0-3/P0-4 一致）；本次未修，因为最小修复需要产品决策（localStorage 暂存、重新登录后回填、或跳转前 confirm）。
- 上线影响：7 天 session 过期后仍在编辑的用户会丢内容。

**#6 深度检查 CJK 提取失败（P1）**
- 复现：中文简历（内容完整）→ 右栏 ATS检查 → 深度检查 → 结果：「作为一份简历，能提取出的文字量非常少」「未找到工作经历部分」「未找到教育经历部分」「未找到技能部分」「各部分 0 分，总分被 cap 到 60」。
- 关键证据：同一份简历导出的 PDF（docs/nightly-audit-evidence/exports/resume-zh.pdf）在 Node 端用 pdfjs-dist legacy build 提取出 642 字符且包含「陈晓东」「主修」，pypdf 亦可完整提取 → PDF 本身文本层完好；问题出在浏览器端提取路径（`apps/web/src/features/ats-checker/extract-client.ts` 的 `getDocument({ data, fontExtraProperties: true })` 未配置 cMapUrl/cMapPacked，或与构建器预览共享 worker 的相互影响）。提取到的 "22.09 - 2026" 说明数字/拉丁可提取、CJK 丢失。
- 附带：JD 匹配引擎（packages/resume/src/ats-pdf/jd/）为英文分词导向，中文 JD 下词项结果不具可用性（既知）。
- 未修原因：需要为 Vite 构建接入 pdfjs cMaps 静态资源并回归预览路径，超出"最小修复"边界；建议专项处理。

## 5. 本次修改的文件（全部未提交）

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `apps/web/locales/zh-CN.po` | 修改 | 4 处占位符/错字修复 + 2 条新译文 |
| `apps/web/locales/zh-TW.po` | 修改 | 1 处「警告”」错字修复 |
| `apps/web/locales/*.po`（共 55 个） | 修改 | `lingui extract --clean --overwrite` 的目录刷新：含我的新 msgid（en-US）与并行会话未提交源码的条目引用刷新。**语义改动只在 zh-CN/zh-TW**；其余语言若需最小化 diff 可单独 review |
| `apps/web/src/features/auth/pages/register.tsx` | 修改 | 见缺陷 #2/#4 |
| `compose.nightly.yml` | 新增 | 隔离验收编排（本地验收可复现） |
| `.env.nightly` | 新增（被 gitignore） | 本地随机密钥，勿入库勿复用 |
| `docs/nightly-audit-evidence/` | 新增 | 截图 9 张、导出样例 4 份、启动日志、mock LLM 脚本及其日志 |
| `docs/nightly-release-audit-report.md`、`docs/nightly-release-review-handoff.md` | 新增 | 本报告与交接文档 |

**不是本次完成**（并行会话的未提交工作，全程未回退、未覆盖）：中文编辑器全部字段/章节代码、`vitest.setup.web.ts`、`compose.nginx.yml`、`deploy/`、`docs/zh-cn-resume-editor-*.md` 等，见实施报告第 1.5 节与 review-followup 第 5 节。本次会话动手前快照 111 个未提交变更，动手后 169 个，增量全部来自上表。

## 6. 岗位检索核实结论（专项任务）

- **运行时不存在中国岗位数据库或外部岗位数据接入**。检索范围：`apps/`、`packages/` 全部源码 + `knowledge/`。
- `/dashboard/settings/job-search` 路由实际是空壳：`beforeLoad` 直接重定向到 `/dashboard/settings/integrations`（AI 供应商设置页），无岗位检索 UI。
- `knowledge/china-job-rules/`（54 条规则、10 个岗位画像，来源为国家大学生就业服务平台等官方页面，`sources.json` 记录授权边界）是静态知识库：**grep 全仓库无任何运行时代码引用**，仅 README 描述"可供 Agent/RAG 检索使用"。
- 唯一与"岗位"相关的可运行流程：编辑器右栏 ATS 深度检查的 JD 匹配（用户粘贴 JD → 客户端词项匹配 → 覆盖率展示）。它是**简历 vs 岗位描述的匹配度检查**，不是岗位检索（没有岗位库、没有查询入口、没有岗位列表页）。且中文 JD 下该功能失真（缺陷 #6）。
- **结论：岗位检索未形成完整流程（用户输入→查询→返回岗位→展示 的链路不存在），上线材料不得如此宣称。** 未为补数据抓取任何外部网站。

## 7. 环境阻碍与未解决问题

- Docker Desktop 起始未运行，已启动（29.2.1）；无其他环境阻碍。
- Mailpit 镜像健康检查首版命令错误（`mailpit readyz` 不存在）已改为 wget 探针。
- 宿主机 → 容器网络的 host.docker.internal 数据面被本机网络策略阻断（TCP 可建连、HTTP 被掐），mock LLM 改跑在 compose 网络内（`nightly_mock` 容器，`http://mock:9931`）解决。
- 未验证：真实 LLM（OpenAI/Anthropic/DeepSeek 等）驱动的 Agent 行为；S3/SeaweedFS 存储路径；真实 SMTP 投递；25MB+ 超限文件。
- 遗留测试疑点：整包 web 测试在并发负载下有超时型假失败史（见 review-followup），本次仅跑了定向 18 个测试 + typecheck，全量套件留待低负载时段。

## 8. 复现命令（供审查者）

```bash
# 隔离环境（勿在 3100/8025 端口已有服务时执行）
docker compose -f compose.nightly.yml --env-file .env.nightly up -d --build
# 健康检查
curl http://127.0.0.1:3100/api/health
# 邮件捕获 UI
http://127.0.0.1:8025/
# Agent mock（已在 compose 网络内运行）
docker run -d --name nightly_mock --network nightly_audit_default --hostname mock \
  -v "$PWD/docs/nightly-audit-evidence/mock-llm.mjs:/mock.mjs:ro" node:24-alpine node /mock.mjs 9931
# 定向回归
corepack pnpm --filter web typecheck
cd apps/web && corepack pnpm exec vitest run src/libs/locale-catalogs.test.ts "src/routes/builder/\$resumeId/-sidebar/right/sections/ats-check.test.tsx"
# 清理
docker compose -f compose.nightly.yml --env-file .env.nightly down -v
```

测试账号（本地隔离库）：`nightly-a@test.local`（密码已在验收中重置，见交接文档）、`nightly-b@test.local`、`wangfang@test.local`；简历 3 份（中文验收-后端开发 / 求职简历 0925-1730-86 / 中文验收-后端开发 - AI 草稿）。
