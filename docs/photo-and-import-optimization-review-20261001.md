# 照片比例与基础导入修复验收

日期：2026-10-01。执行者：Codex。

## 结论与范围

本轮完成照片比例控制、模板照片高度以及截图样例的多栏 PDF 导入修复，已更新隔离的本地 3300 环境。未提交、未推送、未部署生产，未修改原来的截图简历或线上用户数据。

- HEAD：`ef30b1d819044584b0f729d21e5c186cf3935722`。
- 最终验收镜像：`sha256:3510a4be3d898b487069eb8b534d65d71f1497985e08008ce980ebc02333b6a6`。
- 最终新导入样例：<http://127.0.0.1:3300/builder/01a0f6d5-c967-7168-b9fa-02642fd2352b>。
- 独立 Compose 项目：`ux_acceptance_20261001`，独立数据库、上传文件、测试账号；数据卷保留。
- 结论限于下述测试与样例，不是全系统发布放行。

## 一、根因

### 照片看起来太短

简历照片需要分别定义容器宽高和图片填充方式。原来的公共模板同时使用 `size` 作为宽度和高度；即使设置非正方形比例，容器仍保持正方形。截图中的 80pt 图片因此不会变成用户期望的竖版照片。

本轮统一为 `width = size`、`height = size / aspectRatio`。80pt、3:4 的高度为约 106.67pt。`cover` 按比例裁剪，`contain` 保留完整内容，均不拉伸。原先已经裁掉的像素无法从旧文件中恢复，必须重新上传原图。

### 截图正文混乱

追溯证据显示，截图简历来自之前的 PDF 导入测试，并非此次 Word 基础导入。PDF 保存的是文字坐标，不保存可靠的章节语义。旧提取只按横向基线拼行，会把左侧技能与右侧教育、工作内容连接起来；跨页侧栏和单页内部的局部双栏进一步破坏了阅读顺序。

修正阅读顺序后，浏览器实测又发现独立的语义问题：中文默认章节名缺少别名、熟练度被当成独立技能、项目链接提示被当成新标题、证书颁发机构被当成下一张证书、描述换行被误认成公司。已逐项补准确字段断言并修复，未只用条目数量判定成功。

## 二、实现

### 照片编辑

- 主面板直接提供“竖版 3:4”“正方形 1:1”“原图比例”。
- 首次上传且选择裁剪填满时，裁剪窗口默认建议 3:4；取消不写入比例或照片。
- 已有照片更换时保留其既有比例；没有批量修改旧简历。
- 原图比例读取图片真实尺寸，设置完整显示；宽高比仍受现有数据约束 0.5–2.5 限制，极端比例通过留白完整显示。
- “大小”改为“照片宽度”，说明高度跟随比例，并提醒重新上传才能找回以前裁掉的内容。
- 读取原图比例使用请求序号和 URL 校验，过期加载回调不能覆盖后选比例；删除、改比例和卸载使回调失效。
- 公共传统模板、语义化样式、Chikorita 侧栏占位、Ditto 页眉高度均按实际照片高度处理。Ditto 正方形布局沿用原来的高度基准，仅为竖版补足额外高度。
- 只追加本轮 6 条英、简中、繁中文案，未全量提取所有语言。

主要运行时文件：

- `apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/picture.tsx`
- `packages/pdf/src/templates/shared/base-template-styles.ts`
- `packages/pdf/src/semantic/base-styles.ts`
- `packages/pdf/src/templates/chikorita/ChikoritaPage.tsx`
- `packages/pdf/src/templates/ditto/DittoPage.tsx`

### 基础导入

- 保留原有可靠分栏规则；增加正文区域的分栏证据，避免居中页眉遮挡栏间空白。
- 同宽连续双栏页面按左栏跨页、右栏跨页读取；混合布局按章节区域重新判断。
- 对齐到右侧的日期不能仅凭水平空白被识别为独立侧栏。
- 全宽跨栏文字只输出一次。真实三页样例新增字符多重集断言，保证重排没有遗漏或重复非空白字符。
- 学历、专业、成绩、城市按明确语义识别；不确定的字段保留到描述，兼容原有英文解析。
- 新增“证书信息”“语言”“推荐人”的章节别名，保留文档原有章节内容。
- 技能名、熟练度、关键词三行结构合并成同一技能。
- 修复标题前普通英文单词被当成月份、换行描述误判，以及“View on…”链接提示误判。
- 证书冒号后换行的标题合并；明确的短机构名可从日期后提取，已有机构字段不被覆盖。
- 对抗性检查发现并修复小写公司名回归：`acme studios` 后跟岗位与日期时仍独立成条目。

主要运行时文件：

- `apps/web/src/features/resume/import/pdf-text.ts`
- `packages/import/src/plain-text.ts`
- `packages/import/src/skill-lines.ts`

## 三、验证

| 检查 | 结果 | 实际边界 |
| --- | --- | --- |
| import 完整包 | 10 文件、182/182 通过 | 含中文专业/学历顺序、小写公司、原有英文基线 |
| web 定向测试 | 6 文件、76/76 通过 | PDF 阅读顺序与真实坐标样例、Word 提取、导入对话框、照片交互与标签 |
| PDF 照片矩阵 | 26/26 通过 | 15 个模板的实际 PDF 光栅照片宽高，加既有填充与样式回归 |
| 先前公共 PDF 回归 | 4 文件、68/68 通过 | 照片边框、阴影、填充与传统/语义模板兼容；未跑全量 PDF 套件 |
| typecheck | 19/19 成功 | 最终运行时修改后执行 |
| Biome / diff | 修改文件检查、`git diff --check` 通过 | 没有运行会改动全仓库的自动修复 |
| 生产式本地镜像 | 构建完成、健康检查 healthy | 仅本地 3300 |
| 最终镜像浏览器 PDF 导入 | 通过 | 无 AI 服务商，上传原三页虚构 PDF |
| 实际照片上传 | 通过 | 自制 300×400 标记图片，首次 3:4 裁剪上传 |
| 比例切换、撤销/重做 | 通过 | 键盘激活撤销/重做；原图比例设置完整显示 |
| 刷新持久化 | 通过 | 3:4、完整显示和照片 URL 均保留 |
| 实际浏览器 PDF 导出 | 通过 | 下载文件 54,453 字节，光栅照片 120×160px，关键文字存在 |
| 源码与镜像上下文 | 8 个运行时文件一致 | SHA-256 记录在最终状态文件 |

最终数据库与导出内容核验：教育学历 Bachelor of Science、专业 Computer Science、成绩 3.6 GPA；五个技能组；三家公司；三个准确项目名；两张证书和机构；两种语言及熟练度；两条独立志愿经历。未将已有“推荐人”或英文内容静默删除。

浏览器下载事件监听两次超时，但文件实际已写入 Windows Downloads。读取真实下载物并检查，确认这是工具监听边界，不能记成系统导出失败。

可重跑命令（仓库根目录）：

```powershell
pnpm --filter @reactive-resume/import test
pnpm --filter web test src/features/resume/import/pdf-text.test.ts src/features/resume/import/pdf-layout.integration.test.ts src/features/resume/import/docx-text.test.ts src/dialogs/resume/import.dialog.test.tsx 'src/routes/builder/$resumeId/-sidebar/left/sections/picture.test.tsx' 'src/routes/builder/$resumeId/-sidebar/left/sections/field-labels.test.tsx'
pnpm --filter @reactive-resume/pdf test src/templates/shared/picture-fit.integration.test.tsx
pnpm typecheck
node output/ux-e2e-20261001/photo-import-final-state.mjs
```

最后一条仅只读查询隔离测试数据库、校验源码快照与实际导出文件，需要 Docker 可用。不要把本地 Compose 和测试密钥用于生产。

## 四、证据

证据位于 `output/ux-e2e-20261001/`：

- `photo-import-final-state.json`：最终镜像、健康状态、运行时哈希、样例字段与照片像素。
- `photo-import-final-state.mjs`：只读复核脚本。
- `exports/photo-import-final.pdf`：实际浏览器导出文件。
- `exports/photo-import-final-page-1.png`、`exports/photo-import-final.txt`：光栅及正文核对。
- `screenshots/photo-import-fixed.png`：最终本地编辑器截图。
- `screenshots/photo-ratio-controls.png`：照片比例主面板的局部截图。
- `portrait-3x4-fixture.png`：自制边缘标记图片，不含真实人像。
- `photo-import-web-tests.log`、`photo-import-typecheck.log`、`photo-import-build-accepted.log`。
- `apps/web/src/features/resume/import/__fixtures__/multi-page-columns.json`：真实虚构 PDF 提取坐标，纳入回归测试。

## 五、保留边界与后续事项

1. 旧简历已经保存错误字段，刷新不会重新解析，也不会自动改写用户数据。应重新导入原文件为新简历，逐项确认后决定使用哪份。
2. 已经正方形裁剪过的照片无法补回被裁掉的像素；应重新上传原图。
3. 基础解析仍依赖版式与语言线索。无法保证任意 PDF/Word 自动还原原排版；扫描文件不属于本轮文字解析范围。
4. 样例中 PDF 连字符、联系人地址/网址合并、GitHub/LinkedIn 标签留在评价里、兴趣逐行拆分仍需人工整理；本轮保留原文，没有用不可靠规则猜测后删除。
5. 真实浏览器仍观察到上游 `@react-pdf/layout` 图片资产路径的 `Buffer is not defined` 警告。当前图片和 PDF 导出实际存在且像素核验通过；应作为后续依赖兼容问题处理，不能声称控制台完全无警告。
6. Word 中文学历/专业映射在本轮单元与提取链路中覆盖；本轮没有重跑新的完整 Word 上传浏览器验收。前一轮 Word 基础导入已有独立端到端报告。
7. DOCX 中照片的导出能力、扫描 OCR、真实 LLM、全量 web/PDF 套件、手机实机、本次生产部署均未验证，不包含在本轮完成结论中。
8. 多页预览的“适合观看”现有实现只是重置变换，未按侧栏占位与首张纸张重新适配；在窄窗口可能出现预览被侧栏遮挡。此为后续预览交互优化项，不等同于导出裁切；本轮实际 PDF 首张纸张完整，照片和正文像素核验通过。

## 六、兼容与撤回

未改默认简历 schema、未执行数据迁移、未批量更新历史照片比例。回退本轮实现只影响后续渲染和导入，已导入数据仍需用户选择恢复历史版本或删除新测试副本。

工作区还包含前几轮 UX、Word 基础导入和其他作者的改动。本报告文件清单说明本轮范围；不能直接对这些共享文件执行 `git restore` 作为撤回，会一起丢失之前的工作。应按本轮补丁逐项撤回，保留已有上传并发保护与草稿恢复。
