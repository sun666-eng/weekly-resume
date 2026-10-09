# 中国岗位参考与中文 ATS 修复验收记录

实施目录：`weekly-resume-release`。日期：2026-10-06。

## 交付行为

- 独立 ATS 页面和编辑器深度检查共用“中国岗位参考（可选）”控件。默认不选择岗位；现有 10 个岗位可选，求职阶段默认不限。
- 岗位参考独立于解析评分、扣分、检查通过率及 JD 词项。无 JD 时仅提供人工基线清单，不生成岗位匹配率；有 JD 时只从实际 JD 提取词项。
- 展示关键词“已出现／未见文本证据”、证据偏好、来源和画像方法；关键词出现不证明具备能力，未出现不证明缺少技能。
- 普通规则先按阶段及章节、关键词关联筛选，再按关联程度、依据分级和规则编号稳定排序，最多 8 条。完整适用硬约束可以展开；当前库包含 17 条硬约束。
- 规则保留编号、描述、审核问题、依据分级、来源链接和复核日期。描述作为审核清单，不自动判定经历真实性。
- 检测结果保存 JD、岗位和求职阶段。修改这些输入或编辑器简历内容后提示重新检测，并暂时隐藏旧报告的 AI 审阅入口。

## 数据和接口

`knowledge/china-job-rules/` 仍是唯一数据源：54 条规则、10 个画像、8 个来源，版本 `0.1.0`。10 个画像仍全部属于 `curated_practice`，没有新增招聘平台统计或采集。

`pnpm knowledge:generate` 生成 `packages/resume/src/china-job-rules/snapshot.ts`。新导出为 `@reactive-resume/resume/china-job-rules`。`pnpm knowledge:check` 校验 schema、版本、来源引用和快照一致性；根构建及 Docker 裁剪前执行检查。生产运行仅消费打包快照，不读仓库文件路径。

`runAtsCheck` 和 `analyzePdfResume` 接收可选岗位、阶段；报告新增独立的可选 `chinaReference`。原有不传上下文的调用继续工作。

`atsReview` 接收可选 `targetRoleId`、`audience`、`responseLocale`，由服务端校验和读取快照，不接收客户端规则正文。点击 AI 审阅才发送本次检测文本、JD 和岗位上下文。服务端提示包含所选画像、全部适用硬约束、最多 8 条普通规则；界面语言作为默认回复语言。

提示要求用户事实及明确要求优先、目标 JD 优先于画像，同时保持真实性和隐私约束。禁止编造公司、技术、能力、职责和指标，缺少证据先询问。建议可附 `ruleIds`；服务端去重、过滤未知及未供给编号，界面展示对应依据。无 JD 强制 `jdAlignment=null`。

## 中文底层修复

- PDF.js 继续使用原有 legacy worker 和提取入口，增加同源且随版本变化的 CMap、标准字体及 WASM 地址。Vite 开发中间件与生产构建都提供相同资源。
- 首部独立中文姓名及“姓名：张三”可识别；章节、岗位名和“个人简历”等标题排除，保留英文姓名识别。
- 汉字明显多于拉丁字母时，英语 PDF 元数据不会触发英文词典检查。原有中文日期、章节及字数处理保留。
- JD 分词不再重新粘连相邻词；支持中文标点、招聘停用词和中文要求标题。保留 `C++`、`Node.js`、`CI/CD` 等复合词。
- 全部岗位画像关键词补充术语表；中文专业词优先完整识别，中文不经过英文词干处理。无 `Intl.Segmenter` 时采用术语表与保守降级，界面提示覆盖可能不完整，包括零词项结果。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @reactive-resume/resume test` | 38 个文件，1,436 项通过；包括英文回归、中文姓名、错误英语元数据、日期、JD 分词及规则参考 |
| 最终 ATS/AI UI 与编辑器 ATS 测试 | 6 个文件，36 项通过；涵盖默认未选择、上下文、切换、重新检测、正文编辑失效、点击 AI、语言及依据展示 |
| Web PDF 导入、预览与导出回归 | 7 个文件，48 项通过 |
| PDF 渲染与真实提取集成回归 | 2 个文件，16 项通过 |
| API ATS AI 审阅测试 | 15 项通过 |
| AI 包测试 | 40 项通过 |
| Web、Resume、API 类型检查 | 全部通过 |
| 包边界 | 1,553 个文件、20 个包，无问题 |
| 快照检查及本次 39 个代码文件 Biome 检查 | 通过 |
| `git diff --check` | 通过 |
| `pnpm build` | Server、Web、DSH 三项构建通过 |

浏览器验证使用真实 PDF.js 和实际二进制 PDF。测试文件 `tests/e2e/fixtures/chinese-cmap-resume.pdf` 为可复现的虚构中文简历，生成脚本为 `tooling/china-job-rules/make-pdf-fixture.py`；含中英文混排、日期和 `/Lang en-US`，使用未嵌入的 `STSong-Light` 与 `/UniGB-UCS2-H` 编码，没有嵌入 ToUnicode，必须请求外部 CMap。

开发及最终生产预览均上传并读取成功。实际请求 `UniGB-UCS2-H.bcmap` 和 `Adobe-GB1-UCS2.bcmap` 均返回 200；姓名“张三”、教育背景、专业技能、实习经历、项目经历及“至今”完整保留。共用 `extractPdfLines` 入口提取出 16 行。关闭浏览器 `Intl.Segmenter` 后，结果明确为 `dictionary-fallback`，已知中文复合术语正常保留。

同一文件、同一 JD 仅改变岗位参考：评分均为 **97**，全部检查结果完全相同。该数字仅是此测试文件的解析评分。生产无 JD、无 AI 的岗位参考正常显示，修改 JD 后出现重新检测提示。

生产预览资源响应：

| PDF.js 6.3.289 资源 | HTTP | 字节数 |
| --- | --- | --- |
| `cmaps/UniGB-UCS2-H.bcmap` | 200 | 43,366 |
| `standard_fonts/LiberationSans-Regular.ttf` | 200 | 139,512 |
| `wasm/openjpeg.wasm` | 200 | 252,032 |

本地验证证据：`output/china-job-rules/browser-verification.json`、`browser-verification.log`、`ats-chinese-dev.png`、`ats-chinese-production.png`、`final-build.log`、`resume-tests.log`。PDF 测试样本已渲染检查，中文及日期可读，无截断。

## 验证边界

浏览器仅模拟匿名会话和功能开关接口，PDF worker、提取、检测引擎及生产静态资源均为实际代码。未连接数据库或调用真实 AI 模型；AI 请求、提示、编号过滤和结果渲染由接口及 UI 测试验证，不能据此保证模型每次都遵守提示。此次没有数据库迁移，保留原有未提交改动，未扩展聊天 Agent、招聘平台采集或中文文风检测。
