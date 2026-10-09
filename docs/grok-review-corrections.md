# 审查修订（针对 Codex 反证）

复核时间：2026-09-27 16:28:27 +08:00。  
依据：工作区源码（14 个原审查文件 SHA256 前 16 位与 15:51 基线相同）+ 本仓库安装的 `@tanstack/query-core@5.103.1`（`node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/mutationObserver.ts`、`mutation.ts`）。  
本轮只读代码与已有测试文本。未运行测试、未上传、未调用 Agent、未改业务代码。未运行的场景不写成已复现。

原四份报告正文保留。本文件是修订结论；原报告文末有对应修订节。

---

## PH-1 上传回调

### 原结论

没有请求序号，连续上传 A、B 时若 A 后返回，`onSuccess` 会把 `picture.url` 写成 A。P1 现有缺陷。原报告把 persist 写成 `useMutation` 的 hook 配置回调。

### 新发现的保护或反证

照片写入发生在 **per-call** `mutate(file, { onSuccess })`，不是 `useMutation({ onSuccess })`。

```505:571:apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/picture.tsx
	const { mutate: uploadFile } = useMutation(orpc.storage.uploadFile.mutationOptions({ meta: { noInvalidate: true } }));
	const { mutate: deleteFile } = useMutation(orpc.storage.deleteFile.mutationOptions({ meta: { noInvalidate: true } }));
	// ...
	uploadFile(file, {
		onSuccess: ({ url }) => {
			const normalizedUrl = normalizePictureUrl(url, appOrigin);
			form.setFieldValue("url", normalizedUrl);
			persist({ ...form.state.values, url: normalizedUrl });
		},
	});
```

`useMutation` 只传了 `mutationOptions({ meta: { noInvalidate: true } })`，没有把 `persist` 挂在 hook 配置上。删除走**另一条** `deleteFile` mutation（独立 `MutationObserver`）。

TanStack Query 5.103.1 中，`MutationObserver.mutate(variables, options)` 会：

1. 把 per-call 的 `onSuccess` 写入观察者的**单一槽** `#mutateOptions`（后一次覆盖前一次）；
2. 对当前 `Mutation` 调用 `removeObserver`，再 `build` 一个新 `Mutation` 并挂上自己。

`Mutation.execute` 在 `#dispatch({ type: 'success' })` 之前仍会 `await this.options.onSuccess`（hook 配置）。当前照片代码没有 hook 级 persist。`#dispatch` 只通知**仍挂在该 Mutation 上的**观察者。`#notify` 里 per-call 回调还要求 `hasListeners()`。

因此：A 的 HTTP 可以完成、文件可以进存储，但第二次 `mutate` 之后 A 的 per-call `persist` 不会跑。没有请求序号**不能**单独作为「A 晚到仍会写入简历」的证据。

分场景（静态推断，未跑）：

| 场景 | A 的 per-call persist 是否仍执行 | 说明 |
| --- | --- | --- |
| 连续上传 A 再 B | 否 | 第二次 `mutate` 覆盖 `#mutateOptions` 并从 A 卸下观察者。最终 URL 应为 B。A 的文件成为未引用存储对象 |
| 上传中删除 | 是 | `deleteFile` 不调用 `uploadFile`，上传观察者仍挂在 A 上。删除已 `persist` 空 `picture`，晚到的成功会把 URL 写回 |
| 裁剪尚未完成时再选图 | 默认裁剪路径：尚未上传，只替换 `cropState`；旧 `blob:` 只在 `closeCropDialog` 里 `revoke`，可能泄漏。`fit === "contain"` 时等同连续上传。对话框打开时 hidden `input` 仍在 DOM，能否再次触发未验证 |
| 组件卸载 | 否 | `onUnsubscribe` 卸观察者；`#notify` 要求 `hasListeners()`。请求仍会完成，只是不写简历 |

若以后把 persist 改到 hook 配置 `onSuccess`，A 晚到又会写入，因为 `execute` 无条件调用 `Mutation.options.onSuccess`。

已有 e2e `tests/e2e/specs/picture-upload.spec.ts` 覆盖单次裁剪上传与刷新后 URL，不覆盖 A/B 迟到或上传中删除。

### 修订结论

- 连续上传 A 晚到覆盖 B：**撤回**作为已确认缺陷。静态上 per-call 回调会被卸掉。
- 上传中删除、晚到成功写回 URL：**缩小触发条件后保留**，P1。
- 被后一次上传取消的 A 仍写入存储：**缩小**为未引用文件，P2。
- 卸载后孤儿文件：同上，P2，不是错误照片写进简历。
- 裁剪中再选图：**待运行验证**交互能否发生；默认裁剪路径不二次上传。

### 对应代码位置与调用链

`onUploadPicture` / `onConfirmCrop` / Skip and Upload → `uploadPictureFile` → `uploadFile(file, { onSuccess: persist })` → `MutationObserver.mutate` → 新 `Mutation.execute` → 成功时仅当前观察者 `#notify` → `persist` → `updateResumeData`。  
删除：`onDeletePicture` → `deleteFile({ filename })`（另一 observer）+ `persist(defaultResumeData.picture)`。

### 尚需最小验证

1. 两个 `uploadFile` 重叠，先完成 B 再完成 A，断言 `picture.url` 是 B（静态预期通过，作回归）。
2. 上传未返回时点删除，再放行上传成功，断言 `picture.url` 仍为空（静态预期失败）。

不要用真实用户照片。

---

## UR-1 Agent 回退

### 原结论

P0：Restore 用整份 `snapshotData` 覆盖；用户后来改的电话会丢；任意后续保存会把动作标成永久 `conflicted`。把「产品要求的单次字段撤销」和「现有整份恢复」算成同一条静默丢数据缺陷。

### 新发现的保护或反证

必须拆开三类后续修改，以及「现有整份恢复」与「新增单次撤销」。

确认对话框已经写明整份语义（`agent-chat.tsx` 约 1062–1064 行）：「Restore the resume to before this patch?」「This will roll back this patch and any patches applied after it.」这不是字段级撤销的说明，但说明入口按整份恢复设计。

`path: ""` 替换：`packages/resume/src/patch.test.ts` 已有用例 `supports replacing the root document`。本轮读了测试文本，未执行。

**已保存的用户修改。** `actions.revert` 的 `expectedUpdatedAt` 是该线程该简历**当前仍为 applied 的最新动作**的 `appliedUpdatedAt`（`service.ts` 1498–1523 行）。`applyResumePatchTx` 在 `SELECT … FOR UPDATE` 之后比较 `existing.updatedAt`（136–138 行）。`resume.updatedAt` 有 `$onUpdate`（`packages/db/src/schema/resume.ts`）。用户自动保存会推进时间戳，与该戳不等，抛 `RESUME_VERSION_CONFLICT`。catch 把该动作写成 `conflicted`，**不会**把快照写进当前文档。已保存的电话不会被静默盖掉。这是原 P0 作为「静默丢已保存电话」的反证。

**未保存的本地修改。** 服务端若仍停在 Agent 写入的 `updatedAt`，回退可以成功。`useBuilderResumeUpdateSubscription` 只挂在 `apps/web/src/routes/builder/$resumeId/route.tsx`。构建器内嵌 `AgentChat`（`ai-assistant.tsx`），Restore 时订阅通常活着。`hasPendingLocalChanges` 为真时只 `mergeResumeMetadata`，**不** `replaceResumeFromServer`，也**不** `markRuntimeSynced`。`mergeResumeMetadata` 只改 store 上的 `updatedAt` 等元数据，不改 `runtime.baseUpdatedAt` / `runtime.baseData`。随后 `flushResumeSave` 仍带旧的 `expectedUpdatedAt`，与回退后的新戳不等，走 `RESUME_VERSION_CONFLICT` → `recoverFromVersionConflict` → `mergeResumeVersions(baseData, local, server)`。

对该路径的静态推演（未跑）：

- `baseData` = 上次同步的 Agent 文档
- `local` = Agent 文档 + 未保存电话
- `server` = 该动作之前的快照（项目描述已撤，电话仍是旧值）
- 电话：local ≠ base，server = base → 保留 local 电话
- 项目描述：local = base（用户没改项目），server 为快照 → 采用 server（即撤掉 Agent 项目改动）

因此「未保存电话 + Restore」更像是冲突恢复后的三方合并（电话留下、Agent 项目被撤），而不是「自动保存把 Agent 正文再写回去」。后者需要回退之后仍带着匹配戳把 local 整份写成功；当前 `flushResumeSave` 在有 `baseUpdatedAt` 时总会带期望时间。仍待运行验证。不要把这条写成已复现的数据丢失。

**后续 Agent 修改。** 回退较早一条时，`gte(appliedUpdatedAt, action.appliedUpdatedAt)` 把更晚的 applied 动作一并标 `rolled_back`，文档换成**较早那条之前**的整份快照。这是现有「恢复到该动作之前」语义。一次点较早那条、且中间没有用户保存时，可以一次撤掉两条。

**连续撤两条（先新后旧）。** 先撤最新一条：文档回到第二条之前，第二条 `rolled_back`（其 `appliedUpdatedAt` 被写成这次恢复的新时间，但状态已不是 applied），第一条仍 `applied` 且保留**旧的** `appliedUpdatedAt`。此时 `resume.updatedAt` 已是恢复新时间。再撤第一条：`latestAction` 是第一条，`expectedUpdatedAt` 仍是第一条旧戳，与当前 `updatedAt` 不等 → 冲突并 `conflicted`。版本戳**不能**按「先新后旧连点两次 Restore」衔接。

**conflicted 后。** `if (action.status !== "applied") return toAction(action);`（1487 行）。客户端 `revertDisabled` 含 `status === "conflicted"`。不会再次尝试写入。不能重试。

### 修订结论

- 将「现有整份恢复」与「产品新增的单次字段撤销」分开。前者在版本戳仍等于最后一次 Agent 写入时按设计工作；后者未实现，属于设计缺口。
- P0 静默覆盖**已保存**电话：**撤回**。版本校验挡住了这条路径。
- 已保存后续编辑后无法再 Restore、且 `conflicted` 不能重试：**保留**，降为 **P1** 产品缺口（乐观锁按整份冲突处理，没有字段级重试）。
- 未保存本地编辑与 Restore 交错：**缩小**为待运行验证。静态上更可能走三方合并而不是整份把 Agent 改动写回；不是已复现的电话丢失。
- 一次 Restore 较早动作会连带撤掉之后的 Agent 动作：**保留为现有整份语义**。确认框已说明会回退之后的 patch。相对产品「只撤这一处字段」仍是 P2 说明/能力缺口，不是静默字段丢失。
- 先撤新再撤旧会冲突：**保留**，P1，静态确认调用链，未运行。

### 对应代码位置与调用链

构建器内 `AgentChat` Restore → `orpc.agent.actions.revert` → `actions.revert` → `resumeService.patchInTransaction`（`replace` path `""`，`expectedUpdatedAt: latestAction.appliedUpdatedAt`）→ 成功则 `notifyResumePatched`（`mutation: "patch"`）→ 构建器 `useBuilderResumeUpdateSubscription` → 有未保存编辑则 `mergeResumeMetadata`，否则 `replaceResumeFromServer`。冲突则动作 `conflicted`，文档不变。

独立 `/agent` 路由不挂该订阅；离开构建器时 `cleanupRuntime` 会 `stashRecoverableDraft` 并 `syncResume.flush()`。

### 尚需最小验证

用假用户插入两条 `resume_patch`（不要真模型）：

1. 第二条之后再 `resume.update` 改电话，Restore 第二条 → 期望 `conflicted`，当前电话不变。
2. 不改用户字段，Restore 第二条 → 期望文档等于第二条之前的快照，第一条仍 applied。
3. 在 2 之后 Restore 第一条 → 期望 `conflicted`。
4. 不改用户字段，直接 Restore 第一条 → 期望两条都 rolled_back，文档等于第一条之前。
5. 构建器内未保存改电话后 Restore：断言随后自动保存是 409 + 三方合并（电话保留、项目回到快照），还是整份把 Agent 文档写回。静态预期是前者。

---

## UR-4 外部更新清空撤销栈

### 原结论

远端数据变化时 `replaceResumeFromServer` 清空撤销栈，用户本地未完成的撤销步骤丢失。建议有未保存编辑时不要清栈。

### 新发现的保护或反证

生产调用 `replaceResumeFromServer` 的只有：

1. `version-history.tsx` 约 53 行：用户确认恢复历史版本之后。提示已写明会重置编辑器撤销栈。
2. `draft.ts` `applyDeferredRemoteResume` 约 163 行：失焦后应用暂存的远端文档。若 `hasPendingLocalChanges` 则直接 return，不清栈、不换 `data`。
3. `draft.ts` `useBuilderResumeUpdateSubscription` 约 864–896 行：先 `getById`。`hasPendingLocalChanges` 时只合并元数据。无未保存编辑时：非外部变更（含 `mutation === "sync"` 或 data 相等）也走 `replaceResumeFromServer`；data 相等则 `isRebase` 为假，**保留**栈（`draft.test.ts`「preserves the undo stack when the server echoes the current data」）。data 不等才清栈。真正的跨标签/Agent 且未聚焦输入框时，换文档并 toast。聚焦中则只合并元数据，并把完整远端文档放到失焦后再应用。

已有测试（本轮未跑）：`does not overwrite pending local builder edits when a remote update arrives`。未保存编辑不会被订阅路径用整份远端文档覆盖。这是原报告漏写的保护。

若远端 rebase 已经成功写进本地（无未保存编辑），旧的撤销快照是 rebase **之前**的整份 `ResumeData`。保留它们再点撤销，会把 Agent/另一标签页的修改从内存撤掉，并走自动保存写回服务器。因此「有远端修改时不清历史」会把远端更新变成可被本地撤销掉的一层，风险比清栈更大。若要保留可撤销性，快照必须相对 rebase 做变基，或禁止撤销到 rebase 之前。

### 修订结论

- 「未保存编辑被整份远端快照覆盖」：**撤回**。`hasPendingLocalChanges` 与失焦延迟已经挡住。
- 「Agent 补丁到达后，已保存编辑的撤销栈被清空」：**缩小**为交互取舍，P2。清栈避免用过期快照覆盖远端；不清栈则撤销可能覆盖远端。不要只建议不清历史。
- 历史版本恢复清栈：**保留为有说明的预期行为**，不是缺陷。

### 对应代码位置与调用链

SSE `resume.updated` → `onUpdate` → `getById` →（pending → `mergeResumeMetadata` return）→（聚焦 → 延迟）→ `replaceResumeFromServer` → `isEqual` 为假则 `resetHistoryRuntime` 并清空两栈。

### 尚需最小验证

1. 本地有未保存电话时让 Agent patch 事件进来：内存电话仍在，栈不被清掉（已有单元测试名称对应 pending 不覆盖 data；可再断言栈长度）。
2. 无未保存编辑时 Agent patch：栈被清空，toast「updated by an AI agent」。不要在此状态下用旧快照写回。

---

## PH-2 照片物理删除

### 原结论

删除立刻 `deleteFile`，撤销只恢复 URL 字符串，文件已不在。

### 新发现的保护或反证

没有第二份 blob，也没有引用计数或延迟 GC。

- `onDeletePicture` 对同源 URL 立刻 `deleteFile`；`storage/router.ts` 90–103 行按当前用户前缀 `unlink` / S3 delete。
- `writeResumeVersion` 只把 `ResumeData` JSON 插入 `resume_version`（上限 30，按 id 修剪），不复制对象存储。
- 撤销栈同样只是 JSON。
- 替换照片**不会**删旧 key，所以「替换后撤销」仍可能 200；「删除后撤销」以及「删除后把历史版本恢复到仍引用该 key 的文档」指向已删 key。
- 非同源 URL 不调用删除，外链不受影响。

### 修订结论

**保留** P1，触发条件缩小为：同源上传图被**删除**（不是被替换）后再撤销或恢复仍引用该 key 的历史版本。未运行 404。

### 对应代码位置与调用链

删除按钮 → `onDeletePicture` → `deleteFile` + `persist(defaultPicture)` → `updateResumeData` 入栈（栈里是带旧 URL 的 JSON）→ 之后 `undo` / `versions.restore` 只写回字符串。GET `/api/uploads/...` 读盘，文件已删则 404。

### 最小复现

1. 上传一张小 JPEG，等自动保存。
2. 记下 `picture.url`。
3. 点删除，等保存。
4. 直接 GET 该 URL，预期 404。
5. 点撤销，GET 同一 URL，预期仍 404，编辑器有失效地址。
6. 对照：上传 A，再上传 B（不点删除），撤销后 GET A，预期仍 200。
7. 对照：上传并保存后删除，再从历史版本恢复到仍含该 URL 的版本，GET 预期 404。

---

## UR-3 历史版本恢复并发

### 原结论

`restore` 的 `update` 不带 `expectedUpdatedAt`，会与自动保存互相覆盖。

### 新发现的保护或反证

`restore`（`service.ts` 417–450 行）顺序：

1. `getById` 取当前行（含 `updatedAt` 与 `data`）。**不是** `SELECT … FOR UPDATE`。锁定则失败。
2. 用该 `current.data` 写入版本「Before restore」（显式 `snapshot`，不受 2 分钟节流限制）。
3. `update({ data: versionData, skipAutoSnapshot: true })`，**不传** `expectedUpdatedAt`。
4. 再快照「Restored version」。

已有保护：

- 锁定简历不能恢复。
- 步骤 1 当时的当前文档会进版本列表，通常还能从历史里找回。
- 普通编辑器 `resume.update` 带 `expectedUpdatedAt`。目标行若已被恢复推进，会 `RESUME_VERSION_CONFLICT`，客户端 `recoverFromVersionConflict`，不会在无感知下用**更早的基线**盖掉已恢复文档。
- 恢复成功后客户端 `replaceResumeFromServer`，清栈（与确认文案一致）。

未保护窗口（静态）：

- 步骤 1 与步骤 3 之间，另一请求完成了一次不带冲突或带**当时匹配戳**的 `update`（例如另一标签页的自动保存，其 `expectedUpdatedAt` 仍等于步骤 1 读到的时间）。步骤 3 无期望时间，会把当前行写成历史版本。窗口内那次保存从**当前文档**消失。
- 「Before restore」是步骤 1 的数据，不含窗口内那次保存。那次保存若落在 `SNAPSHOT_THROTTLE_MS`（2 分钟）内，`maybeSnapshotOnSave` 可能跳过，窗口内的保存可能没有自己的版本行。

因此：不是「恢复从不保留当前数据」；是「无锁 `getById` 之后、无乐观锁 `update` 之前」这一段。恢复**完成之后**赶到的带旧戳自动保存，会被版本校验挡住。

### 修订结论

**保留** P1，缩小为上述窗口。不要写成恢复从不快照当前文档，也不要写成任意在途保存都能盖掉已完成的恢复。

### 对应代码位置与调用链

`version-history` `handleRestore` → `orpc.resume.restoreVersion` → `versions.restore` → `getById` → `versions.snapshot("Before restore")` → `update`（无 `expectedUpdatedAt`，`skipAutoSnapshot: true`）→ `snapshot("Restored version")` → 客户端 `replaceResumeFromServer`。

### 最小复现

1. 标签页 B 调用 `restore`，在 `getById` 返回之后、`update` 发出之前插入延迟（测试替身或代理）。
2. 标签页 A 在延迟内保存电话 `13900000000`（虚构），且 A 的 `expectedUpdatedAt` 等于 B 在步骤 1 读到的戳。
3. 放行 B 的 `update`。
4. `getById`：当前文档应仍是历史版本，电话不是 `13900000000`。
5. 列出版本：确认「Before restore」是否含该电话；若节流跳过手动保存快照，则该电话可能只存在过当前行并已被覆盖。

对照（应被现有保护挡住，不要与窗口内竞态混为一谈）：先让 restore **完成**，再放行带**旧戳**的自动保存，期望 `RESUME_VERSION_CONFLICT`，当前文档仍是恢复结果。

未运行。需要可控的保存顺序。

---

## 对原报告条目的处理一览

| ID | 修订 |
| --- | --- |
| PH-1 连续上传 A 晚到覆盖 B | 撤回 |
| PH-1 上传中删除后成功回调写回 | 保留，缩小，P1 |
| PH-1 被取消上传留下的存储对象 | 缩小为 P2 未引用文件 |
| UR-1 已保存电话被静默覆盖 | 撤回；版本校验挡住 |
| UR-1 整份恢复语义 / 单次撤销未实现 | 分开：现有语义保留说明，新需求降为 P1 设计缺口 |
| UR-1 conflicted 不能重试、先新后旧连撤冲突 | 保留 P1 |
| UR-1 未保存编辑 + Restore | 缩小为待运行验证；静态上更像 409 后三方合并 |
| UR-4 未保存编辑被远端整份覆盖 | 撤回 |
| UR-4 清栈导致不能撤销 rebase 前编辑 | 缩小为 P2 取舍，禁止「只不清栈」 |
| PH-2 删除后撤销 404 | 保留，缩小到删除而非替换；历史恢复同一缺口 |
| UR-3 恢复无乐观锁 | 保留，缩小到 getById 与 update 之间 |
| T2 | 改为产品需求验收（字段级撤销），不再当作已确认 P0 缺陷的复现步骤 |
| T5 | 拆成：连续上传回归（预期不覆盖）；上传中删除（预期写回） |

复核后不再把 UR-1 或连续上传 PH-1 列为 P0/已确认覆盖。当前仍建议 Codex 先做的，改为：PH-1 删除竞态、UR-1 五条 API 时序（含连撤与 conflicted）、UR-3 插入延迟的 restore。

## 基线哈希（与 15:51 审查相同）

HEAD `a57d9d0a98446b5b484cff216db9b87f27b24ac0`，`main` ahead 9。结束复核时 14 个源文件 SHA256 前 16 位未变：

| 前缀 | 文件 |
| --- | --- |
| 413BDF105E62AAC5 | `apps/web/src/features/resume/builder/draft.ts` |
| 4EBEB87B9C54A7BD | `apps/web/src/routes/builder/$resumeId/-components/dock.tsx` |
| 8878B5A331EF5A70 | `apps/web/src/routes/builder/$resumeId/-components/version-history.tsx` |
| 160B8ED740C6D660 | `apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/picture.tsx` |
| BE32FEECF72CB071 | `apps/web/src/routes/agent/-components/agent-chat.tsx` |
| 1556D00EFF658821 | `packages/api/src/features/agent/service.ts` |
| A82953858BFD6B24 | `packages/api/src/features/resume/service.ts` |
| 14343EE8D521E0DE | `packages/utils/src/picture-url.ts` |
| EB36762D10B2AD40 | `packages/api/src/features/storage/service.ts` |
| 91078CDF7010F299 | `packages/api/src/features/storage/router.ts` |
| F4777E15DB9A57CE | `apps/server/src/static/uploads.ts` |
| 279682B9C82574A1 | `packages/pdf/src/browser.tsx` |
| 2713F54ED467CA1B | `packages/pdf/src/server.tsx` |
| DD5566EB69A111B4 | `packages/resume/src/merge.ts` |

另读（不在原 14 文件表内，本轮结论依赖）：`mutationObserver.ts` / `mutation.ts` 5.103.1、`packages/resume/src/patch.ts` 与 `patch.test.ts`、`packages/db/src/schema/resume.ts`、`ai-assistant.tsx`、`draft.test.ts` 订阅用例、`agent/service.test.ts` revert 用例文本。

## 尚需执行、本轮未跑的命令

不要与 GLM 抢同一套正在跑的测试。留给 Codex：

```text
# 仅在隔离环境，且不与 GLM 并行
# 1. 阅读已完成：query-core MutationObserver.mutate / #notify / Mutation.execute
# 2. 针对 PH-1 删除竞态、UR-1 五条 API 时序、UR-3 插入延迟的 restore，写最小集成测试后执行
```
