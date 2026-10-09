# 中文编辑器与模板目录实施报告

日期：2026-09-26

本批完成 P0、P1、P2，以及 P3 的真实数据库核心全链路。中文空白简历使用 `metadata.editor` 可选配置保存场景（`general`、`graduate`、`experienced`、`academic`），缺失配置按兼容规则处理。场景选择只决定编辑入口和新增场景章节，不修改已填内容、章节 `hidden` 状态、照片或既有布局。

P0 改动：`blank-zh-cn` 默认布局收敛到常用入口；侧栏、图标栏、移动端和“添加章节”共用 `getEditorSections` 计算可见性。空推荐人不默认出现，含数据的旧推荐人仍可编辑、导出和从隐藏章节恢复。技能整理入口移到技能章节标题附近。基本信息中的性别、年龄、政治面貌、详细地址等选填项收进“更多个人信息”。

P1 改动：新增稳定 renderer ID 对应的 `templateCatalog`，覆盖15个模板；分类为简约、商务、校园、学术、设计感。首页固定四个精选模板。模板库提供分类计数、搜索、单/双栏、密度筛选、空结果清除；点击卡片先预览，显式点击“使用此模板”才写入模板 ID，现有撤销逻辑继续保留。

P2 完成项：仓库根目录的③—⑬参考图已逐张检查，11 张图按中文优先顺序唯一映射到 11 个真实 renderer；各自保留的结构与有意差异记录在 `template-reference-mapping.md`。纯文本联系方式导入补充两个边界修复：PDF 头部同一行含出生日期和手机号时不再漏号；带字间空格的“姓 名 / 电 话 / 邮 箱”标签可以结构化提取。首页精选测试同步到固定四模板集合。

验证：此前 P0/P1 的 `pnpm --filter web typecheck`、schema 143 tests、API initial-data tests、resume editor policy tests、web editor/template tests、`pnpm exec turbo boundaries` 均通过。2026-09-27 本轮重新运行 import 10 文件 173 用例、模板目录/首页 4 文件 14 用例、editor section policy 4 用例、PDF 模板库 18 用例，并通过 web/import/PDF 类型检查。真实 Playwright 浏览器在当前源码的本地 Vite 页面验证了首页四个精选模板、15 模板全库、分类计数、学术筛选、搜索空状态、显式预览后应用和 390px 布局；证据为 `output/playwright/p2-template-library-mobile.png`。

P3 核心链路（2026-09-27）：清理 Docker Desktop 的两个失效 socket 目录后，保留原数据库和文件卷，构建当前源码的本地生产镜像，并在 `http://127.0.0.1:3200` 启动真实 PostgreSQL 栈。Playwright 使用真实登录会话完成“新建/填写 → 保存 → 硬刷新 → 切模板并显式应用 → PDF/DOCX/Markdown/JSON 导出 → JSON 回导为新简历 → 开启公开访问 → 全新匿名浏览器打开公开页”。保存刷新后姓名、求职意向、邮箱、电话、城市和 `graduate` 场景均保持；模板从 `chikorita` 切换到 `onyx` 后刷新仍保持；JSON 回导保留全部核心字段和模板。最终公开验收地址为 `http://127.0.0.1:3200/editor.review/0927-0506-80`，浏览器标题为“林测试 - Weekly Resume”。机器可读结果与截图位于 `output/playwright/p3-acceptance/`。

导出核验：PDF、DOCX、Markdown、JSON 均由浏览器成功下载，大小分别为 11024、8962、151、6044 字节。PDF 已用内置 Poppler 渲染为 1 页并逐页查看，姓名、求职意向、邮箱、电话和城市清晰，无截断或重叠。DOCX 是结构完整的 OOXML 包，`word/document.xml` 包含上述五个核心字段；当前工作区依赖未提供 documents 技能要求的内置 LibreOffice，因此没有声称 DOCX 视觉渲染通过。浏览器记录到的唯一 HTTP 500 是未配置 AI 提供商时的 `api/rpc/aiProviders/list`，简历保存、导出、回导和公开分享接口均成功。

P3 扩展覆盖矩阵仍待后续回归：zh-TW/英文完整链路、双标签并发、断网恢复，以及组合覆盖旧数据、隐藏个人字段和 3 页以上内容。P2 已分别覆盖 390px、无照片、3 页长样例和旧推荐人兼容规则；这些结果不替代扩展矩阵的端到端组合验收。

回滚：删除 `metadata.editor` 字段不会破坏旧简历；恢复空白模板布局和原 `labels.ts` 可撤回 P0/P1。未执行提交、推送或部署；本地生产栈保持运行，供用户验收。
