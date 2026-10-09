# Weekly Resume 简历一致性独立审查报告（GLM）

日期：2026-09-26。执行者：GLM（独立复核会话，未采信前一会话报告作为通过证据）。
范围：本地 nightly 环境（`compose.nightly.yml`，http://127.0.0.1:3100，Mailpit 8025）。未提交、未推送、未部署、未改真实用户数据、未动数据库卷。

## 摘要

- **确认缺陷 8 个，全部已修复**（见第 3 节），每项均为先复现、先红灯测试、后最小修复。其中 DEF-8 是在真实浏览器上传路径中新发现的（ Languages 分类词与章节别名撞名）。
- 主线验证（导入 → 编辑 → 保存 → 回读 → 模板 → 四格式导出 → JSON 回导 → 公开分享 → 390px）在单元/探针与真实浏览器两个层面均通过（第 5、6 节）。
- 除已修项外，另有 4 项定级为「记录不改」（P3），理由与残余风险见第 4 节。
- 结论：**本地验收可以继续**；在完成第 7 节列出的未验证项（真实 LLM、全量 PDF 渲染矩阵、生产环境）之前，不构成「进入发布准备」的完整证据。

## 1. 环境与工作区

| 项 | 值 |
|---|---|
| 起始/结束分支 | `main` |
| 起始 HEAD | `a57d9d0a98446b5b484cff216db9b87f27b24ac0` |
| 结束 HEAD | 同上（本会话未做任何提交） |
| 起始工作区 | 271 个未提交文件（多位作者，含前一会话技能分组修复） |
| 结束工作区 | 287 个未提交文件（增量为本会话改动+并行会话波动） |
| 本会话改动文件 | `packages/import/src/plain-text.ts`、`plain-text.test.ts`、`skill-lines.ts`、`skill-lines.test.ts`、`apps/web/src/components/input/chip-input.tsx`、`chip-input.test.tsx`、`apps/web/src/dialogs/resume/index.tsx`、`apps/web/src/dialogs/resume/sections/interest.tsx`、`docs/glm-resume-consistency-*`（证据与报告） |
| 他人改动边界 | 未触碰 `packages/pdf`、`packages/resume`（skill-groups 除外——只读引用）、`packages/schema`、`packages/ui`、po 目录等前会话/并行会话文件 |
| 运行环境 | Docker `nightly_audit-*`：app(3100)/postgres/redis/mailpit 全部 healthy；Node v24.15.0；Windows / Git Bash |

## 2. 字段流向映射表

写入点缩写：TXT = `packages/import/src/plain-text.ts`（文本/PDF 文本导入）；编辑 = `apps/web/src/dialogs/resume/sections/*`；保存 = `packages/api/src/features/resume/service.ts`（整文档 PUT + expectedUpdatedAt 乐观锁路径）。渲染侧：PDF=React PDF 模板（共享过滤 `packages/pdf/src/templates/shared/filtering.ts`）；DOCX=`packages/docx/src/section-renderers.ts`；MD=`packages/resume/src/markdown.ts`；无障碍=`apps/web/src/features/resume/preview/resume-accessible-text.tsx`。

| 章节/字段 | schema 路径 | 导入写入点 | 编辑写入点 | 导出一致性 | 备注/测试证据 |
|---|---|---|---|---|---|
| 姓名 | `basics.name` | TXT 头部首行；本轮新增：个人信息章节内 `姓名：` 标签 | basics 表单 | PDF/DOCX/MD/无障碍均渲染 | `plain-text.test.ts` personal info 组 |
| 求职意向 | `basics.headline` | 头部 rest[0]（本轮去除 `求职意向：` 标签污染）；求职意向章节单行短文本 | basics 表单 | 同上 | probe `section-mapping-probe-after.json` |
| 电话/邮箱 | `basics.phone/email` | 头部提取；**本轮修复：个人信息/个人资料/联系方式章节内标签与裸值** | basics 表单 | 同上 | `contact-probe-glm-result.json`（7 边界） |
| 地址/住址 | `basics.location`（城市）/`basics.address`（详细） | 头部逗号启发式定位 location；`住址/地址` 标签**不**自动映射，保留在 summary | basics 表单 | 同上 | 决策记录见 4.1 |
| 性别/年龄/政治面貌 | `basics.gender/age/politicalStatus(+Other)` | 不映射，原文保留在 summary（不丢弃、不猜测） | basics 表单（gender=undisclosed 不渲染） | nightly 审计已验证四格式无泄露 | `cn-fields.ts` genderLabel |
| 自定义字段 | `basics.customFields[]` | 不映射 | basics 表单（ChipInput，本轮启用 commitOnBlur） | 渲染于联系方式区 | `dialogs/resume/index.tsx:427` |
| 教育背景 | `sections.education.items{school,degree,location,period,description}` | TXT groupEntries | education.tsx | 四格式一致；schoolTier/grade/area 仅编辑器提供 | `plain-text.test.ts` |
| 工作经历 | `sections.experience.items{company,position,location,period,description,roles[]}` | TXT | experience.tsx | 四格式一致 | 既有测试 |
| 实习经历 | `customSections[id=zh-internship,type=experience]` | **本轮修复**：TXT 不再并入工作经历 | 中文编辑器专属章节 | 按 experience 型自定义章节渲染（四格式通用） | `plain-text.test.ts` Chinese resume conventions 组 |
| 校园经历 | `customSections[id=zh-campus,type=experience]` | **本轮修复**：TXT 不再并入志愿经历 | 同上 | 同上 | 同上 |
| 志愿经历 | `sections.volunteer.items` | TXT（校园经历分离后不再混入） | volunteer | 四格式一致 | 同上 |
| 项目经历 | `sections.projects.items` | TXT | projects | 四格式一致 | 既有测试 |
| 专业技能 | `sections.skills.items{name,keywords[],proficiency,level,icon…}` | TXT parseSkillLines（分组）；**本轮修复短分类识别与技能区大写行** | skill.tsx（ChipInput commitOnBlur+bulkPaste） | 分类加粗+成员正文的呈现已有 PDF/DOCX 测试 | `skill-lines.test.ts`、`matrix-import-probe-result.json` |
| 获奖情况 | `sections.awards.items{title,awarder,date,…}` | TXT groupEntries（dated） | awards | 四格式一致 | 既有测试 |
| 证书 | `sections.certifications.items{title,issuer,date,…}` | TXT | certifications | 同上 | 既有测试 |
| 科研成果 | `sections.publications.items{title,publisher,date,…}` | TXT | publications | 同上 | 既有测试 |
| 个人评价 | `summary.content`（富文本） | TXT `自我评价/个人评价/个人简介` 等别名 | summary 编辑器 | 四格式一致 | 既有测试 |
| 语言/兴趣 | `sections.languages/interests.items` | TXT（languages 括号流利度；interests splitList） | interest.tsx（本轮 commitOnBlur） | 四格式一致 | `misc-paths-probe-after.json` |
| 社交账号 | `sections.profiles.items{network,website}` | TXT URL 行 | profiles | github 与 basics.github 去重（omitDuplicateGithubProfiles） | filtering.ts |
| 自定义章节 | `customSections[]` | TXT 未知标题（本轮限制 CJK 空洞大写误判） | sidebar 自定义 | 四格式一致 | `plain-text.test.ts` |
| 隐藏状态 | `*.hidden` | 导入恒为 false | 每章节/条目开关 | PDF/DOCX/MD/无障碍均过滤 hidden；PDF 额外过滤空主标题 | filtering.ts、section-renderers.ts、markdown.ts、walk.ts、accessible-text |
| 布局 | `metadata.layout.pages[].main` | TXT 仅写入有内容章节 | 拖拽排序 | JSON 回导时空内置章节按恢复机制追加（刻意设计） | `reactive-resume-json.tsx` normalizeBuiltInSectionsInLayout |

## 3. 确认缺陷与修复（全部已修，均先复现后修复）

### DEF-1（P1）个人信息章节联系方式丢失，落入 summary
- 用户操作：粘贴/导入含「个人信息」章节的中文简历文本。
- 输入/预期/实际：见 `docs/glm-resume-consistency-evidence/probes/contact-probe-glm-result.json` 修复前记录（7 个边界全部 `emailInBasics=false`）。
- 根因：`个人信息/个人资料` 映射为 `summary` 章节；联系方式提取只读文档头部（`headerBoundary` 遇已知标题即止），章节内邮箱/电话/姓名全部进 `summary.content`。
- 修复（`packages/import/src/plain-text.ts`）：新增个人信息章节结构化提取 `applyPersonalInfo`（标签机制：姓名/邮箱/电话/网址/求职意向 → basics，仅写空字段；同值判重丢弃、冲突值保留原文；无标签行走头部同款内联提取；`联系方式/基本信息` 增补为章节别名；求职意向章节单行短文本 → headline，散文体保留 summary）。未映射字段（性别/年龄/住址等）全部保留在 summary。
- 回归：`plain-text.test.ts`「personal info sections」9 用例（先红后绿）；import 全量 10 文件 169 测试绿。

### DEF-2（P2）实习经历/校园经历被并入工作/志愿章节
- 输入含 `实习经历`/`校园经历` 标题 → 实习条目混入 `sections.experience`、校园条目混入 `sections.volunteer`，原始分类丢失（证据 `section-mapping-probe-before.json`）。
- 根因：TXT 的 `SECTION_ALIASES` 将 `实习经历→experience`、`校园经历/社团经历→volunteer`，与中文编辑器的独立章节约定（`packages/schema/src/resume/blank-zh-cn.ts`、`cn-fields.ts:3-4` 固定 ID `zh-internship`/`zh-campus`）不一致。
- 修复：映射到固定 ID 的 experience 型自定义章节，标题保留原文；重复标题合并到同一章节；简化/繁体别名均支持。
- 预期变更依据（单列）：`plain-text.test.ts` 既有用例「imports common Chinese resume sections…」原断言实习并入工作经历，与中文空白简历的独立章节约定冲突（审计提示词明确列为可疑路径），故按新行为改写断言；非删断言。

### DEF-3（P1）「大写 ASCII + 中文」内容行被误判为章节标题，整行静默丢弃
- 例：兴趣爱好章节单行 `C++/C#/音乐` → 解析结果**整个章节为空**（order=[]，无任何保留）。`C++ 音乐`、`C#/音乐`、`.NET/音乐` 同类。
- 根因：`looksLikeHeading` 用「letters 全大写且非全小写」判定；CJK 字母大小写恒等，使 `CC音乐` 这类混排行的「全大写」测试被空洞满足。
- 修复：`looksLikeHeading` 与 `looksLikeTitleCaseHeading` 增加脚本守卫（含汉字的行不参与英文标题启发式；中文标题由别名表承担）。
- 回归：3 个新用例先红后绿；`misc-paths-probe-after.json` 全部保留。

### DEF-4（P2）技能区内前置空行的全大写技能行仍被误判为新章节（SQL/MQTT 静默丢失）
- 例：`专业技能\n编程语言\nJava, Go\n\nSQL\nMQTT\nLINUX\nDocker` → SQL/MQTT 两行整体丢失、LINUX 变伪章节并吞掉 Docker（探针实测）。
- 根因：技能区守卫 `(!precededByBlank || isSkillCategory(line))` 不覆盖「空行后的大写行」；产生的空 segment 被 `item.lines.length===0` 静默跳过。
- 修复：技能区内改用「孤立全大写行=可开新章节（如既有测试的 SPEAKING），连续全大写行串=技能内容」的运行长度规则。
- 回归：新增技能行保留用例先红后绿；既有 SPEAKING 用例不改仍绿。

### DEF-5（P2）逐行版式的短分类（无冒号、纯后缀词）不识别，组结构丢失
- 例：`编程语言\nJava…(6)\n\n工具\nGit…(6)` → 解析为单组 13 个关键词，第二组分类丢失（矩阵探针 M3）。
- 根因：`skill-lines.ts` category 正则前缀 `{2,20}` 要求至少 2 个汉字前缀，`工具/数据库` 等纯后缀分类不匹配。
- 修复：前缀放宽为 `{0,20}`（保留「下一行非分类」守卫，避免孤立词开组）。
- 回归：新用例先红后绿；既有「不从 Java/URL 臆造分类」用例不改仍绿。

### DEF-6（P2）ChipInput 对既有重复关键词静默合并 + React key/拖拽按文本匹配错位
- 例：关键词数组 `["Java","Java"]`（导入/合并可产生）在技能卡片打开后，输入任意新词保存 → 静默坍缩为 `["Java",新词]`；React 以文本作 key 产生重复 key 警告；拖拽第二个「Java」实际移动第一个（`chips.indexOf(active.id)`）。
- 修复（`apps/web/src/components/input/chip-input.tsx`）：新增值去重改为「仅对新输入去重，既有重复项保留」；React key 与 sortable id 改为 `${index}:${chip}` 复合 id，拖拽按复合 id 定位。
- 回归：2 个新用例先红后绿（15/15）；组织器 4 用例仍绿。拖拽路径为代码审查+复合 id 单元定位，未做 jsdom 拖拽模拟（残余风险见第 6 节）。

### DEF-7（P3→已顺手修复）兴趣/标签输入未确认即保存会丢词
- 兴趣对话框与简历 Tags 的 ChipInput 未启用 `commitOnBlur`（仅技能表单启用）：输入不按回车直接点保存，待输入词丢失。修复：两处传入 `commitOnBlur`（各一行 diff）。UI 提示文案已有（"Press Enter or ,"），失焦提交是兜底不是替代。

### DEF-8（P2，浏览器上传路径发现）技能分类词与章节别名撞名，内容被错标到其他章节
- 用户操作：上传含 `SKILLS\nLanguages\nJava, Go\nTools\nGit, Docker` 的英文简历 PDF（浏览器本地文本提取路径）。
- 实际：`Languages` 行命中章节别名 → 开启"语言"章节，`Java, Go/Tools/Git, Docker` 全部变成语言条目，专业技能为空（Node 复现：`trace-upload-parse.json`）。
- 根因：`SECTION_ALIASES` 的 `languages/tools` 等词同时是常见技能分类名；技能区守卫只拦 unknown 标题，不拦已知别名。
- 修复：技能区内「分类词 + 下一行为逗号列表（splitSkillKeywords≥2）」时保留为技能分类（`holdsInSkills`）；真实语言章节（首行为 `English (Native)` 单条目）不受影响。
- 回归：2 个新用例（撞名保留 + 真实语言章节仍开）先红后绿；import 全量 171/171。
- 已知残余（记录不改）：`Languages` 分类后跟逐行成员（无逗号）仍会误开语言章节——与真实语言章节在该形态下不可区分，启发式无解，报告明示。

## 4. 定级为「记录不改」的发现

1. **住址/地址标签不自动映射到 basics.address**：标签语义歧义（城市 vs 详细地址），schema 有 location/address 两个字段，错误映射代价高于保留原文（保留在 summary，用户可自行移动）。与「不能仅凭中文标签猜测」约束一致。
2. **interests 的 splitList 静默去重 + 60 项截断**（`MAX_LIST_ITEMS`）：同一爱好重复出现去重无信息损失；>60 项兴趣属病态输入且 skills 已不受此限。定级 P3，未改。
3. **中文逗号/顿号在 ChipInput 键入路径不切分**（仅粘贴路径切分）：IME 组合输入保护（isComposing/229）与键入切分冲突，前会话刻意保守。粘贴 `bulkPaste` 已覆盖主要场景。
4. **updateChip 重名编辑静默忽略**：把一个关键词改名成与另一关键词同名时无提示直接丢弃编辑。属 UX 打磨，未改。

## 5. 验证记录（测试命令与结果）

| 检查 | 命令（工作区根） | 结果 |
|---|---|---|
| import 全量 | `pnpm --filter @reactive-resume/import exec vitest run` | 10 文件 / 171 测试全绿（起点：151） |
| import 类型检查 | `pnpm --filter @reactive-resume/import typecheck` | 通过（tsgo --noEmit） |
| ChipInput | `pnpm --filter web exec vitest run src/components/input/chip-input.test.tsx` | 15/15（起点 13） |
| 组织器+ChipInput | `pnpm --filter web exec vitest run src/features/resume/builder/skill-group-organizer.test.tsx src/components/input/chip-input.test.tsx` | 19/19 |
| web 类型检查 | `pnpm --filter web typecheck` | 通过 |
| 探针 | `tooling/node_modules/.bin/tsx docs/glm-resume-consistency-evidence/probes/*.mts` | 见 probes/ 目录 15+ 个文件 |
| 镜像构建 | `docker compose -f compose.nightly.yml --env-file .env.nightly build app` + `up -d app` | 三次成功；最终镜像 `sha256:7f85dbdf8b6d…`；日志 `docker-build*.log` |

说明：`pnpm test -- <路径>` 在该环境不按预期收窄范围，统一用 `pnpm --filter <pkg> exec vitest run <路径>`。无失败重跑记录——本轮所有红灯均为新回归用例的首轮预期红灯，修复后一次转绿。

## 6. 真实浏览器与成品核验

独立账号 `glmaudit@test.local`（本会话注册，虚构数据）。**注意镜像时效**：首轮浏览器验证在旧镜像 e6bce91（前会话构建，不含本轮解析修复）上进行，其中 JSON 导入夹具由本会话 Node 端探针（工作区代码）生成，因此编辑/渲染/导出结论有效、浏览器内解析不在其列；随后重建镜像（`15b9996b…`，再重建含 DEF-8 的最终镜像见 build-2 日志）后重做上传路径验证。

| 项 | 结果 | 证据 |
|---|---|---|
| 文本解析→JSON 导入（真实导入对话框+文件注入） | 全部字段正确：基本信息（含个人信息章节内姓名/邮箱/电话）、求职意向→headline、教育/实习(zh-internship)/校园(zh-campus)/工作独立成节、技能两组、summary 仅含评价文本 | `fixture-zh.json` + 编辑器快照 |
| 刷新持久化 | reload 后 9 个标记全存活 | 快照比对 |
| 模板切换（商务→学术→经典→视觉） | 每次切换 11/11 内容标记无缺失；数据不变 | `browser-template-vision*.png` |
| 四格式导出 | PDF 34869B：PDF.js 提取 29/29 标记（pdftotext 对 CID 子集字体提取不全，为提取器局限）；DOCX 9479B：解包 XML 25/25 标记、层级/日期/分组完整（仅 XML 内容核验，环境无 Office 渲染）；Markdown 611B：H1/H2/H3 层级、加粗分类、链接全部正确；JSON 8404B：内容字段与夹具一致（仅空内置章节按恢复机制追加+item id 重生成，均为允许差异） | `exports/` |
| 画布视觉核验 | 视觉模板整页渲染无裁切/遮挡/空白页；单页简历，画布即 PDF 光栅 | `browser-template-vision-3.png` |
| 公开分享 | 开启后匿名（credentials: omit）200 且含内容标记；编辑器预览与公开版内容一致（12 标记）；关闭后响应为空壳（0 内容标记，数据不再暴露；SSR 壳 200 属 data-only 设计） | `browser-public-share.png` |
| 390px 移动端 | 底部 编辑/预览/设计 可点，内容 6/6 | `browser-390px.png` |
| PDF 上传导入（新镜像 7f85dbdf，浏览器内 extractPdfLines→parseResumeText） | 首轮发现 DEF-8（Languages 撞名错标为语言章节）；修复+重建后重测：8/8 标记正确（基本信息、教育、Languages/Tools 两组技能） | `upload-fixture.pdf`、`trace-upload-parse.json`、`trace-upload-parse.json` |
| 兴趣失焦提交（DEF-7 浏览器侧） | 通过：输入关键词不按 Enter → 失焦提交 → 保存 → 刷新后回读仍在。中途一次"未能保存"为 Docker Desktop 引擎中断（容器 Exit 137）所致，属环境故障；草稿恢复机制完整找回本地修改（附带验证了会话丢失保护），恢复后保存+刷新持久化成功 | 快照 + draft-recovery 流程记录 |

补充说明：
- 上传/注入方式：IAB 不支持文件选择器，使用页内 DataTransfer 向真实 `<input type="file">` 注入文件，走应用完整导入流程（格式识别、类型下拉、导入按钮、跳转 builder）。
- 组织器合并/撤销浏览器操作未在本会话重做（单元 19/19 绿；步骤见交接文件 §4.6）。
- DEF-8 修复后的最终镜像重测结果见第 3 节 DEF-8（Node 复现+171/171 单元回归）；浏览器端重测若与镜像重建时序冲突，以报告「未验证项」为准。

## 7. 未验证项与残余风险

- 真实 LLM（AI 解析保持分组的提示词仅规则层面确认，未连真实模型；PDF/DOCX 的 AI 导入路径未测）。
- jsdom 未模拟 dnd 拖拽；DEF-6 的拖拽修复依赖复合 id 的代码正确性，建议真实拖拽复核。
- 中文输入法真实组合输入仅在单元层验证 isComposing 守卫，未做真机 IME 手测。
- 全量 web / PDF 套件未在本会话重跑（工作区含大量并行改动，假失败归因成本高；运行的是受影响定向套件与 import 全包）。
- `Languages\nJava\nGo`（逐行成员、无逗号的撞名分类）仍会误开语言章节——与真实语言章节该形态不可区分，记录为启发式边界。
- 环境事件：核验期间 Docker Desktop 引擎曾中断一次（容器 Exit 137），造成一次自动保存失败与一条草稿恢复记录；已恢复并完成数据验证，与代码无关，但意味着该时间窗内的观察需要按中断解读。
- 生产环境、真实 SMTP、扫描件 OCR、线上匿名权限均未测。