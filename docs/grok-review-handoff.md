# 审查交接

审查窗口：2026-09-27 15:51:52 +08:00 起，报告写完时工作区源文件哈希见下表。若表中文件哈希已变，结论只对表内哈希负责，需要重读差异。

## 1. 建议 Codex 先复现的三项

> 2026-09-27 16:28 Codex 反证复核：下列第 1、2 项已修订。更新后的优先复现见文末「修订」与 `docs/grok-review-corrections.md`。下文保留 15:51 原文。

1. **UR-1** Agent Restore 在用户又保存过电话之后变为永久 `conflicted`；若没有后续保存，则整份快照回退会丢掉电话。复现不要用真实模型，直接插一条 `agentAction` 再调用 `actions.revert`。
2. **PH-1** 两次上传，较晚发出的响应先返回，然后早先的响应返回。最终 `picture.url` 会变成早先那张。
3. **T1 / 撤销与在途保存** 延迟 `resume.update` 响应，中间撤销，再放行响应并重新读取。确认数据库不是被撤销掉的那一版。

## 2. 发现索引

| ID | 优先级 | 类型 | 证据 | 报告 |
| --- | --- | --- | --- | --- |
| UR-1 | P0 | 现有缺陷 | 静态确认 | undo-redo |
| UR-2 | P1 | 设计缺口 | 静态确认 | undo-redo |
| UR-3 | P1 | 现有缺陷 | 静态确认 | undo-redo |
| UR-4 | P1 | 设计缺口 | 静态确认 | undo-redo |
| UR-5 | P2 | 设计缺口 | 静态确认 | undo-redo |
| UR-6 | P2 | 待验证疑点 | 静态确认焦点判断；IME 未运行 | undo-redo |
| PH-1 | P1 | 现有缺陷 | 静态确认 | photo |
| PH-2 | P1 | 现有缺陷 | 静态确认 | photo |
| PH-3 | P1 | 现有缺陷 | 静态确认两条代码路径 | photo |
| PH-4 | P2 | 现有缺陷或产品缺口 | 源码搜索无 DOCX 图片；未生成文件 | photo |
| PH-5 | P2 | 设计缺口 | 静态确认公开 GET | photo |
| PH-6 | P3 | 待验证疑点 | 读了 sharp 分支；未喂损坏文件 | photo |
| T1–T10 | 见测试报告 | 测试缺口 | 本轮未执行 | missing-test-cases |

统计：缺陷与设计缺口 12 条。P0 共 1（UR-1）。P1 共 6（UR-2、UR-3、UR-4、PH-1、PH-2、PH-3）。P2 共 4（UR-5、UR-6、PH-4、PH-5）。P3 共 1（PH-6）。测试缺口 T1–T10 另计 10 条，不重复算进这 12 条。

## 3. 基线

- 目录：`D:\MyProjects\Weekly  Resume\weekly-resume-release`
- 开始时间：2026-09-27 15:51:52 +08:00
- HEAD：`a57d9d0a98446b5b484cff216db9b87f27b24ac0`
- 分支：`main`，跟踪 `origin/main`，ahead 9
- porcelain 315 条：已跟踪变更 199，未跟踪条目 116（不是未跟踪文件总数）

开始时 SHA256 前 16 位（工作区文件，不是 HEAD blob）：

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

结束复核：2026-09-27 15:56:04 +08:00。上表 14 个源文件的 SHA256 前 16 位与开始时相同。审查期间这些文件没有被其他会话改写。结论对应该工作区版本，不是干净的 HEAD 检出。

## 4. 审了什么、没审什么

审了：`draft.ts` 历史与保存、`dock.tsx` 快捷键、`version-history.tsx`、`service.ts` 的 patch 与 restore、`agent/service.ts` 的 `applyResumePatch` 与 `actions.revert`、`agent-chat.tsx` 的 Restore 禁用条件、`picture.tsx` 上传与删除、`picture-url.ts`、storage 上传与删除、`uploads.ts`、PDF browser/server、DOCX 源码检索、`merge.ts` 开头、`draft.test.ts` 中撤销用例名称。

没审完：`runs.ts` 取消与部分工具失败、富文本每个键是否调用 `updateResumeData`、全部模板文件逐份对照、导入器如何写 `picture.url`、S3 预签名、首页缩略图组件、账号注册登录实现。这些不能说没有问题。

## 5. 环境限制

- 未运行测试、构建、浏览器、数据库、上传。
- 未读密钥或简历正文。`APP_URL`、`S3_*`、`FLAG_DISABLE_IMAGE_PROCESSING` 只确认代码读取这些名字，没有打印值。
- 工作区有大量他人未提交文件。本轮只新增下面四份报告。

## 6. 本轮文件变更

新增：

- `docs/grok-undo-redo-design-review.md`
- `docs/grok-photo-pipeline-review.md`
- `docs/grok-missing-test-cases.md`
- `docs/grok-review-handoff.md`

未改业务代码、测试、依赖、锁文件、配置、翻译、Git 提交、数据库或服务进程。

---

## 修订（2026-09-27 16:28 Codex 反证复核）

15:51 交接原文保留。本轮只读，未跑测试，未改业务代码。源文件哈希与上表相同。完整修订见 `docs/grok-review-corrections.md`。原报告文末各有修订节。

**撤回**

- UR-1 作为 P0「已保存电话被静默覆盖」
- PH-1 连续上传 A 晚到覆盖 B
- UR-4「未保存编辑被整份远端快照覆盖」

**降级 / 缩小（仍建议 Codex 做）**

1. **PH-1 上传中删除**：上传未返回时点删除，再放行成功回调，断言 URL 仍为空。连续 A/B 改为回归（预期最终为 B）。
2. **UR-1 API 时序**（假用户，不调真模型）：已保存电话 → Restore 期望 `conflicted` 且电话不变；先新后旧连撤期望第二次冲突；`conflicted` 不能重试；直接 Restore 较早一条可一次撤两条。未保存电话 + Restore 看 409 后三方合并，不要先写成电话丢失。
3. **UR-3**：在 `getById` 与 restore 的 `update` 之间插入延迟并完成另一次匹配戳保存。恢复完成后的旧戳保存应被现有冲突路径挡住，不要与窗口内竞态混测。

**统计（修订后，仍为静态，不是复现数）**

P0 现有缺陷：0（原 1 条 UR-1 撤回）。  
仍列 P1 的现有缺陷 / 缩小后缺口：UR-1 产品缺口（不能重试 / 连撤冲突）、UR-3（缩小窗口）、PH-1（仅删除竞态）、PH-2、PH-3。  
UR-2、UR-5、UR-6、PH-4–PH-6、T1 未作为本轮反证重点。

本轮新增 `docs/grok-review-corrections.md`，并在上述四份原报告加入修订说明。未提交、未推送、未部署。
