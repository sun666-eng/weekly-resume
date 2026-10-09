# 发布阻塞修复报告（2026-09-26）

对象：`docs/nightly-independent-review-2026-09-26.md` R1–R6 三项上线阻塞 + 小修复直接回归。
仓库 HEAD：`a57d9d0a98446b5b484cff216db9b87f27b24ac0`（未提交、未推送）。最终镜像：`nightly_audit-app` ID `32a5bfd0ae24`（2026-09-26 04:35 +0800 构建，含本轮全部修复）。

## 0. 状态归属

- **继承的工作区改动**（未动）：中文编辑器实现约 100 个文件（归属并行会话）；i18n Batch 1–3 已提交链；复核者新增的 `docs/nightly-independent-review-2026-09-26.md`、`docs/nightly-review-evidence/`、`tooling/review-nightly-ats.mts`（该脚本有 2 个**既有** TS 错误 TS2531/TS7006，按文件归属未修改；因此 `turbo typecheck` 在 tooling 包会失败，其余 19 包通过）。
- **本轮新增改动**：见第 1–4 节；起始工作区 175 个未提交变更，结束 208 个，增量全部来自本轮新增/修改与 `lingui extract` 的 po 刷新。

## 1. 阻塞一：会话失效与未保存草稿（R3 + R5）

### 1.1 根因定位（先证据后修复）

- 原报告"鉴权跳转绕过保护"的机理：`__root.tsx` 的 `beforeLoad → loadRootContext() → getSession()` 在**页面加载/导航时**返回 null → `builder/$resumeId/route.tsx:16` 抛 redirect 到 `/auth/login`。编辑过程中会话失效**不会**被强制踢出（autosave 401 只触发错误 toast）；真正的丢失窗口是"保存失败后页面卸载"——draft.ts 的 pending 草稿只存在于内存 `runtimes` Map。
- 实测证据（隔离浏览器 + 删除 DB session）：
  1. 会话失效后继续编辑 → 页面保留、toast「无法保存」可见、`localStorage` 出现键 `weekly-resume:unsaved-draft:{userId}:{resumeId}`（内容为最新未保存标记「恢复标记ZQ0926-二笔」）。
  2. 带未保存修改刷新 → `useBlocker` 的 beforeunload 确认框拦截（IAB 自动取消，表现为加载被中止 ERR_ABORTED）——离页保护生效。
  3. 新开标签直接访问 builder URL → 跳转 `/auth/login` ✓。
  4. 重新登录后打开 builder → 恢复提示出现：「发现上次访问时有未保存的修改。草稿保存于 … 服务器当前版本保存于 …」+「恢复草稿/放弃草稿」双按钮（截图 `release-blockers-evidence/recovery-prompt.png`）。
  5. 点「恢复草稿」→ 编辑器显示标记、自动保存成功、stash 清除、DB `basics.name` = 恢复的标记 ✓。
  6. 点「放弃草稿」（第二次实验）→ stash 清除、编辑器回到服务器已保存版本（丢弃的 -x 标记未入库）✓。
- 跨账号：存储键含 userId，`loadRecoverableDraft` 校验键内身份；不同用户/简历返回 null（单测覆盖）；B 无法打开 A 的 builder（owner 过滤），公共分享页不读该存储（仅 builder 路由引用）。

### 1.2 并发覆盖（R5）——先复现后修复

- **复现**：两标签整页加载同一简历，同一时间窗内 A 改姓名、B 改电话（真实并发，非轮流）。服务端结果：姓名更新、**电话丢失**（B 的整文档 PUT 携带陈旧姓名后写覆盖）。印证 R5 判断：交替同步成功不等于并发安全。
- **修复**（乐观锁 + 三方合并重试）：
  - 服务端：`resume.update`（整文档 PUT）新增可选 `expectedUpdatedAt`（dto/crud/service）；不匹配时抛既有 `RESUME_VERSION_CONFLICT`（409，与 PATCH 路径同一 guard 语义）。
  - 客户端 `draft.ts`：runtime 记录 `baseData/baseUpdatedAt`（初始化、保存成功、服务端替换时刷新）；保存携带 `expectedUpdatedAt`；收到 409 时 `recoverFromVersionConflict`——拉取服务端最新版本，按"合并单元"做三方合并（本地相对 base 未动的单元取服务端值，动过的单元保留本地；`basics`/`sections` 再下钻一层按字段/章节合并；`customSections` 按 id），然后以新 base 重试（上限 2 次），并 toast 告知发生了合并。
- **修复后验证**：同一并发实验重跑——服务端同时保留 `并发A-姓名v2` 与 `139 9999 8888` ✓；未编辑单元收敛到服务端值；toast 可见。
- **残余限制**（如实声明）：同一"合并单元"内两侧同时修改（如两个标签同时改同一个字段、同一条经历的不同字段）仍按本地优先裁决，存在可见的胜出者而非逐字符合并；未引入协同编辑架构。

## 2. 阻塞二：字体外部依赖（R2）

- **实际请求追踪**：PDF 渲染全部在浏览器端（react-pdf `Font.register` 直接抓 `getWebFontSource` 返回的 URL）；服务端不渲染 PDF（grep 无服务端字体抓取路径）。目录 3755 个 gstatic 引用是 508 个字体家族的清单存量，单次渲染只请求所选字族 + 回退栈。
- **同源交付**（支持范围，共 16 个文件 71.6MB，OFL 授权，见 `apps/web/public/fonts/README.md`）：IBM Plex Serif（默认字族，400/500/600/700+两斜体）、Noto Sans SC 400/500/600/700（中文默认+简体回退）、Noto Serif SC 400/700、Noto Sans/Serif 400/700（标点回退）。清单 `packages/fonts/src/local-fonts.json`；`getWebFontSource` 同源优先，且同一字族的 italic 回退规则整体保持在本地解析内（避免一次渲染混用本地+上游）。
- **阻断验证**（构造证明而非 DNS 阻断——改宿主机 hosts 超出本次边界）：整页冷加载 + PDF 导出全程 `performance.getEntriesByType("resource")` 断言 `fonts.gstatic.com / fonts.googleapis.com` 请求数 = 0，`/fonts/**` 请求 5 个（正好覆盖该中文简历所需字重）；导出 PDF 56KB 正常（`release-blockers-evidence/export-pdf-after-font-fix.pdf`）。
- **范围外行为**：未内置字体离线时仍指向上游 URL，渲染会失败并报错（不再无声吞掉）；缓存策略 = 浏览器默认 HTTP 缓存 + 同源静态资源；旧简历自定义字族不受影响（解析优先级：本地清单 → 原清单 URL）。

## 3. 阻塞三：中文 ATS（R1）

按独立复核定位的四层根因逐一修复（保留英文基线，未调阈值、未强行 pass）：

| 根因 | 修复 | 文件 |
| --- | --- | --- |
| `looksLatin` 的 `\|\| LATIN.test(fullText)` 让含少量英文技术词的中文简历判为英文 | 删除该子句；只保留"拉丁字符占比 > 0.4 + 词典命中 ≥ 0.15" | `ats-pdf/analyze/text-quality.ts` |
| 章节别名仅英文 | 新增中文别名（教育背景/教育经历、工作经历/工作经验、实习经历、校园经历、项目经历、专业技能、获奖经历、证书信息、自我评价/个人评价、科研成果、志愿经历、语言能力、兴趣爱好、荣誉/证书等）；整行精确匹配 + 现有标题判定，正文含词不误判 | `ats/section-aliases.ts` |
| 日期正则缺 `YYYY.MM` 端点，`2022.09 - 2026.06` 被截成 `22.09 - 2026`；ONGOING 无中文 | 端点增加 `\d{4}[./]\d{1,2}`、`\d{4}年\d{1,2}月`、`\d{4}年`；ONGOING 增加 至今/迄今/现在/現在；`startsInsideNumber` 过滤数字中段起配（不用 lookbehind，兼容旧浏览器）；共享文法 `parseEndpoint` 支持 2022年9月 | `ats-pdf/analyze/dates.ts`、`ats/period.ts` |
| 中文词数按空格切分得 102 词，触发"文档过短" | CJK 字符逐字计词 + 非空白拉丁词 | `ats-pdf/extract.ts` |
| 章节检查仅英语门控 | 改为"英语 或 多语言别名命中任一标题"才运行，否则 skip（新原因 `unrecognized-language`，UI 仅显示计数不受影响）；`NO_ROLE_LINES` 因大写启发式保持英语专属 | `ats-pdf/rules/sections.ts`、`types.ts` |
| JD 词项匹配仅英文导向（既知） | 报告附带原始 JD 文本，中文占比 > 0.2 时 UI 明示"关键词匹配对英文职位描述支持最好"；未宣称中文岗位匹配/岗位检索 | `jd/match.ts`、`types.ts`、`report/jd-coverage.tsx` |

**验证**：
- Node 端同一样例（独立复核的复现命令）修复前：isEnglish=true、60 分、cap NO_EXPERIENCE_SECTION、4 个不可解析日期；修复后：isEnglish=false、**99 分、无 cap**，仅剩真实发现 UNTAGGED_PDF（tip）与 NO_BULLET_POINTS（warning，样例正文确无 bullet 字形——已在行级 dump 中核实）。见 `release-blockers-evidence/ats-after-fix.json`。
- 浏览器深度检查：99/100，各部分 95（原 0）、日期 100（原 85）、"54 项适用检查中，53 项已通过"数字连贯；不再出现"未找到工作经历/教育/技能""文字量非常少"（截图 `deep-check-after-fix.png`）。
- 正反样例测试：`packages/resume/src/ats-pdf/chinese-ats.test.ts` 10 项（纯中文/混排/英文 isEnglish、标题正文区分、5 种日期格式、逆序与非法日期、端到端误报消失、英文基线）；既有规则测试对德语简历断言 skip 原因由 `not-english` 更新为 `unrecognized-language`（语义同为跳过）。

## 4. 小修复直接回归（R4）

- **ATS 数字**：`locale-catalogs.test.ts` 以不相等实值（3/8、0/5、2/14）断言四条译文的总数在前——位置互换不可能蒙混；zh-TW「Warning」=「警告」（无杂引号）。
- **注册边界**：`register.test.ts` 5 项——两字中文名通过；姓名 trim 后校验（全空格拒绝，与服务端一致：客户端发送 trim 后值）；1 字/64/65 字边界；用户名 min3+字符集+小写化；邮箱小写化+非法格式拒绝。
- **DOCX/Markdown `Grade:`**：中文简历输出「成绩：」，其他语言不变；`packages/docx` 20 项、`markdown` 9 项测试通过。
- 四处小修复的既有 18 个测试继续通过；新增测试见上。

## 5. 命令与结果汇总

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `corepack pnpm --filter @reactive-resume/tooling exec tsx review-nightly-ats.mts` | 0 | 修复后 JSON：99 分、无 cap、仅 2 个真实发现 |
| `corepack pnpm --filter @reactive-resume/tooling exec tsx release-acceptance-checks.mts` | 0 | ATS/日期矩阵/字体同源断言全过（`acceptance-checks.json`） |
| `corepack pnpm --filter @reactive-resume/tooling exec tsx ats-fix-verify.mts` | 0 | 修复后全检查状态清单 |
| `corepack pnpm --filter @reactive-resume/resume exec tsgo --noEmit` + vitest run（packages/resume） | 0 | 1390/1390 |
| `cd apps/web && vitest run draft.test.ts draft-recovery.test.ts` | 0 | 26+6 |
| `vitest run register.test.ts / locale-catalogs.test.ts` | 0 | 5 / 6 |
| `packages/fonts vitest run` / `packages/api vitest run crud+service+validation` / `packages/docx` / `markdown.test.ts` | 0 | 55 / 77 / 20 / 9 |
| `corepack pnpm typecheck` | 1 | 仅 tooling 包失败：复核者脚本 2 个既有错误（未修改该文件）；其余通过 |
| 浏览器：会话失效恢复/放弃/并发×2 轮/15 模板冒烟/390px/导出/深度检查 | — | 见第 1–4 节与 `release-blockers-evidence/` |

## 6. 新增数据/存储与兼容

- `localStorage` 键 `weekly-resume:unsaved-draft:{userId}:{resumeId}`：TTL 7 天、2MB 上限、读写全 try/catch（配额/禁用静默降级到既有内存保护）、损坏 JSON 读取即清、成功保存/放弃即清、不跨账号返回。回滚 = 移除 `draft-recovery.ts` 与 draft.ts 的 stash/恢复调用点。
- `expectedUpdatedAt` 为可选字段，不传行为与旧版完全一致（老客户端不受影响）；回滚 = 还原 dto/crud/service 三处。
- 本地字体清单是纯新增解析优先级；删除 `local-fonts.json` 即回滚到上游 URL 解析。public/fonts 71.6MB 会进入镜像与构建产物。

## 7. 未验证/残余

- 真实付费 LLM、生产 SMTP/S3、真实 DNS 阻断环境（改 hosts 超范围）、全部模板的多页长文矩阵（本轮为单页样例冒烟，多页仅抽测）。
- Agent 的重复 tool-call ID/流中断/超时等异常路径未逐一构造（mock 正常路径 + 审批/撤销/无效补丁路径在上一轮已验证）。
- 并发合并的"同单元双侧修改"仍为本地优先（见 1.2 残余限制）。
- `knowledge/china-job-rules` 保持未接入；未新增岗位检索功能；上线文案不得宣称。
