# 发布候选独立复核：仍不放行

日期：2026-09-26。本次对象是当前本地工作区及 GLM 的 `release-blockers-fix-report.md`、`release-candidate-review-handoff.md`。没有部署、提交或推送；没有重新执行完整浏览器端到端。

## 结论

**不接受“三大发布阻塞全部关闭”和“无内容丢失路径”的结论。** 原中文 ATS 样例修复已独立确认，但新增冲突合并和草稿备份仍存在可复现的内容丢失，字体清单也产生了可选字重与可用资源不一致的回归。

本轮运行实际保存模块的 5 个对抗性测试，**5 个均未满足预期**。它们使用原 autosave 测试相同的 oRPC mock，通过公开 store 操作触发实际保存/冲突/卸载逻辑，不是复制合并算法另行测试。分别覆盖两种章节合并、最新草稿备份、跨标签备份覆盖、损坏草稿读取。

## 已核实的进展

- 原中文 PDF 经独立脚本重跑：299 个汉字保留，`isEnglish=false`，99 分，无 cap；只剩 UNTAGGED_PDF 与 NO_BULLET_POINTS。修复结果属实，分数只代表此样例，不代表所有中文 PDF。
- 既有 `draft.test.ts`、`draft-recovery.test.ts`、`register.test.ts`、`locale-catalogs.test.ts` 共 43 个测试通过。
- 新增中文 ATS 测试 10 个通过。
- `http://127.0.0.1:3100/api/health` 返回 200。
- 上轮由我新增的 `tooling/review-nightly-ats.mts` 确有两处类型错误：DOCX zip 条目可空、汉字统计参数缺类型。本轮已修正，未改业务代码。
- 修正后 `corepack pnpm typecheck` 退出 0，19/19 成功，其中 14 项缓存命中。不能再把 tooling 错误列为当前遗留阻塞。

## 必须修复的发现（按优先级）

### 1. [P1] 冲突合并会丢本地新增章节，并使已删除章节复活

位置：`apps/web/src/features/resume/builder/draft.ts:360`，`mergeResumeVersions` 的 customSections 分支。

实现只 `serverValue.map(...)`。本地独有的新 id 根本不会遍历；本地已经删除的 id 在 `!localSection` 时直接保留服务器条目。

实际测试：

| 操作 | 应得 | 实得 |
| --- | --- | --- |
| 空 base；A 新增 local-new，B 新增 remote-new；A 遇 409 后重试 | local-new + remote-new | 仅 remote-new，本地新增丢失 |
| base 有 delete-me；A 删除它，B 新增 remote-new；A 遇 409 后重试 | 仅 remote-new | delete-me + remote-new，删除复活 |

这是**不同章节的独立改动**，不属于报告承认的“同单元双侧修改，本地优先”。修复应按 base/local/server 的 id 并集处理新增、删除、修改与顺序；删除和远端修改发生冲突时明确提示/保留可恢复版本，不静默裁决。

### 2. [P1] 卸载备份可能落后一笔，最新可见内容未保存

位置：`apps/web/src/features/resume/builder/draft.ts:203`，`stashRecoverableDraft` 使用 `runtime.pendingResume?.data ?? current.data`。

复现时序：

1. 第一次修改 `first-in-flight` 已进入慢保存请求。
2. 第二次修改 `second-queued` 已经过 debounce，成为 pendingResume。
3. 第三次修改 `third-visible` 已显示在编辑器，但尚未经过 debounce。
4. 触发 beforeunload。

预期备份 third-visible，实际备份 **second-queued**。随后 flush 不能保证卸载前完成网络保存，所以恢复最后内容的保障不成立。

修复应备份当前用户看到的最新 store 版本，并用修改序号/版本协调队列；保存旧请求成功不得清除更新草稿的备份。需要覆盖慢请求、连续输入、卸载和失败重试。

### 3. [P1] 未编辑的标签关闭，也能覆盖另一标签的未保存草稿

位置：`apps/web/src/features/resume/builder/draft.ts:433` 的无条件 stash；`draft-recovery.ts` 的共享 userId+resumeId 键；`draft.ts:276` 的无条件清除也应一并检查。

实际测试模拟相同账号/简历已有另一标签存下的 `other-tab-unsaved`，当前标签保持服务器旧版本且没有编辑。当前标签触发 beforeunload 后，storage 中的待恢复内容变成了旧版本（本测试为空姓名），另一标签未保存内容被覆盖。

userId+resumeId 只解决账号/简历区分，**不能区分标签和写入版本**。修复至少需要：

- clean 标签不落盘；
- 按编辑实例/版本保存与清理，旧请求成功不清除其他标签或更新版本的草稿；
- 多份候选草稿的恢复选择明确；
- 主动退出、正常离页、鉴权跳转、卸载分别验证；
- 如继续使用共享键，提供经过竞争测试的版本条件写/清理策略，不能只增加时间比较就声称无竞态。

### 4. [P1] 本地字体分支使 UI 仍可选的字重找不到资源

位置：`packages/fonts/src/index.ts:188`；选项来自 `apps/web/src/components/typography/combobox.tsx` 的 `getFont(...).weights`；注册路径 `packages/pdf/src/hooks/use-register-fonts.ts:254` 遇空 source 直接返回。

独立执行 getFont 与 getWebFontSource，得到：

| 字体 | UI 仍提供但解析返回 null 的字重 |
| --- | --- |
| IBM Plex Serif | 100、200、300 |
| Noto Sans SC | 100、200、300、800、900 |
| Noto Serif SC | 200、300、500、600、800、900 |
| Noto Sans | 100、200、300、500、600、800、900 |

因为命中本地字族后直接返回本地资源或 null，上游原有字重也不再可用。这会造成选择与实际渲染字重不一致；具体是回退为其他字重还是某些排版失败，需继续以真实渲染覆盖，不能凭 null 断言每种情况都崩溃。

修复应统一资源清单、可选字重、注册、旧简历解析与明确回退。普通、粗体和斜体都要验证。允许可靠映射到已交付字重，但不能悄悄忽略用户选择。

此外，Roboto 等非内置字体仍返回 gstatic URL，界面仍可选择全部字体。默认样例 0 Google 请求不能关闭全部字体可用性问题。无需修改宿主机 hosts：可用隔离浏览器网络拦截做真实请求失败测试。覆盖新开上下文、禁用缓存与所有支持的选择。

### 5. [P2] “损坏即清”的草稿验证不足

位置：`apps/web/src/features/resume/builder/draft-recovery.ts:35`、`:100`。

独立测试写入语法合法但 `data:null`、`savedAt:"invalid"` 的 JSON，`loadRecoverableDraft` 返回该对象而非 null：`typeof null === "object"` 通过验证；非法日期产生 NaN，TTL 比较为 false。

这类对象进入恢复流程可能造成数据访问错误。应验证 ResumeData、存储格式版本、日期有效性与尺寸；异常存储访问要在受保护路径内，返回可解释的备份失败状态。不能只 catch JSON.parse 就认为所有损坏数据已覆盖。

### 6. [P2] 恢复界面的“当前服务器时间”显示了错误值

位置：`apps/web/src/routes/builder/$resumeId/route.tsx:114`。

界面文案说服务器当前版本的保存时间，渲染的却是 `recovery.baseUpdatedAt`，即草稿基于的旧版本时间，而不是最新加载的 `resume.updatedAt`。其他标签/设备已经更新后，用户看到的对比会误导其恢复选择。

同时，恢复动作替换整份 ResumeData，并基于当前版本保存。若服务器自草稿产生后已有新内容，用户必须清楚这是覆盖还是合并；仅显示两个旧时间不足以表明冲突。修正三类时间（草稿保存、草稿基线、当前服务器）的语义并补 UI 回归。

### 7. [P2] release-acceptance-checks 是采集器，不是失败会阻断的验收脚本

位置：`tooling/release-acceptance-checks.mts:99` 及前面的结果构造。

脚本计算 `noFalseSectionMissing`、`matchesExpectation`、`allLocalAreSameOrigin` 等布尔值后只写 JSON 和 console.log，没有 assert/throw/非零退出。因此即使逻辑检查返回 false，仍可退出 0，不能把“退出码 0”记成“断言全通过”。日期期望还未比较 endMonth。

需要显式断言关键布尔与数值；故意破坏一个预期时应以非零退出。当前脚本没有浏览器会话恢复、并发或模板 UI 自动化，不能替代这些 E2E 的可重跑交付。

## 可重复证据与命令

目录：`docs/release-independent-review-evidence/`。

- `adversarial-results.json`：5 个失败的完整 Vitest 结果。
- `release-review-adversarial.test.ts.txt`：完整对抗测试源（复用原测试 mock 基础）。
- `font-source-check.json`：真实字体函数返回值。
- `font-source-check.mts.txt`：字体检查源。
- ATS 重跑：`docs/nightly-review-evidence/ats-node-review-after-fix.json`。

对抗测试临时放入原 builder 测试目录运行，结束后已删除临时 `.test.ts`，以 `.txt` 保存证据，避免把预期失败的审查用例不加说明混入日常套件。

仓库根目录重放：

```powershell
Copy-Item -LiteralPath docs/release-independent-review-evidence/release-review-adversarial.test.ts.txt -Destination apps/web/src/features/resume/builder/release-review-adversarial.test.ts
corepack pnpm --filter web exec vitest run src/features/resume/builder/release-review-adversarial.test.ts
```

将其转为正式回归时，整理未使用的 mock/helper，并在修复后要求全部通过。不要删除不方便通过的断言。

本轮通过命令：

```powershell
corepack pnpm --filter web exec vitest run src/features/resume/builder/draft.test.ts src/features/resume/builder/draft-recovery.test.ts src/features/auth/pages/register.test.ts src/libs/locale-catalogs.test.ts
corepack pnpm --filter @reactive-resume/resume exec vitest run src/ats-pdf/chinese-ats.test.ts
corepack pnpm --filter @reactive-resume/tooling exec tsx review-nightly-ats.mts
corepack pnpm typecheck
```

## 尚未重新验证的范围

本轮没有完整浏览器重跑、真实请求阻断、全部多页模板矩阵、全量 web 套件、真实 LLM/SMTP 或生产验证。健康接口可用不证明当前脏工作区与镜像 32a5bfd0ae24 完全一致。没有源码内容摘要的“工作区+报告清单”仍不能唯一标识候选构建。

原报告把“同合并单元本地优先”归为限制，但 UI 只提示已同步另一标签，未展示具体冲突或保留双方版本；同章节不同条目的编辑也应覆盖。`recoverFromVersionConflict` 拉取失败时的错误收敛、组件 cleanup 路径没有直接 stash 等也需补故障测试，本轮不将未运行的故障时序计入 5 个已复现失败。

## 给 GLM 的下一轮要求

1. 先读本文件，重跑并接受 5 个失败，不再从默认成功样例出发。
2. 修复第 1–3 项，保证不同自定义章节和不同标签的草稿不会被静默覆盖；为同单元冲突保留可恢复内容/明确选择。
3. 修复字体资源与可选项不一致，完成真实网络请求阻断；保留老简历可恢复的字体行为。
4. 修复草稿有效性、恢复时间语义、验收脚本 fail-fast。
5. 把新增失败用例变成正式回归，再运行既有套件、类型检查和最终同一镜像的浏览器验收。
6. 更新两份发布报告：区分已复现通过、代码推断、未测试；不得继续使用“无内容丢失路径”。保留原证据和此复核，不覆盖历史失败结果。
7. 记录最终源码摘要和镜像标识，仍保持未提交、未推送、未部署，修复后再次交回审查。
