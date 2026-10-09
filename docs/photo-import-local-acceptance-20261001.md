# 照片与导入优化：本地验收及对抗性复核

日期：2026-10-01。续接 `photo-and-import-optimization-review-20261001.md`。

## 结论

本轮预览修复、图片兼容修复和本地验收完成，可继续用户体验验收。
本结论限定于下列本地源码、镜像、样例和测试，不能等同于全系统无缺陷或生产发布通过。

- 环境：独立 Compose 项目 `ux_acceptance_20261001`，应用仅绑定 `127.0.0.1:3300`。
- 镜像：`sha256:1188c29e69a9e7b0bace7ae022ff9a5c72fff45d9bd0b0c70de7bf2727cbcc9d`。
- HEAD：`ef30b1d819044584b0f729d21e5c186cf3935722`；验收镜像包含当前未提交源码。
- 未提交、未推送、未部署；本轮未操作线上数据库。
- 浏览器操作与数据库核对均使用独立本地验收账号和虚构样例。没有回退其他工作区改动。

## 修复及第一性原理复核

### 1. 侧栏遮住第一页、多页居中错误

预览原来使用 `fixed inset-0`，缩放容器占据整个窗口，计算居中时不扣除两侧编辑栏。
同时 `centerOnInit` 和 `resetTransform()` 以整份多页文档为基准；竖排时容易把视点放到文档中段。
手机预览的 50% 最小缩放也不能保证小屏幕显示完整纸张。

修复：

- 预览限制在桌面中央面板，以及手机页眉与底部标签栏之间的区域。
- 工具栏随预览区域定位。
- 初始适配、侧栏/窗口尺寸变化、横竖排切换，以第一页的实际尺寸和位置计算缩放。
- “适合观看”和 Ctrl/Cmd+0 回到第一页顶部；“实际尺寸”也以第一页为基准。
- 最小缩放降为 10%，给手机适配留出空间。
- 普通内容编辑、PDF 页面数量变化和同尺寸渲染切换不重置用户缩放；几何比较对浮点偏移取两位小数，避免微小测量误差触发重置。

相关文件：

- `apps/web/src/routes/builder/$resumeId/-components/preview-page.tsx`
- `apps/web/src/routes/builder/$resumeId/-components/preview-fit.ts`（新文件，发布时需要纳入）
- `apps/web/src/routes/builder/$resumeId/-components/preview-fit.test.ts`
- `apps/web/src/routes/builder/$resumeId/-components/dock.tsx`
- `apps/web/src/routes/builder/$resumeId/-components/mobile-builder-shell.tsx`

### 2. 浏览器 PDF 图片处理的 Buffer 警告

实际依赖 `@react-pdf/layout@5.2.0` 的 `fetchImage` 在图像解析成功后，直接调用
`Buffer.isBuffer(source)`。浏览器没有 Node 全局 `Buffer`，因此随后抛错，被 catch 转成警告；
图片可能已经显示，但缓存标识没有完成设置。不能把“图片可见”当作处理链没有错误。

修复已有依赖补丁，在访问 Buffer 和 Blob 前检查它们是否存在。
保留补丁中原有的空白字符和分页修复，没有引入浏览器全局 Buffer。
通过离线依赖安装更新锁文件中的补丁哈希；Word 导入已有的 fflate 依赖改动保留。

相关文件：

- `patches/@react-pdf__layout@5.2.0.patch`
- `pnpm-lock.yaml`
- `packages/pdf/src/image-assets.browser-compat.test.ts`

## 自动化结果

| 范围 | 结果 | 证据日志 |
| --- | --- | --- |
| 完整 Web 套件，2 workers，保留测试隔离 | 152 文件，1102/1102 | `output/ux-e2e-20261001/full-web-final.log` |
| 完整导入包 | 10 文件，182/182 | `output/ux-e2e-20261001/full-import-final.log` |
| 完整 DOCX 包 | 9 文件，77/77 | `output/ux-e2e-20261001/full-docx-final.log` |
| PDF 图片兼容、15 模板照片比例、真实 PDF 空白字符回归 | 3 文件，44/44 | `output/ux-e2e-20261001/preview-image-tests.log` |
| 全工作区类型检查 | 19/19 | `output/ux-e2e-20261001/final-preview-typecheck.log` |
| 本轮 6 个源文件/测试文件 Biome | 通过 | 终端记录 |
| Turbo boundaries / git diff --check | 通过 | 终端记录 |
| 生产镜像本地重建 | 成功 | `output/ux-e2e-20261001/preview-final-build.log` |

单独跑过的预览适配/横竖排测试 15/15 已包含在完整 Web 套件中，不重复计数。
类型检查初跑发现本轮测试的 optional 类型和预览实例属性错误，修复后重跑 19/19 通过。

## 对抗性检查

- 几何测试：600×800、390×724、320×480、1200×900 可用区域，RTL 页偏移、实际大小、零/负/NaN/Infinity 测量值。
- 依赖兼容测试执行实际安装的图片解析函数，覆盖没有 Buffer/Blob、同源 URL、data URL、Blob、Node Buffer 和真实图片解析失败。
- 原逻辑重放：仅在独立 VM 中恢复旧判断，复现 `Buffer is not defined` 且图片 key 未完成；修复逻辑无警告且 key 正确。不改工作区源码来制造故障。
- 完整 Web 套件包含照片上传过期回调、上传/删除保护、原图尺寸旧回调、取消首次裁剪等既有回归。这些是模拟时序测试，本轮没有再次宣称为真实网络竞态复现。
- Word 解析测试包含损坏 ZIP、缺少正文、空/纯图片文档、非法 XML/实体声明、文件与解压 XML 大小上限、孤立页眉、无关嵌入媒体等。
- 浏览器实际验证：100% 缩放下改为正方形，保存和重新渲染后仍为 100%；撤销恢复 3:4，再适配窗口成功。

## 真实浏览器及导出验收

### 照片与预览

样例：`http://127.0.0.1:3300/builder/01a0f6d5-c967-7168-b9fa-02642fd2352b`。

- 两侧栏展开：中央区域 x=384.41 至 895.60；第一页 x=443.42 至 836.57，y=80 至 648.11。第一页不被侧栏遮挡。
- 五页横排和竖排均从第一页顶部开始，页面数量没有把首页缩成整份文档的缩略图。
- 手机 390×844：可用预览区域 y=56 至 780；第一页 x=16 至 374.16，y=80 至 597.55，测量取整误差小于 1 像素。
- 手机页面 `scrollWidth=390`，照片比例三按钮均落在 390px 内；底部缩放控件可见。
- 手机覆盖设置完成后已恢复默认视口。
- 本轮照片重新渲染与导出后的控制台检查没有新增 warn/error；旧页面加载时期的历史 Buffer 警告按时间区分，没有冒充修复版警告。
- 从浏览器下载最终 PDF，54,453 字节；实际栅格化照片为 120×160 像素，符合 3:4。PDF 核心字段文本仍存在。

证据：

- `output/ux-e2e-20261001/screenshots/preview-first-page-fixed.png`
- `output/ux-e2e-20261001/screenshots/photo-mobile-edit-fixed.png`
- `output/ux-e2e-20261001/screenshots/photo-mobile-preview-fixed.png`
- `output/ux-e2e-20261001/exports/photo-preview-final.pdf`
- `output/ux-e2e-20261001/exports/photo-preview-final-page-1.png`

### Word 基础导入

样例：`http://127.0.0.1:3300/builder/01a0f72c-d5a9-73dd-87fd-7d710fed4d9d`。

上传 `word-fixtures/basic-zh.docx`，AI 增强关闭，完成浏览器基础导入：

- 姓名、邮箱、电话进入基本信息。
- 学校“示例大学”、专业“软件工程”、学历“本科”、日期独立正确。
- Word 表格中的公司“示例有限公司”、岗位“后端工程师”、日期独立正确。
- “开发基础”保留 C++/SQL/Docker；“运维工具”保留 Linux/Python/MQTT。
- 姓名修改为“Word验收甲－刷新确认”，等待保存后刷新，字段仍存在。
- 从商务标准职场切换到简约紧凑技术（scizor），上述字段仍完整；独立数据库只读断言 10 项通过。

证据：`output/ux-e2e-20261001/screenshots/word-import-template-fixed.png`。

浏览器文件上传工具一次异常等待约 40 分钟。完整 Web 测试耗时约 460 秒，生产镜像构建成功；
上传工具返回后才执行应用的导入动作。不能把工具等待归因于应用导入耗时。

## 必须保留的能力边界

1. **DOCX 导出仍不嵌入照片。** 本轮浏览器实际下载 DOCX，文字标记存在，ZIP 中 `word/media/` 为零。
   这与当前生成器实现一致，属于现有能力缺口；没有完成 DOCX 照片功能。
2. Word 基础导入读取文字和结构，不保留原文档照片及原排版。导入界面已明确提示；复杂版式仍需要核对，必要时用户主动选择 AI 增强。
3. 未运行完整 PDF 包所有套件；运行的是上述 44 个相关测试及真实 PDF 导出。没有验收真实 LLM、生产环境、真机键盘/中文输入法。
4. 本轮测试可以降低回归风险，不能证明所有输入、网络故障或生产配置下都不会出错。

## 可重跑核验

从项目根目录运行：

```powershell
pnpm --filter web test --maxWorkers=2
pnpm --filter @reactive-resume/import test
pnpm --filter @reactive-resume/docx test
pnpm --filter @reactive-resume/pdf test image-assets.browser-compat picture-fit.integration literal-whitespace.integration
pnpm typecheck
pnpm exec turbo boundaries
git diff --check
node output/ux-e2e-20261001/photo-preview-final-state.mjs
node output/ux-e2e-20261001/preview-followup-verify.mjs
```

后两条只读独立验收库并写本地证据，需要本地 Docker 运行及上述样例存在。
结果分别写入 `photo-preview-final-state.json` 与 `preview-followup-state.json`。
前一文件核对既有 8 个运行文件；后一文件核对本轮 6 个文件，包括新建预览 helper、依赖补丁和锁文件。
这些文件与实际 Docker 构建源快照哈希一致。

## 用户验收建议

不需要用户运行测试命令。请在本地用自己的 Word 文档和原始照片核对：

1. 导入后的姓名、学历、专业、公司、岗位和技能是否符合原文。
2. 竖版 3:4、正方形和原图比例哪个更合意；裁剪后头顶和肩部是否合适。
3. 修改后撤销/重做、刷新和切换模板是否符合预期。
4. 在真实手机上查看表单、缩放和拖动的手感。

生产发布需要另行核对目标镜像、数据库迁移和线上验收；本轮没有发布。
