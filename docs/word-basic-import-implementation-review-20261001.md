# Word 基础导入：实现与本地验收（2026-10-01）

## 结论与范围

`.docx` 默认使用浏览器中的基础识别，不要求配置 AI；已有 AI 配置也不会自动发送 Word 文件。只有主动开启“AI 增强识别”才调用原有 AI 接口。独立本地验收服务 `http://127.0.0.1:3300` 已更新，账号和数据卷保留。

本次没有提交、推送、部署到生产，未访问或修改线上数据库。HEAD 保持 `ef30b1d819044584b0f729d21e5c186cf3935722`。前一批保存提示、照片界面、移动端、PDF 导入等未提交改动保留。本报告仅覆盖此次 Word 基础导入，不能据此宣称全系统无缺陷。

## 为什么以前要求 AI

原导入窗口把 Word 的识别能力直接绑定到 `client.ai.parseDocx`：没有服务商便禁止提交。这是应用流程的限制。DOCX 本身是 ZIP 包，可以读取其中的 Word XML 文字，再使用项目已有的简历规则解析器，无需模型参与文字提取。

基础识别处理的是文字和字段，不是 Word 排版复制；转换后的简历 JSON 仍提交到本应用保存，不能理解为整个导入过程离线完成。

## 按文件的改动

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/dialogs/resume/import.tsx` | Word 默认基础导入；AI 开关默认关闭；主动选择 AI 才检查服务商；新文件重置开关；异步文件检测防止晚到结果覆盖；识别异常仍走已有核对确认流程 |
| `apps/web/src/dialogs/resume/import.utils.ts` | 增加旧版 `doc` 类型，与可读取的 `docx` 分开 |
| `apps/web/src/features/resume/import/docx-text.ts`（新增） | 浏览器 DOCX 文字提取，复用 `parseResumeText`；读取段落、表格、文本链接及引用的页眉页脚；保留分段和表格字段边界 |
| `apps/web/src/features/resume/import/errors.ts`（新增） | 仅受控、本地化的识别错误可直接展示，避免具体建议被通用“未知错误”吞掉 |
| `apps/web/src/features/resume/import/docx-text.test.ts`（新增） | 格式、中文、表格、修订、编码、异常及资源上限测试 |
| `apps/web/src/dialogs/resume/import.dialog.test.tsx` | 无服务商/有服务商/服务商加载中的基础导入；AI 显式选择；取消；旧版与加密文件；连续选择；安全错误提示；既有 PDF/JSON 与离开配置页面回归 |
| `apps/web/package.json`、`pnpm-lock.yaml` | 直接声明已有依赖 `fflate@0.8.3`，冻结锁文件构建成功 |
| `apps/web/locales/en-US.po`、`zh-CN.po`、`zh-TW.po` | 只补本功能的 9 条文案，没有批量提取其他语言目录 |

PDF 的既有识别模式与三个 JSON 格式没有改为 Word 的开关模式。`parseResumeText` 本轮未修改，177 个测试验证其原行为仍通过。

## 格式和资源边界

- 文件输入上限 15 MiB，选中文本 XML 的解压总量上限 2 MiB，ZIP 条目上限 1024。
- 只解压正文 XML、页眉页脚 XML 及其关系文件，不解压图片和其他媒体。
- 支持常见 Transitional/Strict Word XML、UTF-8 和 UTF-16。
- 只读取文本，不执行宏、链接、外部关系或 XML 实体；拒绝 DOCTYPE/ENTITY。
- 读取可见最终文本：跳过删除修订、隐藏文字和域指令，保留插入修订。
- 旧版 `.doc`、OLE 加密的 `.docx` 提示用 Word/WPS 另存为未加密 `.docx`，不提交 AI。
- 损坏文件、无文字/图片扫描文件、超限文件给出中文提示，不创建简历。

## 自动检查结果

| 检查 | 最终结果 |
| --- | --- |
| Web 导入相关 7 个测试文件（DOCX/PDF 提取、导入窗口、格式/JSON、核对规则、真实语言目录） | 63/63 通过 |
| `@reactive-resume/import` 10 个测试文件 | 177/177 通过 |
| `pnpm typecheck` | 19/19 成功 |
| 本轮 7 个源文件/测试/包配置的 Biome 检查 | 通过 |
| `pnpm exec turbo boundaries` | 20 个包、1524 个文件，无问题 |
| 最终 Docker 生产构建 | server/web 2/2 成功，镜像更新后健康检查通过 |

两份本轮文档的定向 Markdown 检查通过。仓库的 `markdownlint-cli2` 配置会额外扫描所有 Markdown，全仓检查另有 6 个既有文档/构建快照的 28 条问题；未改动这些其他报告，也不把全仓文档检查写成通过。

浏览器发现“损坏文件显示未知错误”后，先新增失败测试，确认受控错误被吞掉，再修复并重跑上述导入测试。新测试同时证明原始 ZIP 错误仍使用安全回退文案。

可重跑命令：

```powershell
pnpm --filter web test src/features/resume/import src/dialogs/resume/import src/dialogs/resume/parse-json src/libs/locale-catalogs.test.ts --maxWorkers=2
pnpm --filter @reactive-resume/import test --maxWorkers=2
pnpm typecheck
pnpm exec turbo boundaries
```

最终构建日志：`output/ux-e2e-20261001/word-compose-build-final.log`。构建中 lefthook 提示容器缺少 Git，安装及 server/web 构建均成功，该提示不影响运行镜像。

## 真实浏览器验收

使用独立虚构账号 `ux_oct01@example.test`，未配置真实 AI 服务商。Word 文件均为脚本生成的虚构样例。

| 场景 | 证据/结果 |
| --- | --- |
| 选择中文 DOCX | 显示中文基础导入说明，AI 开关关闭，导入可用 |
| 开启 AI、未配置服务商 | 提示服务商要求并禁止提交；关闭开关立即恢复基础导入 |
| 正常 DOCX 导入 | 姓名/邮箱/电话、表格公司/职位/日期、正文、两组技能及关键词进入编辑器与数据库 |
| 刷新 | 同一简历姓名和数据保留 |
| 网络观察 | 17 个请求中存在 `resume/import`，无 `ai/parseDocx` 或其他 AI 解析请求；记录未截断 |
| 旧版 DOC | 明确中文另存提示、禁用导入，没有创建简历 |
| 缺少职位的 DOCX | 先弹“请核对识别结果”；取消后回到原窗口，没有创建简历 |
| 损坏 DOCX | 最终镜像显示“此文件不是可读取的 DOCX 文档。请另存为未加密的 .docx 文件后重试。”，可重新选择文件 |
| 数据边界 | 简历总数从 3 增到 4，仅正常导入新增一份；取消、旧版、损坏文件未新增 |

已导入的 Word 样例：`http://127.0.0.1:3300/builder/01a0f64f-4208-77f9-8b0f-616c97d2c20d`。

最终镜像：`sha256:688a95a854dc35aeed6394ea3f5d0e146118a0d80784a99426878dd3402b9482`。9 个功能相关源文件、依赖和目录的工作区哈希与构建快照一致，记录于 `output/ux-e2e-20261001/word-final-state.json`。

截图与证据：

- `output/ux-e2e-20261001/screenshots/word-basic-import.jpg`
- `output/ux-e2e-20261001/screenshots/word-imported-builder.jpg`
- `output/ux-e2e-20261001/screenshots/word-imported-builder-final.jpg`（最终镜像再次读取）
- `output/ux-e2e-20261001/screenshots/word-old-format.jpg`
- `output/ux-e2e-20261001/screenshots/word-import-review.jpg`
- `output/ux-e2e-20261001/word-network-evidence.json`
- `output/ux-e2e-20261001/word-final-state.json`
- `output/ux-e2e-20261001/create-word-fixtures.py`、`word-fixtures/`（可重建样例）

## 已知识别限制与未验证项

1. **学历/专业的对应仍需核对**：真实样例“示例大学  软件工程  本科  2020.09 - 2024.06”被已有规则解析为 `degree=软件工程`、`location=本科`、`area` 为空。文字未丢失，但语义字段错位。本次没有改共享的教育解析规则，也不能声称教育字段全部准确。下一轮建议优先补中文学历/专业顺序识别、地名反例及核对提示。
2. 基础导入不恢复照片、字体、版式、完整编号格式；复杂文本框、脚注和非标准命名的页眉页脚不保证完整。超出资源边界的复杂文档需要精简后再导入。
3. 真实付费 AI、真实 Word/WPS 的全部保存版本、真机中文输入法、此次改动后的全量 Web/PDF 套件和生产发布未验证。AI 分支仅测试调用选择与回退，不冒充真实模型端到端验证。
4. 前一批已注明的“Word 导出未嵌入照片”不属于此次 Word 导入改动，仍保留在手动清单。

此功能可以继续本地验收。用户重点用自己的**脱敏 Word 文件**核对学历、专业、职位、技能分组，记录格式和错位字段；无需购买模型额度或填写真实 API Key。
