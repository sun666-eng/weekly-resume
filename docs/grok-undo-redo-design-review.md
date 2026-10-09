# 撤销、重做与 Agent 回退设计审查

审查开始：2026-09-27 15:51:52 +08:00。  
基线：分支 `main`，HEAD `a57d9d0a98446b5b484cff216db9b87f27b24ac0`，相对 `origin/main` ahead 9。  
工作区：`git status --porcelain` 315 条；其中已跟踪变更 199 条，未跟踪条目 116 条（未跟踪条目含目录占位，不是文件总数）。  
本轮只做静态阅读，没有运行测试，没有改业务代码。结论针对阅读时的工作区文件，见文末哈希。

## 1. 现状

编辑器撤销栈在 `apps/web/src/features/resume/builder/draft.ts`。

- `undoStack` / `redoStack` 只保存整份 `ResumeData` 快照，不含简历名称、slug、标签、公开、锁定、密码。
- 上限 `MAX_HISTORY_ENTRIES = 50`。超过后丢掉最旧的一步。
- 合并窗口 `HISTORY_COALESCE_MS = 500`。计时器 `historyLastEditAt` 和 `historyCanCoalesce` 是模块级变量，不是按字段、章节或简历 id 分开。
- 只有 `updateResumeData` 入栈。`patchResume`、`mergeResumeMetadata`、`replaceResumeDraft`、`replaceResumeFromServer` 不入栈。后两者在数据不同时清空栈。
- 撤销和重做走 `applyHistoryStep`，然后 `syncCurrentResume`，与普通编辑共用 500ms 防抖自动保存。
- 底部 dock（`dock.tsx`）有撤销、重做按钮，以及在非输入焦点时的 Mod+Z / Mod+Shift+Z / Ctrl+Y。
- 顶部 header 只有历史版本菜单（`version-history.tsx`），没有撤销和重做按钮。
- 服务端版本表由 `resumeService.versions` 写入。恢复走 `restore`，先快照当前数据，再 `update` 整份数据，客户端 `replaceResumeFromServer` 会清空本地撤销栈。
- Agent 应用补丁时在同一事务写入 `agentAction.snapshotData`（补丁前整份数据）和 `appliedUpdatedAt`。
- Agent 回退 `actions.revert` 用 JSON Patch `{ op: "replace", path: "", value: snapshotData }` 写回整份简历，并把同一线程、同一简历上 `appliedUpdatedAt` 不早于该动作的已应用动作标成 `rolled_back`。
- 乐观锁在 `applyResumePatchTx`：`SELECT … FOR UPDATE` 后用毫秒比较 `expectedUpdatedAt`。回退传入的是**最新已应用动作**的 `appliedUpdatedAt`，不是“当前简历仍等于该快照之后的状态”。
- 冲突时把该动作标成 `conflicted`。`agent-chat.tsx` 在 `conflicted` 时禁用 Restore。没有重新应用接口。

## 2. 几种操作不是同一件事

| 操作 | 实际语义 | 界面说法 |
| --- | --- | --- |
| 编辑器撤销一步 | 弹出一份整文档快照，再自动保存 | dock「Undo」 |
| 编辑器重做 | 相反方向移动快照 | dock「Redo」 |
| 历史版本恢复 | 服务端整份替换为某一版，并另存“Before restore” | 「Restore this version?」说明会重置编辑器撤销栈 |
| Agent Restore | 若版本戳仍等于该线程最后一次 Agent 写入，则整份回到该动作之前，并连带把之后的 Agent 动作标为已回退 | 按钮文案是「Restore」，不是“只撤销这一处字段” |

整份恢复本身不是缺陷。缺陷是入口没有说明会丢掉该快照之后的全部字段，以及版本一对不上就被永久标成冲突。

## 3. 时序

普通编辑：

1. `updateResumeData` 立刻改内存并标记 `saving`。
2. `syncResume` 防抖 500ms 后 `queueResumeSave`。
3. `flushResumeSave` 带 `expectedUpdatedAt = runtime.baseUpdatedAt` 调用 `resume.update`。
4. 响应返回时，若内存数据仍等于本次提交，只 `mergeResumeMetadata`（更新 `updatedAt` 等），不替换 `data`。
5. 若内存已经不同且没有排队的更新，把当前内存放进 `pendingResume`，在 `finally` 里再保存。

因此“晚到的保存响应把撤销结果盖回去”在数据字段上有保护：`draft.ts` 276–292 行不把提交体写回 store。未运行验证。

仍有缺口：响应会 `markRuntimeSynced`，把 `baseData` 设成刚保存的那一版。若用户已撤销，本地是旧快照，基线却是撤销前那次写入。随后的保存靠新的 `updatedAt` 再写回撤销结果，逻辑上能接上，但没有测试覆盖“保存在途时撤销，延迟响应之后刷新”。

版本恢复不传 `expectedUpdatedAt`（`service.ts` `restore` 调用 `update` 时没有该字段）。另一标签页或在途自动保存可以后写覆盖恢复结果，或恢复覆盖更新的标签页。这是静态确认的竞态，未运行。

## 4. 发现

### UR-1 Agent 回退是整份替换，且后续任意保存会使回退永久冲突

> 2026-09-27 16:28 Codex 反证复核：P0「已保存电话被静默覆盖」撤回；整份恢复与单次字段撤销分开。见文末「修订」与 `docs/grok-review-corrections.md`。

- 优先级：P0。类型：现有缺陷。证据：本轮静态确认。
- 影响：撤销 Agent 对项目描述的修改时，不能保留用户后来改的电话。若用户已经自动保存过，回退直接失败，并且不能再点。
- 位置：`packages/api/src/features/agent/service.ts` `actions.revert`（约 1477–1573 行）；`packages/api/src/features/resume/service.ts` `applyResumePatchTx`（约 136–138 行）；`apps/web/src/routes/agent/-components/agent-chat.tsx` `revertDisabled`（约 272–274 行）。
- 调用：Restore → `actions.revert` → `patchInTransaction` 替换 path `""` → 期望时间等于**最新** Agent 动作的 `appliedUpdatedAt`。不等则 `RESUME_VERSION_CONFLICT`，该行 `status` 改为 `conflicted`。再次调用时 `status !== "applied"` 直接返回，不再尝试。
- 复现（虚构）：简历电话 `13800000000`。Agent 把项目 A 描述改成 “built billing”。用户把电话改成 `13900000000` 并等自动保存。再点该 Agent 卡片的 Restore。
- 预期（产品要求）：只恢复项目 A 描述，电话保持 `13900000000`。若同一字段后来也被人改过，应显示冲突且两边数据都还在。
- 代码路径上的实际结果：保存已推进 `resume.updatedAt`，与 `latestAction.appliedUpdatedAt` 不同，回退抛冲突并标记 `conflicted`。按钮禁用。电话和项目都保持用户保存后的状态，但 Agent 修改无法再撤销。若在没有任何后续保存时回退成功，`replace` 整份快照会丢掉该快照之后的电话修改；同线程更晚的 Agent 动作也会被标成 `rolled_back`。
- 根因：回退保存的是整份 `snapshotData`，写入条件却绑定“最后一条 Agent 写入的时间”，不是“只逆转这一条补丁，并三方合并其余字段”。
- 反证：`expectedUpdatedAt` 能阻止静默覆盖更新的简历，这点保护是有的。它不够，因为它把“有后续编辑”当成不可恢复的冲突，而不是字段级合并。`mergeResumeVersions` 没有被这条路径调用。
- 未运行：没有调用 API，没有确认 `jsonpatch.validate` 是否接受 `path: ""`。`packages/resume/src/patch.ts` 使用 `fast-json-patch`；RFC 6902 允许空路径替换整文档。Codex 应用一条真实补丁再回退才能确认库接受该操作。
- 修复方向：对单条 Agent 动作做逆补丁或按路径三方合并；后续不同路径的用户编辑保留；同一路径报告冲突并保留双方值。`conflicted` 应可重试或提供“仍恢复到该快照”的显式整份恢复。成功回退后要有单独的再应用记录，不要只改状态。
- 回归：连续两个 Agent 补丁只撤最新一条；撤较早一条时明确列出将被一并撤下的后续动作；回退与另一标签页保存交错。

### UR-2 500ms 合并不区分字段

- 优先级：P1。类型：设计缺口。证据：本轮静态确认。
- 影响：短时间内改电话再改邮箱，撤销会同时撤掉两者。模板切换若在 500ms 内还改了别的字段，也会并成一步。
- 位置：`draft.ts` `updateResumeData`，约 673–689 行。模块变量约 103–104 行。
- 现有测试 `draft.test.ts` “coalesces rapid edits”只连续改 `basics.name`，没有跨字段用例。该测试锁定了“同字段连打应合并”，与跨字段要求不矛盾，但没有防止跨字段合并。
- 复现：初始化后立刻 `updateResumeData` 改 `basics.phone`，50ms 内再改 `basics.email`。`undoStack.length` 预期为 2，按现实现为 1。撤销后电话和邮箱一起回到旧值。
- 无实际变化也会入栈：`updateResumeData` 不比较前后数据。重复把同一值写回去，在合并窗口外会占一步。优先级 P2，并入本条，不单独立项。
- 反证：撤销后 `resetHistoryRuntime`，下一次编辑不会再并进上一步。这不能阻止两个不同字段在窗口内合并。
- 修复方向：合并键至少包含变更路径集合。同一路径的连续输入合并；路径集不同则新开一步。写入后 `isEqual` 无变化则不入栈、不刷新合并时钟。模板与布局、照片与 `picture` 显示字段若同一次调用改完，自然是一步。
- 兼容：现有“快速连改姓名只产生一步”的测试必须仍然通过。

### UR-3 历史版本恢复没有乐观锁

> 2026-09-27 16:28 Codex 反证复核：保留 P1，窗口缩小为 `getById` 与无戳 `update` 之间。恢复完成后的旧戳自动保存会被挡住。见文末「修订」。

- 优先级：P1。类型：现有缺陷。证据：本轮静态确认。
- 位置：`service.ts` `versions.restore` 约 417–450 行。`update` 只在传入 `expectedUpdatedAt` 时比较，约 640–641 行。客户端 `version-history.tsx` `handleRestore` 不传该字段。
- 影响：恢复请求与在途自动保存、另一标签页保存互相覆盖。恢复前虽写了 “Before restore” 快照，但后到的全量 `update` 仍能盖掉恢复结果。
- 复现：标签页 A 正在防抖保存电话 “139”。标签页 B 恢复到不含该电话的旧版。若 B 的 `update` 不带期望时间，谁后提交谁留下。
- 反证：恢复前会 `snapshot` 当前数据，所以旧内容多半还在版本列表里，不是唯一副本丢失。这不等于当前文档不会被盖错。
- 修复方向：`restore` 使用读取到的 `current.updatedAt` 作为 `expectedUpdatedAt`。冲突时不要写入，提示刷新。客户端恢复成功后的 `replaceResumeFromServer` 已会清空撤销栈，这点与提示文案一致。

### UR-4 外部数据变化清空全部本地撤销

> 2026-09-27 16:28 Codex 反证复核：「未保存编辑被整份覆盖」撤回。清栈缩小为 P2 取舍，禁止只建议保留旧栈。见文末「修订」。

- 优先级：P1。类型：设计缺口。证据：本轮静态确认。
- 位置：`replaceResumeFromServer`，约 608–628 行。`isEqual(current.data, resume.data)` 为假则清空两栈。
- 影响：用户本地还有未撤销的手动编辑时，Agent 补丁或另一标签页的保存事件会使这些步骤全部消失。不是用快照覆盖新字段，而是直接丢掉撤销能力。自动保存回声若数据相同则保留栈，`draft.test.ts` 有对应用例。
- 反证：相同数据的回声不会清栈。不同数据一律清栈，没有按路径合并历史。
- 修复方向：仅当本地没有 `hasPendingLocalChanges` 时清栈；有待保存编辑时走已有的 `mergeResumeVersions`，冲突停在 `saveConflict`，不要先丢栈。

### UR-5 撤销入口与产品目标不一致，Agent 回退后不能再应用

- 优先级：P2。类型：设计缺口。证据：本轮静态确认。
- 顶部没有撤销、重做。二者在底部 `dock.tsx` 约 86–87 行。历史版本在 header。
- Agent 卡片只有 Restore。`rolled_back` 与 `conflicted` 都禁用按钮。代码中没有 reapply。
- 一次 Agent 请求里的多个 `applyResumePatch` 各插一行 `agentAction`，没有请求级分组 id。撤销较早一条会因 `gte(appliedUpdatedAt)` 把更晚的动作一起标回退。
- 任务仍在跑时没有单独的“撤销已落地的部分工具、取消未完成工具”状态机。未再展开 `runs.ts` 的取消路径，标为未完全审查。

### UR-6 输入框原生撤销与简历撤销分工不完整

- 优先级：P2。类型：待验证疑点。证据：静态确认焦点判断；IME 行为未运行。
- `isEditableElementFocused`（`draft.ts` 125–135 行）在 INPUT、TEXTAREA、SELECT、`isContentEditable`、CodeMirror 上把 Mod+Z 让给浏览器。dock 按钮仍执行整份简历撤销，即使光标在字段里。
- 富文本若在每次 `onChange` 调用 `updateResumeData`，则浏览器撤销一步之后，简历栈里可能还有合并过的大步。中文 IME 组合期间若 `onChange` 多次提交，500ms 合并通常收成一步，但组合取消、上屏重复没有专门处理。未运行。
- 修复方向：组合输入期间不要入栈；dock 在字段聚焦时撤销的是简历上一次已提交快照，需要在按钮提示里写明，避免用户以为只撤一个字。

## 5. 分阶段建议

第一期（复用现有栈和 `expectedUpdatedAt`）：

1. 合并键改为路径集合；无变化不入栈。
2. Agent 回退改为逆操作或三方合并，禁止用 path `""` 替换整份文档来实现“撤销这一次”。
3. `conflicted` 可重试；整份恢复单独按钮并写明范围。
4. `versions.restore` 带上读取时的 `updatedAt`。

必要的数据结构：

- `agentAction` 增加 `groupId`（一次模型回合）和 `inverseOperations` 或补丁前后路径值。
- 不要把公开、锁定、密码放进普通撤销栈。名称和标签若要撤销，用单独的元数据栈。

后续：

- 顶部同时放撤销、重做、历史版本。
- 回退后写回模型可读的当前文档，避免模型按旧数组下标继续改。`applyResumePatch` 的返回值已经带整份 `resume`，回退路径没有对等的“请按这份文档继续”推送。这是 UR-1 的附带缺口。

## 6. 验收标准

1. 500ms 内改两个不同字段，撤销只撤后一个。同字段连续输入仍是一步。
2. 手动改电话 → Agent 改项目 → 手动改邮箱 → 撤销 Agent，只有项目描述回到 Agent 之前，电话和邮箱保留。
3. 两方改同一项目字段，撤销返回冲突，服务端数据不变，用户可见两边的值。
4. 保存请求未返回时撤销，响应对应旧正文时刷新，看到的是撤销后的正文。
5. 恢复历史版本与另一标签页保存冲突时，不覆盖较新的 `updatedAt`。
6. 拖拽排序后撤销，条目按 id 回到原顺序，文本不串到别的条目。
7. 撤销两个 Agent 动作时，界面说明第二个是否被一并撤下；版本时间与 `agentAction.status` 一致。

---

## 修订（2026-09-27 16:28 Codex 反证复核）

正文 15:51 结论保留。本轮只读代码，未运行。详细调用链与最小验证见 `docs/grok-review-corrections.md`。14 个源文件哈希与开始审查时相同。

**UR-1**

- 原：P0，整份快照会丢掉后来改的电话；任意后续保存导致永久 `conflicted`。
- 反证：`expectedUpdatedAt` 用的是当前仍 applied 的最新动作的 `appliedUpdatedAt`。用户已保存的电话会推进 `resume.updatedAt`，回退抛 `RESUME_VERSION_CONFLICT`，文档不被覆盖。`path: ""` 在 `packages/resume/src/patch.test.ts` 有根替换用例（未跑）。确认框已说明会回退该 patch 及之后的 patch。
- 连续撤两条：先撤最新一条会推进 `resume.updatedAt`；再撤较早一条时 `latestAction.appliedUpdatedAt` 仍是旧戳 → 冲突。`conflicted` 后 `status !== "applied"` 直接返回，不能重试。
- 未保存电话 + Restore：订阅在 `hasPendingLocalChanges` 时不 `replaceResumeFromServer`，也不 `markRuntimeSynced`。随后保存带旧戳，静态上更可能 409 后走 `mergeResumeVersions`，而不是把 Agent 正文再写回。未跑。
- 修订：撤回「已保存电话被静默覆盖」的 P0。整份恢复与单次字段撤销分开。不能再 Restore / 不能重试 / 先新后旧连撤冲突保留为 P1。未保存交错待运行验证。

**UR-3**

- 原：恢复不带乐观锁，与自动保存互相覆盖。
- 反证：恢复前会快照「Before restore」。恢复**完成之后**赶到的带旧戳 `resume.update` 会被挡住并走冲突恢复。未保护窗口是无锁 `getById` 与无戳 `update` 之间；窗口内保存可能被节流跳过而不进版本表。
- 修订：保留 P1，缩小触发条件。不要写成恢复从不保留当前数据。

**UR-4**

- 原：远端变化清栈，未保存编辑的撤销步骤丢失；建议有未保存编辑时不清栈。
- 反证：生产调用只有历史恢复、失焦延迟应用、订阅三条。`hasPendingLocalChanges` 时订阅只合并元数据。`draft.test.ts` 已有「pending 不覆盖」和「回声保留栈 / rebase 清栈」。不清栈再撤销会用 rebase 之前的整份快照盖掉远端修改。
- 修订：撤回「未保存编辑被整份覆盖」。清栈缩小为 P2 取舍。禁止只建议保留旧栈。历史恢复清栈是有文案的预期行为。

**UR-2 / UR-5 / UR-6**：本轮未作为 Codex 反证重点，结论未改。
