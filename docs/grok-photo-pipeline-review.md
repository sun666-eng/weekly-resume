# 照片链路审查

审查开始：2026-09-27 15:51:52 +08:00。HEAD `a57d9d0a98446b5b484cff216db9b87f27b24ac0`。本轮未上传文件、未启动服务、未打开浏览器。

## 1. 链路表

| 段 | 位置 | 数据 | 调用方 | 校验与失败 | 测试 |
| --- | --- | --- | --- | --- | --- |
| 选文件 | `picture.tsx` `onUploadPicture` 约 573–586 行 | `File` | 隐藏 file input | 空选择直接返回。`fit === "contain"` 直接上传，否则打开裁剪 | 有 picture 表单测试（本轮未跑）。无“连续两次选择”用例 |
| 裁剪 | `getCroppedImageBlob`、`onConfirmCrop` 约 594–609 行 | canvas blob，失败则用原文件 | 确认裁剪 | canvas 失败被吞掉，改传原文件，没有单独提示 | 未看到覆盖 canvas 失败的测试 |
| 上传请求 | `orpc.storage.uploadFile` | `File` | `uploadPictureFile` | 10MB zod；非图片不走 sharp | router 测试未在本轮运行 |
| 处理 | `processImageForUpload` `service.ts` 95–113 行 | JPEG 800 内接，或原字节 | 仅当 `isImageFile` | `FLAG_DISABLE_IMAGE_PROCESSING` 为真时保留原 MIME | 未读到开关两边的对照测试 |
| 存储 | `uploadFile` 346–349 行 | key `uploads/{userId}/pictures/{timestamp}.{ext}` | router | 本地后端拒绝 private 写；S3 与本地由密钥是否齐全二选一 | uploads 路由测试存在，本轮未跑 |
| 返回地址 | `buildPublicUrl` 75–78 行 | `new URL("/api/"+key, env.APP_URL)` 绝对 URL | 上传响应 | 无 | 未看到 APP_URL 与浏览器 origin 不一致的测试 |
| 写入表单 | `picture.tsx` `onSuccess` 546–551 行 | `normalizePictureUrl` 后的 URL 写入 `picture.url`，并 `updateResumeData` | 上传回调 | 失败 toast。没有请求序号 | 无 A/B 迟到测试 |
| 保存简历 | `draft.ts` `flushResumeSave` | 整份 `ResumeData` | 防抖 500ms | 带 `expectedUpdatedAt` | 自动保存测试存在，不覆盖上传回调与撤销交错 |
| 回读 | `resume.getById` 返回库内 JSON | 保存时的字符串 | 刷新 | 无图片存在性检查 | 无 |
| 编辑器缩略图 | `picture.tsx` 使用 `normalizedPictureUrl` | 浏览器 origin 上的 `/api/uploads/...` | 表单预览 | 加载失败与 hidden 未在本轮区分 | DOM img 测试不等于 `naturalWidth` |
| 模板预览 / 浏览器 PDF | `packages/pdf/src/browser.tsx` 26 行再次 `normalizePictureUrl` | 同上 | 预览 | 模板用 `hasTemplatePicture`：空或 hidden 不画 | `picture.test.ts` 只测该布尔值 |
| 服务端 PDF | `packages/pdf/src/server.tsx` `createResumePdfFile` | **不**调用 `normalizePictureUrl`，把库内 URL 交给 react-pdf | 导出 API | 渲染器必须能自己访问该 URL | 未看到服务端拉取上传 URL 的测试 |
| DOCX | `packages/docx/src` 检索 `picture` / `ImageRun` 无匹配 | 不嵌入照片 | 导出 | 静默没有图片 | 无照片断言 |
| 公开页 | `public-resume.tsx` 约 50 行 `<img src={picture.url}>` | 库内原字符串，未见 normalize | 公开路由 | 简历 ACL 与图片 URL ACL 不是同一套 | 未跑 |
| 删除 | `onDeletePicture` 525–539 行 | 同源才 `deleteFile({ filename })` | 删除按钮 | 服务端把裸文件名限定到 `uploads/{userId}/pictures/` | 无“删除后撤销”测试 |
| 刷新 / 重登 | 地址在简历 JSON 里 | 文件在本地盘或 S3 | 无会话绑定 | 公开 GET `/api/uploads/...` 不校验登录 | `uploads.test.ts` 有路径用例，本轮未跑 |

模板页眉通过 `hasTemplatePicture(picture)` 后把 `picture.url` 交给 `SemanticHeaderPicture`。抽查 Gengar、Ditto、Chikorita、Kakuna 等均为该入口。首页缩略图组件不在这条链上，不能当作用户照片成功的证据。

## 2. 发现

### PH-1 上传完成回调没有代际，后完成的请求覆盖先选择的文件

> 2026-09-27 16:28 Codex 反证复核：连续上传 A 晚到覆盖 B 撤回（per-call `mutate` 回调会被卸掉）。上传中删除后写回仍保留为 P1。见文末「修订」与 `docs/grok-review-corrections.md`。

- 优先级：P1。类型：现有缺陷。证据：本轮静态确认。未运行。
- 位置：`picture.tsx` `uploadPictureFile` 542–570 行。`useMutation` 的 `onSuccess` 总是 `persist({ ...form.state.values, url: normalizedUrl })`。
- 触发：上传 A 未完成时再上传 B；或删除照片后 A 的回调才到。
- 复现：选 `a.jpg`，立刻再选 `b.jpg`。让 A 的响应晚于 B。
- 预期：界面、简历 JSON、导出都指向 B。A 的响应被丢弃。
- 代码结果：后执行的 `onSuccess` 把 `picture.url` 写成自己的 URL。A 晚到则最终是 A。删除会先 `persist` 空 URL，晚到的成功回调再把 URL 写回去。
- 根因：没有递增的上传序号或 Abort。注释只防止 `setFieldValue` 异步把旧表单 URL 再存一次，没有处理两个在途请求。
- 反证：单次上传会显式传入新 URL，不会只依赖表单状态。这挡不住多个回调。
- 修复方向：每次上传 `id`，回调仅当 id 仍是最新才写入。删除和离开页面时作废未完成 id。不要在删除后把已删 URL 写回。
- 回归：裁剪确认、contain 直传、失败重试、上传中改边框再完成，边框应保留且 URL 属于最后一次选择。

### PH-2 删除会立刻删存储对象，撤销只能恢复已失效的 URL

> 2026-09-27 16:28 Codex 反证复核：保留 P1，触发条件缩小为同源图被删除（不是替换）后再撤销或恢复历史版本。版本表不复制 blob。见文末「修订」。

- 优先级：P1。类型：现有缺陷。证据：本轮静态确认。未运行。
- 位置：`onDeletePicture` 535–539 行调用 `deleteFile`。撤销只恢复 `ResumeData` 里的字符串（`draft.ts` 历史栈）。存储删除在 `storage/router.ts` 90–103 行，按当前用户前缀删除。
- 复现：上传得到 `/api/uploads/user-1/pictures/1.jpeg`，保存，再点删除，再点撤销。
- 预期：撤销后编辑器、刷新和 PDF 都能显示该图。
- 代码结果：撤销把 URL 写回简历并自动保存，但文件已从本地盘或 S3 删除。GET 返回 404。替换照片不会删除旧文件，所以“替换后撤销”仍可能加载旧图；“删除后撤销”不能。
- 反证：非同源 URL 不会调用删除，外部图链撤销仍有效。同源上传图会删。
- 修复方向：简历仍引用或撤销栈、版本快照仍引用的 key 不要物理删除。删除只清当前字段，垃圾回收扫描无引用对象。版本快照里的 `picture.url` 也算引用。
- 兼容：用户期望删除后存储变小。应延迟删除并在 UI 说明撤销窗口内文件仍在。

### PH-3 浏览器会改写回环地址，服务端 PDF 不会

- 优先级：P1。类型：现有缺陷（环境相关）。证据：静态确认两条代码路径不同。未用容器复现。
- 位置：`packages/utils/src/picture-url.ts` 只在“当前 origin”或“同协议同端口的 localhost/127.0.0.1/::1”之间改写，且只改 `/uploads/` 与 `/api/uploads/`。`browser.tsx` 26 行使用 `window.location.origin`。`server.tsx` 16–27 行直接 `parseResumeData` 后渲染，不改写。
- 存储写入的是 `env.APP_URL` 绝对地址（`buildPublicUrl`）。
- 如何区分根因，不要只看 localhost 字样：
  1. 数据库里的 `picture.url` 与浏览器地址栏 origin 的协议、主机、端口是否一致。不一致且不是同端口回环，预览会继续请求库里的绝对地址。
  2. 该绝对地址在导出进程里能否 GET 200。服务端 PDF 失败而浏览器预览成功，指向“渲染器访问不到 APP_URL”，不是前端没保存。
  3. 端口不同（例如库中 `:3000`，页面 `:5173`）按 `picture-url.ts` 第 9 行不会改写。这和“同端口 localhost 与 127.0.0.1 会改写”是两条用例。
  4. 第三方 `https://images.example/a.png` 函数直接返回原值（第 12 行）。若这种图预览失败，不是标准化改坏的。
- 反证：`picture-url.test.ts` 覆盖同端口回环改写和无关主机保持原样。没有服务端渲染用例。
- 修复方向：服务端渲染前把本站上传 URL 换成存储读取（按 key），不要让 PDF 进程跨主机 HTTP 拉自己的上传。保留第三方 URL 原样。

### PH-4 DOCX 导出看不到照片实现

- 优先级：P2。类型：现有缺陷或设计缺口，需 Codex 再确认产品是否承诺 DOCX 含照片。证据：在 `packages/docx/src` 搜索 `picture` 与 `ImageRun` 无匹配。未生成 docx 文件。
- 影响：照片在 PDF 预览正常不能推出 DOCX 正常。
- 修复方向：若产品需要，DOCX 用与 PDF 相同的 key 读取字节再嵌入，不要只写 URL。

### PH-5 简历不公开时，照片 URL 仍可被知道路径的人获取

- 优先级：P2。类型：设计缺口。证据：静态确认。
- 位置：`apps/server/src/static/uploads.ts` `handleUpload` 不读会话。私有前缀仅 `agent/`（75–76 行）。简历照片在 `pictures/`。`Cache-Control: public, immutable`。
- 影响：关闭公开分享只挡住简历 JSON。照片 URL 含 `userId` 与时间戳文件名，泄露后仍可下载。这不一定违反“匿名不能打开简历页”，但违反“照片与简历同一访问策略”的可能约定。本轮没有产品条文，标为需对照约定。
- 反证：删除接口强制 `uploads/{当前用户}/`，不能删别人的文件。路径 `..` 被拒绝。Agent 附件不走这条公开路由（`uploads.test.ts` 有用例，未跑）。
- 修复方向：若照片应私有，GET 校验简历公开或登录所有者；公开简历再发长缓存。不要把带鉴权的 URL 放进匿名 PDF，除非渲染发生在服务端读盘。

### PH-6 处理开关会改变格式，调用方仍把响应当成已保存的图片

- 优先级：P3。类型：待验证疑点。证据：静态阅读 `processImageForUpload`。
- 默认 sharp 转 JPEG，透明 PNG 会丢透明。`FLAG_DISABLE_IMAGE_PROCESSING` 为真时保留原 MIME，扩展名表含 png/webp/gif。损坏文件会在 sharp 抛错，上传失败，简历 URL 不应改变（回调不走 onSuccess）。未运行损坏文件。
- 非图片 MIME 仍会 `uploadFile`（router 53–56 行）。选择器是否限制 `accept` 需看 input 属性。本轮看到的 `onUploadPicture` 不检查 MIME。若 input 未限制，PDF 也能上传进 `pictures/` 并写入 `picture.url`，预览当图片加载失败。建议 Codex 看 file input 的 `accept`。

## 3. 与撤销的交叉

照片和边框、旋转、hidden 都在 `picture` 对象里。一次 `persist(picture)` 是一整步 `updateResumeData`，符合“照片与显示设置作为整体”，只要没有在 500ms 内再改别的字段（见撤销审查 UR-2）。

替换不删旧文件，撤销旧 URL 仍可能 200。删除会删文件，撤销后 404（PH-2）。

上传成功只表示存储写入，简历保存是之后的防抖。上传 toast 结束时用户可能尚未看到“已保存”。刷新若发生在防抖之前，依赖 `beforeunload` 里的 `stashRecoverableDraft`。未运行验证该备份是否包含刚写入的 URL。

---

## 修订（2026-09-27 16:28 Codex 反证复核）

正文 15:51 结论保留。本轮只读代码，未上传、未跑 e2e。详见 `docs/grok-review-corrections.md`。源文件哈希未变。

**PH-1**

- 原：没有序号，A 晚到会 `persist` 成 A 的 URL。把回调写成 `useMutation` 的 hook `onSuccess`。
- 反证：persist 在 `mutate(file, { onSuccess })`。安装版本 `@tanstack/query-core@5.103.1` 中，第二次 `mutate` 覆盖 `#mutateOptions` 并从第一次 Mutation 卸观察者。A 的 per-call persist 不会跑。hook 配置回调会在 `Mutation.execute` 里无条件调用，但当前 hook 没有 persist。删除走独立的 `deleteFile` observer，所以上传中删除时上传回调仍会执行。
- 修订：撤回「连续上传 A 覆盖 B」。保留「上传中删除后写回」，P1。被取消的上传留下存储对象降为 P2。裁剪中再选图待运行验证。没有序号不能单独当竞态证据。

**PH-2**

- 原：删除立刻删对象，撤销只恢复 URL。
- 反证：`writeResumeVersion` 只存 JSON，上限 30，不复制 blob。替换不删旧 key。非同源不删。没有引用计数或延迟 GC。
- 修订：保留 P1，缩小为同源图被删除后再撤销或恢复仍引用该 key 的历史版本。

**PH-3 / PH-4 / PH-5 / PH-6**：本轮未作为 Codex 反证重点，结论未改。
