# 模板库验收报告

范围：15 个稳定模板 ID、分类目录、③—⑬参考映射、中文编辑器切换、PDF renderer。

通过项：

- 15 个模板均在目录中且 ID 未改变；首页固定4个代表入口，分类覆盖4种不同主分类。
- 分类计数与筛选正确；搜索无结果显示清除筛选；手机390px分类横向滚动，卡片可继续浏览。
- 模板卡片先进入预览；“用我的内容预览”使用当前 ResumeData；“使用此模板”才写入；撤销保留。
- 15 个模板均保留54个可见技能关键词，隐藏技能组不输出，renderer 不修改输入数据。
- scizor、rhyhorn、ditto 均输出 A4 短、长、无照片样例；长样例达到3页，图像已渲染检查。
- 中文字体使用本地 CJK fallback；长标题、中文英文混排和缺照片样例已覆盖。
- ③—⑬原图已逐张核对，并唯一映射到 `ditgar`、`meowth`、`scizor`、`rhyhorn`、`azurill`、`pikachu`、`onyx`、`gengar`、`lapras`、`kakuna`、`chikorita`。保留项和产品化差异见 `docs/template-reference-mapping.md`。
- 2026-09-27 重新运行模板目录 4 个测试文件、14 个用例，以及 PDF 模板库 18 个用例，全部通过；PDF 与 import 包类型检查通过。
- 真实 Playwright 浏览器在当前源码的本地 Vite 页面核对：首页固定 4 个精选模板、全库 15 个、分类计数 `4/3/3/2/3`、学术筛选 2 个、搜索空状态与清除入口、先预览后显式应用、390px 浏览。截图见 `output/playwright/p2-template-library-mobile.png`。
- 真实 PostgreSQL 本地生产栈恢复后，P3 浏览器链路从 `chikorita` 切换到 `onyx`，确认只有点击“使用此模板”才写入，并在硬刷新、四格式导出、JSON 回导后继续保持模板与核心字段。
- 回导的新简历已开启公开访问，全新匿名浏览器在 `http://127.0.0.1:3200/editor.review/0927-0506-80` 看到姓名和求职意向。完整结果、导出文件和截图位于 `output/playwright/p3-acceptance/`。

P3 核心链路已使用真实数据库与真实接口通过。PDF 已完成文字和图像检查；DOCX 的 OOXML 结构及核心字段通过，但因当前工作区依赖没有提供内置 LibreOffice，尚未完成 documents 技能要求的视觉渲染。断网恢复、双标签并发及 zh-TW/英文完整链路仍属于扩展覆盖矩阵。
