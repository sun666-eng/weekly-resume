# 测试遗漏与后续验收

本轮没有执行测试套件。下列命令是建议，状态一律为未执行。不要把其他会话的通过次数算进本轮。

> 2026-09-27 16:28 Codex 反证复核：T2 不再当作已确认 P0 缺陷的复现；T5 应拆成连续上传回归与上传中删除。见文末「修订」与 `docs/grok-review-corrections.md`。

覆盖层级：U 单元（函数入出） / C 组件（DOM，不一定加载图片） / I 接口（真实存储与数据库，可假用户） / E 端到端（浏览器，图片要看 naturalWidth，导出要看字节内容）。

## 1. 必须补的用例

| ID | 优先级 | 前置 | 步骤 | 预期 | 现有测试 | 层级 | 缺口 | 环境 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | P0 | 假简历，mock 延迟的 `resume.update` | 改电话并触发保存；请求未返回时撤销；再让响应返回；刷新或重新 `getById` | 持久化结果是撤销后的电话，不是在途请求里的电话 | `draft.test.ts` 只覆盖回声数据相同则保留栈 | I+E | 未覆盖在途响应与撤销交错 | 单进程 API + 可控时钟 |
| T2 | P0 | 电话、项目描述、邮箱均为已知字符串 | 改电话 → Agent 改项目 → 改邮箱 → 撤销该 Agent 动作 | 仅项目描述回到 Agent 之前；电话和邮箱保留 | `agent/service.test.ts` 有整份冲突回退用例，不断言字段保留 | I | 现实现是整份快照，此预期目前会失败或变成 conflicted | 假用户，不调用真实模型 |
| T3 | P0 | 同一项目 `description` | 用户与 Agent（或第二标签页）都改该字段后撤销 | 返回冲突；数据库仍是冲突前的值；界面能看到双方文本 | `merge.ts` 有合并单元测试；Agent revert 不调用它 | U+I | 缺端到端冲突不丢数据 | 两个客户端按固定顺序发请求 |
| T4 | P1 | 三条经历，稳定 id `e1 e2 e3` | 拖拽或删除后再 Agent/本地回退 | 文本仍属于原 id，不因下标变化写到另一条 | `draft.test.ts` 有一次性排序撤销 | U | 缺“删除中间项后按旧 index 打补丁” | 单元构造 JSON Patch |
| T5 | P1 | 两张小 JPEG `a.jpg` `b.jpg` | 上传 A 后立即上传 B，让 A 的 HTTP 后完成 | 表单、`getById`、预览 img、PDF 都是 B | 无 | C+I | `picture.tsx` 无请求序号测试 | 假存储，延迟队列 |
| T6 | P1 | 已上传并保存的照片 | 替换后撤销；另测删除后撤销 | 替换：旧 URL 仍 200，刷新与 PDF 一致。删除：要么仍 200，要么产品明确不可撤销并禁用撤销 | 无 | I+E | 删除与历史栈脱节 | 本地存储目录，导出打开 PDF |
| T7 | P1 | 有照片的简历 | 换模板、隐藏照片、撤销、重做交替 | 表单 hidden/url、预览、PDF 一致；隐藏时 PDF 无照片图像 | `picture.test.ts` 只断言 `hasTemplatePicture` | E | 缺交替操作 | 浏览器 + 一种模板 |
| T8 | P1 | 登录态 | 断网或 401 时撤销，再登录 | 恢复草稿是撤销后的数据，不被旧自动保存覆盖 | `draft.ts` 有 stash 逻辑；未见此顺序测试 | E | 未验证 | 假登录，拦截保存 |
| T9 | P2 | 中文输入法 | 在姓名框组合输入“张伟”，组合中按 Ctrl+Z，再上屏 | 不重复、不截成半个拼音；简历栈不在组合中途多一步 | 无 | E | IME 未测 | Windows/macOS 真实 IME |
| T10 | P1 | 私有简历且含照片 | 关闭公开；匿名 GET 简历页；匿名 GET 照片 URL | 简历页 401/404。照片是否 200 需与产品约定一致并写进断言 | `uploads.test.ts` 覆盖路径与 agent 前缀，不断言简历公开位 | I | 照片与简历 ACL 未绑在一起 | 两个会话：主人与匿名 |

建议命令（未执行）：

```text
corepack pnpm --filter web exec vitest run src/features/resume/builder/draft.test.ts src/features/agent/thread-title.test.ts src/libs/error-message.test.ts
corepack pnpm --filter @reactive-resume/api exec vitest run src/features/agent/service.test.ts src/features/resume/service.test.ts
corepack pnpm --filter @reactive-resume/utils exec vitest run src/picture-url.test.ts
corepack pnpm --filter @reactive-resume/pdf exec vitest run src/templates/shared/picture.test.ts
```

T1–T10 都还没有同名用例。不要只跑上面这些命令就勾掉验收。

## 2. 伪代码（不要写入仓库测试，除非 Codex 单独开任务）

```text
it("T5 keeps the later upload when the earlier response arrives last", async () => {
  const urls = ["https://app.example/api/uploads/u/pictures/1.jpeg", "https://app.example/api/uploads/u/pictures/2.jpeg"];
  let finishFirst: (url: string) => void;
  uploadMock.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
  uploadMock.mockImplementationOnce(async () => ({ url: urls[1] }));
  selectFile("a.jpg");
  selectFile("b.jpg");
  await waitForSavedUrl(urls[1]);
  finishFirst({ url: urls[0] });
  expect(store.picture.url).toBe(urls[1]);
});
```

图片断言必须是请求图片 URL 得到 200 且解码宽度大于 0，不能只查 DOM 里有 `<img>`。PDF 断言必须解析内容流里有图像且隐藏时没有该图。导出 HTTP 200 不够。

## 3. 相关流程的交叉缺口

| 场景 | 和撤销/照片的关系 | 现有保护 | 仍缺的检查 |
| --- | --- | --- | --- |
| 注册登录 / 会话过期 | 401 时 `stashRecoverableDraft` | 有备份函数 | T8；过期后旧请求晚到 |
| 中文空白简历 | 新建数据含空 `picture.url` | `initial-data` 测试空 URL | 空白简历上传照片再撤销 |
| 导入 | 导入写 `picture.url` 可能是外链 | 未在本轮读导入器 | 导入后的 URL 不被 `normalizePictureUrl` 改坏；刷新仍在 |
| 自动保存 | 与撤销共用 `flushResumeSave` | 回声不覆盖相同 data | T1 |
| 模板切换 | 多半只改 `metadata.template` | 未在本轮逐行核对画廊 | T7：切换不得清空 url |
| PDF/DOCX/Markdown/JSON | 照片只确定进了浏览器 PDF 路径 | DOCX 源码无 picture | 四种导出各查一次照片与 hidden |
| 公开分享 | 页与文件 ACL 分离 | 上传删除按用户前缀 | T10 |
| 账号隔离 | 删除不能跨用户 | router 检查前缀 | 用户 A 的照片 URL 被用户 B 嵌入简历时，PDF 是否代拉 A 的私有图（当前 URL 是公开 GET） |

## 4. 不能当成通过的信号

- `draft.test.ts` 通过只说明内存栈对所写用例成立，不能说明浏览器保存顺序。
- Agent 测试使用 mock，不是真实模型。
- `hasTemplatePicture` 为真不等于图片加载。
- 上传 mutation 成功不等于 `resume.update` 已落库。
- 界面“已保存”来自 `setSaveStatus("saved")`，只在该次提交与当前内存一致时设置。刷新读回才算持久化。
- 两个标签页依次点保存不是并发。要控制后发的请求先到达数据库。
- 一个模板的照片测试不能代表全部模板，也不能代表 DOCX。

---

## 修订（2026-09-27 16:28 Codex 反证复核）

表内 T1–T10 原文保留。本轮仍未执行这些用例。详见 `docs/grok-review-corrections.md`。

**T2（原 P0）**  
原预期「撤销该 Agent 动作后只恢复项目描述、保留电话和邮箱」是产品新增的单次字段撤销，不是当前整份 Restore 的已确认缺陷复现。已保存电话路径上代码会 `conflicted` 且不写文档。请改成产品需求验收，优先级随 UR-1 降为 P1。另需补：先 Restore 最新一条再 Restore 较早一条期望冲突；`conflicted` 后再点期望仍不写。

**T5（原连续上传 A 晚到）**  
按 TanStack Query 5.103.1 `MutationObserver.mutate` 行为，该步骤静态预期**通过**（最终 URL 为 B），改为回归，不能再当缺陷复现。另增「上传未完成时删除，再放行上传成功，`picture.url` 仍为空」——静态预期失败，作为真正的 PH-1 复现。

**T3**  
仍是字段级冲突产品需求，与撤回后的 UR-1 设计缺口对应，不是已复现的静默覆盖。

**T6**  
与 PH-2 一致：删除后撤销 / 历史恢复指向已删 key；替换后撤销仍可能 200。保持。

伪代码块里的 T5 连续上传用例可留作回归；不要把失败当作 PH-1 成立。
