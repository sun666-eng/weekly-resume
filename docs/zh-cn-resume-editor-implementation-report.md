# 中文简历编辑器实施报告

对照文件：`docs/zh-cn-resume-editor-optimization-plan.md`。
仓库：`D:\MyProjects\Weekly  Resume\weekly-resume-release`。
分支：`main`，跟踪 `origin/main`。本次没有提交、没有推送、没有部署。
下面按文件和计划条目写，方便逐项对照代码，而不是只给结论。

## 1. 实际修改了哪些文件

### 1.1 本次编辑器改动：新增文件

| 文件 | 做了什么 |
| --- | --- |
| `packages/schema/src/resume/cn-fields.ts` | 中文字段的显示和兼容工具。包含性别/政治面貌/年龄标签、`http`/`https` 判断、联系方式列表、GitHub 去重、期间起止解析、中文章节标题和字体、`ensureCnFieldDefaults`。性别 `undisclosed`（不公开，含旧数据）不产生显示文字；`other` 显示为「其他」或 Other。 |
| `packages/schema/src/resume/cn-fields.test.ts` | 覆盖旧数据读写补空、保留 headline/website/profile、空字段不显示、年龄和政治面貌、GitHub 去重、期间辅助、中文空白布局、英文不改写，以及空性别、男、女、其他、不公开和已保存的 `gender: "undisclosed"`。 |
| `packages/schema/src/resume/blank-zh-cn.ts` | `applyChineseBlankResume`。只应在新建空白中文简历时调用。写入单栏布局、中文标题、实习/校园自定义章节和中文字体。 |
| `apps/web/src/libs/resume/sidebar-order.ts` | 中文左栏顺序、实习/校园插入位置、图标栏标题。英文简历仍走原来的 `leftSidebarSections`。 |
| `apps/web/src/libs/resume/sidebar-order.test.ts` | 英文前 6 项顺序不变；中文空白顺序；实习/校园图标栏使用保存的标题。 |
| `apps/web/src/dialogs/resume/sections/period-range-fields.tsx` | 月份起止辅助控件。只有 `formatPeriodRange` 得到完整字符串时才写回 `period`。读不懂的旧文本返回 null，不覆盖。 |

### 1.2 本次编辑器改动：数据与创建

| 文件 | 做了什么 |
| --- | --- |
| `packages/schema/src/resume/data.ts` | `basics` 增加 `gender`、`age`、`blog`、`github`、`politicalStatus`、`politicalStatusOther`、`address`。教育增加 `schoolTier`。工作增加 `department`、`employmentType`。项目增加 `role`。这些字段是 `z.string().optional()` 或可选网址对象，不是必填。`parseResumeData` 在解析后调用 `ensureCnFieldDefaults`。 |
| `packages/schema/src/resume/default.ts` | 空白默认值补上上述字段的空字符串或 `{ url: "", label: "" }`。 |
| `packages/schema/src/resume/sample.ts` | 英文样例对象补上同样的空字段，让样例数据能通过类型检查。没有改 David Kowalski 的原有经历内容。 |
| `packages/schema/src/resume/write.ts` | `parseResumeDataForWrite` 在 JSON Schema 校验通过后调用 `ensureCnFieldDefaults`。保存时缺字段会被补成空值，已有值不替换。 |
| `packages/schema/src/resume/json-schema.ts` | 生成 JSON Schema 后，把新可选键从所有 `required` 数组里去掉。旧 JSON 可以不带这些键。 |
| `packages/schema/src/resume/json-schema.test.ts` | 新增用例：删掉性别、年龄、博客、GitHub、政治面貌、住址和 `schoolTier` 后，JSON Schema 仍能解析，且这些键不在 `required` 里。 |
| `packages/api/src/features/resume/initial-data.ts` | `createResumeData` 在「不是样例」且 `locale` 以 `zh` 开头时调用 `applyChineseBlankResume`。样例创建和英文创建不走这条路径。 |
| `packages/api/src/features/resume/initial-data.test.ts` | 断言 zh-CN 空白简历是单栏并包含实习/校园；en-US 布局不变且没有自定义章节；带样例数据的 zh-CN 创建不插入实习章节。 |

`packages/schema/src/resume/sample-zh-cn.ts` 没有改。它克隆样例数据，因此会带上新的空字段，但不会变成「从 0 创建」的空白中文简历。画廊样例仍是林知远演示内容。

### 1.3 本次编辑器改动：左侧填写区

| 文件 | 做了什么 |
| --- | --- |
| `apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/basics.tsx` | 中文简历用 CSS `order` 排成：姓名、电话、邮箱、性别、年龄、个人博客、GitHub、求职意向、政治面貌、现居地、详细住址、更多信息、网站、自定义字段。英文简历仍是原来的姓名、标题、邮箱、电话、位置、网站顺序，新字段排在后面。每次变更都 `normalizeBasics` 后写入，空邮箱不阻止保存。邮箱和年龄只在有内容时做字段校验。中文模式顶部有跳到现有照片章节的按钮，不另存图片。性别选项是男、女、其他（`other`）、不公开（`undisclosed`）。不公开只保存键，不进入成品。 |
| `apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/field-labels.test.tsx` | 新增「中文基本信息可不填邮箱仍保存年龄」：locale 为 zh-CN 时能看到求职意向、个人博客、网站；输入年龄 25 后 `basics.age` 为 `"25"`，邮箱、headline、网站保持空。 |
| `apps/web/src/routes/builder/$resumeId/-sidebar/left/index.tsx` | 左侧图标栏按 `getSidebarEntries` 排列。实习和校园使用章节里保存的标题，图标使用已有 Phosphor 字体类。求职信图标栏逻辑保留。 |
| `apps/web/src/features/resume/builder/section-recovery.tsx` | 编辑列表按同一顺序渲染。实习和校园用 `PlacedCustomSection` 插在对应位置，不再全部堆在「自定义章节」里。隐藏章节恢复逻辑保留。 |
| `apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/custom.tsx` | 「自定义章节」列表排除已经单独摆放的 `zh-internship` 和 `zh-campus`，避免同一章节出现两次。添加自定义章节的按钮还在。 |
| `apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/summary.tsx` | 中文简历显示「只保存你输入的文字」说明。 |
| `apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/skills.tsx` | 中文说明：按技能组填写，关键词放具体技能。仍是原来的多条技能按钮。 |
| `apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/awards.tsx` | 中文说明：获奖和证书分开。 |
| `apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/certifications.tsx` | 中文说明：证书不要写进获奖。 |
| `apps/web/src/routes/builder/$resumeId/-sidebar/left/sections/publications.tsx` | 中文说明：论文、专利、研究报告各写一条。没有新增成果类型字段。 |
| `apps/web/src/dialogs/resume/sections/education.tsx` | 中文顺序：学校、学校层级、专业、学位、GPA/成绩、地点、在校时间、起止辅助、网站、主修课程。`schoolTier` 可选。更新旧条目时若没有 `schoolTier`，表单里补空字符串，不改其他字段。 |
| `apps/web/src/dialogs/resume/sections/experience.tsx` | 顺序：公司、职位、部门、地点、工作类型、时间、起止辅助、网站、原有多岗位。部门和类型可选，说明写明不改已有多岗位。 |
| `apps/web/src/dialogs/resume/sections/project.tsx` | 增加可选「担任角色」。中文描述提示按背景、职责、方法、结果组织，提示本身不写入简历。 |
| `apps/web/src/dialogs/resume/sections/skill.tsx` | 中文占位示例。结构仍是名称、熟练度、关键词。 |
| `apps/web/src/dialogs/resume/sections/award.tsx` | 中文奖项、颁发方、日期示例。 |
| `apps/web/src/dialogs/resume/sections/certification.tsx` | 中文证书名称、颁发机构、日期示例。 |
| `apps/web/src/dialogs/resume/sections/publication.tsx` | 中文论文/专利示例。 |
| `apps/web/src/dialogs/resume/sections/section-item-dialog.tsx` | 底部按钮加 `order-last`。教育弹窗用 CSS `order` 重排字段后，取消/保存仍留在表单底部。 |
| `apps/web/src/libs/tanstack-form.tsx` | `RichTextField` 增加可选 `description`，用来放主修课程和项目描述提示。提示不进入保存值。 |

上面几个章节组件读取 `resume.data.metadata?.page?.locale`。测试夹具没有 `metadata` 时按非中文处理，避免打开章节时抛错。真实简历数据仍有 `metadata.page.locale`。

### 1.4 本次编辑器改动：预览、导出、导入

| 文件 | 做了什么 |
| --- | --- |
| `packages/pdf/src/templates/shared/contact-item.tsx` | `renderBasicsContactItems` / `renderBasicsContactItem` 按 `listBasicsContactEntries` 画页眉。空字段不画。博客、GitHub、网站走链接；性别、年龄、住址、政治面貌走文本。 |
| `packages/pdf/src/templates/shared/contact.ts` | 长度达到 36 的网址在 `/ . : _ ? & = @ ~ -` 后插入零宽空格，避免长链接撑破行。短标签不变。 |
| `packages/pdf/src/templates/shared/template-base.tsx` | `TemplateHeader` 改用统一联系方式渲染。自定义字段仍在联系方式后面。 |
| `packages/pdf/src/templates/shared/primitives.tsx` | 语义节点先看 `contactName`，再看网站/邮箱属性。博客和 GitHub 不会被收成同一个 website 节点。 |
| `packages/pdf/src/templates/shared/sections.tsx` | 工作显示非空部门和类型；教育显示非空学校层级；项目显示非空角色。GitHub 资料按 URL 去重。空条目章节仍在 `items.length === 0` 时返回 null，不打印空标题。 |
| `packages/pdf/src/templates/shared/filtering.ts` | 资料筛选类型补上可选 `basics.github`，并复用同一去重函数。 |
| `packages/pdf/src/semantic/tree.ts` | 语义树页眉使用同一联系方式列表，资料章节同样去重。 |
| `packages/pdf/src/semantic/binding-inventory.ts` | 绑定清单纳入新字段。 |
| `packages/pdf/src/semantic/field-registry.test.ts` | 注册表期望值加入 `schoolTier` 等字段。 |
| `packages/pdf/src/semantic/template-manifest.test.ts` | 模板清单跟上新的联系方式节点。 |
| `packages/pdf/src/templates/chikorita/semantic.ts` | Chikorita 增加第二行联系方式节点。 |
| `packages/pdf/src/templates/{chikorita,ditgar,ditto,gengar,kakuna,leafish,meowth,pikachu,rhyhorn,scizor}/*Page.tsx` | 这些模板自己画页眉，已改为调用统一联系方式函数，并保留各自的颜色、图标和 `customFields`。 |
| `packages/pdf/src/templates/shared/sidebar-column.ts` | `reservesSidebarColumn`：只有 `fullWidth === false` 才保留百分比宽度的侧栏列。 |
| `packages/pdf/src/templates/ditgar/DitgarPage.tsx`、`gengar/GengarPage.tsx`、`glalie/GlaliePage.tsx` | 单栏页不再因为第一页有页眉而画出 `sidebarWidth` 侧栏。页眉改到主栏上方，后续页正文左缘与第一页相同。双栏简历仍是侧栏列加主栏。 |
| `packages/pdf/src/templates/shared/full-width-column.test.tsx` | 渲染 Ditgar、Gengar、Glalie 的两页 PDF。单栏两页正文横坐标一致；双栏两页也一致，并且比单栏更靠右。渲染前后简历对象不变。`gender: "undisclosed"` 不出现在文本里。 |
| `packages/pdf/src/templates/gengar/gengar-skills.test.tsx` | 技能条像素检测改为找技能名下方的窄红条，不再把单栏整页宽的红色页眉当成技能条。 |
| `packages/pdf/src/section-title-catalog.json` | 只改了 `zh-CN` 的 7 个空标题回退：总结→个人评价，教育经历→教育背景，项目→项目经历，技能→专业技能，奖项→获奖经历，证书→证书信息，出版物→科研成果。其余语言的目录值没有改。 |
| `packages/docx/src/builder.ts` | DOCX 页眉遍历联系方式列表。安全链接才做成超链接。只在 `profiles` 章节和 `type === "profiles"` 的自定义章节上去重 GitHub。 |
| `packages/docx/src/section-renderers.ts` | 工作明细拼部门和类型；教育拼学校层级；项目角色用 `item.role ?? ""`。空值不出现在明细里。 |
| `packages/resume/src/markdown.ts` | Markdown 页眉和章节使用同一套联系方式与去重。 |
| `packages/resume/src/ats/rules.test.ts` | 测试夹具补上空的 `schoolTier` / `department` / `employmentType`，让类型通过。没有新增中文字段评分规则。 |
| `apps/web/src/features/resume/preview/resume-accessible-text.tsx` | 无障碍文本包含新联系方式，以及非空部门、类型、学校层级、角色。资料去重。 |
| `apps/web/src/features/resume/public/public-resume.tsx` | 公开页页眉使用同一联系方式列表。空字段不渲染。 |
| `apps/web/src/features/resume/export/download-dialog.tsx` | 姓名、电话或邮箱为空时给出不阻断的提示。导出按钮仍可点。 |
| `packages/import/src/json-resume.tsx` | 转换结果从 `defaultResumeData.basics` 展开，所以新字段有空默认值。JSON Resume 的 `location.address` 写入 `basics.address`，城市仍写入 `location`。工作条目补空部门和类型。 |
| `packages/import/src/reactive-resume-v4-json.tsx` | v4 导入的教育、工作、项目补上新字段空值。原公司、职位、日期、描述仍按原映射写入。 |

未单独改页眉文件、但通过 `TemplateHeader` 吃到新联系方式的模板：Azurill、Bronzor、Glalie、Lapras、Onyx。

`apps/web/locales/*.po` 共 55 个文件被 `lingui:extract` 改过。`zh-CN.po` 写上了新字段译文，并改了这些已有 msgid：

| msgid | zh-CN msgstr |
| --- | --- |
| Education | 教育背景 |
| Skills | 专业技能 |
| Projects | 项目经历 |
| Awards | 获奖经历 |
| Certifications | 证书信息 |
| Publications | 科研成果 |
| Summary | 个人评价 |
| School | 学校名称 |
| Area of Study | 专业 |
| Grade 的中文标签在表单里另用 GPA / grade | 见下方新字符串 |
| Email | 邮箱 |

新字符串的 zh-CN 译文包括：Job intention 求职意向，Personal blog 个人博客，Gender 性别，Age 年龄，Political status 政治面貌，Current city 现居地，Detailed address 详细住址，School tier 学校层级，Department 部门，Employment type 工作类型，Role 担任角色，Major courses 主修课程，Present 至今，Studying 在读。界面源字符串仍是英文，避免英文模式硬编码中文。

`en-US.po` 里新 msgid 的 msgstr 等于英文原文，例如 `Job intention`。`zh-TW.po` 和 `de-DE.po` 里这些新 msgid 的 msgstr 仍是空字符串。繁体界面在补翻译前会回退到英文源文。简历语言是 `zh-TW` / `zh-HK` / `zh-MO` 时，空白简历保存的章节标题和性别/政治面貌显示走 `cn-fields.ts` 里的繁体表，不依赖 `zh-TW.po`。

### 1.5 工作区里已有、不属于本计划的改动

这些文件在开始核对时就已经是未提交修改。本次没有把它们回退，也没有把它们当作编辑器功能。审核时不要算进中文简历字段闭环。

| 文件 | 现有 diff 在做什么 |
| --- | --- |
| `apps/web/src/dialogs/auth/change-password.tsx` | 密码最短长度从 6 改为 8，校验文案改为按当前语言解析。 |
| `apps/web/src/features/auth/pages/register.tsx` | 同上，并翻译用户名规则。 |
| `apps/web/src/features/auth/pages/reset-password.tsx` | 密码最短长度改为 8。 |
| `apps/web/src/features/auth/error-message.ts` | 认证错误从写死中文改为 Lingui `msg`。 |
| `apps/web/src/libs/error-message.ts` | 简历错误改为 Lingui；未知错误打到控制台，不再把普通 `Error.message` 直接返回给界面。 |
| `apps/web/src/dialogs/resume/import.tsx` | 只改了文件类型校验文案的国际化，没有改导入解析器。 |
| `apps/web/src/features/applications/insights.ts` | 申请统计标签改为 `t`。 |
| `apps/web/src/features/applications/components/application-card.tsx` | 「需要跟进」改为 `t`。 |
| `apps/web/src/features/ats-checker/report/finding-row.tsx` | 页码改为 `Trans`。 |
| `apps/web/src/features/resume/public/pdf-viewer.tsx` | PDF 无法显示的提示改为 `t`。 |
| `apps/web/src/hooks/use-confirm.tsx` | 默认取消/确认改为 `t`。 |
| `docs/i18n-english-inventory-20260925.md` | 未跟踪的英文文案盘点，不是本计划产物。 |
| `vitest.shared.mts` | 已跟踪修改。`createVitestProjectConfig` 增加可选 `extraSetupFiles`，在根 setup 之后执行。这是测试基建，不是简历字段逻辑。 |
| `apps/web/vitest.config.ts` | 已跟踪修改。把 `./vitest.setup.web.ts` 传给上面的选项。 |
| `apps/web/vitest.setup.web.ts` | 未跟踪。在 web 测试里执行 `i18n.activate("en-US")`，让 Lingui 的 `t`/`msg` 落到英文源文。完整 web 测试能通过，依赖这个文件。 |
| `compose.nginx.yml`、`deploy/` | 未跟踪的部署文件，本次没有使用，也没有上传。 |
| `docs/zh-cn-resume-editor-optimization-plan.md` | 未跟踪的实施计划原文。 |
| `docs/zh-cn-resume-editor-review-followup.md` | 后续审核交接，见该文件。 |

因此，`pnpm --filter web test` 如果跑整个 web 包，会在 `error-message.test.ts`、`insights.test.ts`、`use-confirm.test.tsx` 失败。失败原因是上面这些未完成的国际化改动，不是基本信息字段。本次没有改那些测试去迁就它们。

## 2. 计划条目完成情况

### 2.1 第 7 节验收清单

| 验收项 | 状态 | 依据与缺口 |
| --- | --- | --- |
| 中文用户创建空白简历后，左栏立即有基本字段和常用章节 | 代码完成，页面未人工点过 | `createResumeData({ locale: "zh-CN" })` 单栏布局，主栏含教育、技能、`zh-internship`、工作、项目、`zh-campus`、获奖、证书、个人评价、科研成果。左栏 `getSidebarEntries` 把照片和基本信息放在最前。创建按钮和 `resume.create` 入参没有改，语言来自 `context.locale`，不是时区或姓名。 |
| 姓名、电话、邮箱、性别、年龄、博客、GitHub、求职意向、政治面貌、住址可录入；可选字段留空不阻断保存、不出现在成品 | 代码和单测完成，页面未人工点过 | 基本信息监听每次变更都保存。`field-labels.test.tsx` 覆盖空邮箱保存年龄。`listBasicsContactEntries` 省略空值和 1–120 以外的年龄。 |
| 教育、技能、实习、工作、项目、校园、获奖、证书、个人评价、科研都有填写入口 | 代码完成 | 11 个栏目分别对应照片/基本信息加上上述章节。实习和校园是 `customSections` 里 `type: "experience"` 的空章节，条目弹窗、增删、拖拽沿用工作条目。 |
| 刷新、切换模板、导出 PDF/DOCX/JSON、重新导入后不丢、不重复 | 数据路径完成；浏览器里的刷新和模板切换没有点过 | JSON 导出仍是 `JSON.stringify(resume.data)`。PDF/DOCX/Markdown/公开页/无障碍文本读同一套字段。模板画廊 `gallery.tsx` 仍只写 `metadata.template`，本次没改它，所以切换模板不会改表单数据。没有新增「切换模板后字段仍在」的自动化测试。 |
| 旧简历标题、网站、社交链接、工作经历和自定义章节仍可编辑；英文标签不退回中文源码 | 单测完成 | `cn-fields.test.ts` 保留 headline、website 和 GitHub profile。英文简历不调用中文空白布局，左栏顺序测试锁定原来的前 6 项。 |
| 按钮、弹窗、侧栏视觉和右侧模板操作保持原用法；导出没有空标题、假数据或重复联系方式 | 部分完成 | 空章节在 PDF 中 `items.length === 0` 时不渲染。提示文案不写入数据。相同 GitHub URL 只出现一次。教育弹窗按钮已用 `order-last` 固定在底部。右侧模板面板没有改。浏览器里没有核对拖拽、折叠和移动端。 |

### 2.2 P0

| 步骤 | 状态 | 说明 |
| --- | --- | --- |
| 用界面/创建语言识别中文新建，不猜时区或姓名 | 完成 | `isChineseResumeLocale` 只看 `metadata.page.locale` 是否以 `zh` 开头。创建时该值来自请求的 locale。样例创建即使 locale 是 zh-CN 也不套用空白中文布局。 |
| 扩展 schema、默认值、兼容解析，理清博客/GitHub，调整 `basics.tsx`，照片仍走 `picture.tsx` | 完成 | 见第 3 节。中文基本信息顶部只有跳转按钮。 |
| 打通预览、全模板页眉、无障碍文本、DOCX、公开页、JSON 导入导出；空值不显示；长链接不撑破；模板切换不改表单数据 | 代码完成，肉眼版式未核对 | 长链接插入零宽空格，没有在浏览器或导出的 PDF 里量过行宽。 |
| 新建保存、刷新、再编辑后字段完整；空值和旧 headline/website/profiles 不丢 | 读写单测完成，刷新页面未做 | 保存走 `parseResumeDataForWrite`。再次打开若走原始数据库 JSON，缺的键要等表单规范化或下次保存才写成空字符串。见第 3 节。 |

### 2.3 P1

| 步骤 | 状态 | 说明 |
| --- | --- | --- |
| 中文常用章节名称、左栏顺序、实习和校园入口，且进入 `metadata.layout.pages` | 完成 | 空白中文简历主栏顺序见 `blank-zh-cn.ts`。PDF 章节顺序仍只看布局，不看左栏视觉顺序。 |
| 教育、工作、项目弹窗的标签、顺序、占位；期间辅助不覆盖无法解析的旧 `period`；不覆盖 `roles` | 完成 | `parsePeriodRange("March 2022 - Present")` 为 null。部门和类型是并列字段，不写入 `roles`。 |
| 奖项、证书、科研、技能、个人评价只优化中文说明；空表单不写演示内容 | 完成 | 没有预填奖学金、公司或论文。 |
| 科研成果不新增类型字段 | 按计划未新增 | 计划允许先用现有 publication 条目。本次没有加专利/报告类型。 |

### 2.4 P2

| 步骤 | 状态 | 说明 |
| --- | --- | --- |
| 中/英界面、手机/桌面、空白/旧简历、有无照片、长中文、多页 PDF、11 个栏目 | 未在浏览器完成 | 当前会话没有可用的浏览器工具。不能把构建成功当成页面核对。 |
| schema、自动保存、章节布局、模板切换、PDF/DOCX/JSON、导入后再编辑的回归测试 | 部分完成 | 已有 schema、创建、左栏顺序、基本信息自动保存、DOCX、Markdown、导入包、PDF 语义树测试。没有单独的「导入后再打开编辑器改一个字段」或「切换模板」测试。导入包 145 个测试通过，覆盖 JSON、v4 JSON 和纯文本解析。 |
| zh-CN 目录，英文模式不出现硬编码中文标签 | zh-CN 完成，其他语言未译 | 新标签是 Lingui 英文 msgid。`zh-CN.po` 已填。`zh-TW` 和其他语言的新 msgid 仍是空 msgstr，界面会显示英文，不会显示简体硬编码。 |

### 2.5 明确没做的事

- 没有部署，没有 `git push`，没有提交。
- 没有改创建按钮、样例按钮、右侧模板画廊的交互。
- 没有把卡码简历的双列基本信息、保存按钮或 Markdown 大文本框搬过来。
- 没有改 AI 抽取提示词。新字段已经写在 Zod `describe` 和 JSON Schema 里；如果某条提示词手写了旧字段清单，模型不会自动知道性别、年龄这些字段。
- 没有改「选择模板只改 `metadata.template`、不套用画廊样例栏位」这个既有行为。
- 没有处理导入时「没有公司名就丢经历」或「实习经验/项目介绍/培训经历标题未识别」。那是另一条导入观察，不在本计划字段表里。
- 没有改 Ditgar、Gengar、Glalie 在 `fullWidth` 时仍留侧栏空白的既有版式。

## 3. 新字段如何存储、预览、导出，旧数据如何兼容

### 3.1 存在哪里

所有新内容都在现有 `ResumeData` 里，没有新表，也没有第二份简历文档。

| 界面 | 存储位置 | 空值 |
| --- | --- | --- |
| 性别 | `basics.gender`：`male`、`female`、`undisclosed`，或用户留下的原文 | `""` 或不存在 |
| 年龄 | `basics.age`，字符串，不从生日计算 | `""` 或不存在 |
| 个人博客 | `basics.blog.url`、`basics.blog.label` | `{ url: "", label: "" }` 或字段不存在 |
| GitHub | `basics.github.url`、`basics.github.label` | 同上 |
| 求职意向 | 原有 `basics.headline` | 原样 |
| 政治面貌 | `basics.politicalStatus`：`party-member`、`league-member`、`masses`、`democratic-party`、`other`，或原文 | `""` |
| 其他政治面貌 | `basics.politicalStatusOther` | 仅 `politicalStatus === "other"` 且文本非空时显示 |
| 现居地 | 原有 `basics.location` | 原样，不和详细地址拼接 |
| 详细住址 | `basics.address` | `""` |
| 网站、自定义字段、社交资料 | 原有 `basics.website`、`basics.customFields`、`sections.profiles` | 不迁移、不删除 |
| 学校层级 | `education` 条目和 `type: "education"` 自定义条目的 `schoolTier` | `""` |
| 部门、工作类型 | `experience` 条目和 `type: "experience"` 自定义条目 | `""`，不写入 `roles` |
| 担任角色 | `projects` 条目和 `type: "projects"` 自定义条目的 `role` | `""` |
| 实习经历 | `customSections` 中 `id: "zh-internship"`，`type: "experience"`，`items: []` | 只在中文空白创建时预置 |
| 校园经历 | `id: "zh-campus"`，同样是 experience 型空章节 | 同上 |

### 3.2 读取和保存

- 直接 `resumeDataSchema.parse` 不会补键。旧对象可以缺这些字段，类型是 `string | undefined`。
- `parseResumeData`（PDF、DOCX、导入收尾、存储读取）和 `parseResumeDataForWrite`（API 写入、JSON Patch 之后）会调用 `ensureCnFieldDefaults`。缺的字符串变成 `""`，缺的博客/GitHub 变成 `{ url: "", label: "" }`。已经存在的 headline、website、profile、period、roles 不会被替换。
- `resumeService.getById` 仍返回数据库里的原始 JSON，不会在打开时改库。编辑器里的基本信息表单用 `normalizeBasics` 把缺字段当成空字符串显示。用户一改基本信息，自动保存会把空字符串写回去。这是补空，不是删旧内容。
- 更新教育、工作、项目时，若旧条目没有新字段，对话框初始值补 `""`，其余字段用条目原值。
- JSON Schema 不要求新键。旧导出文件可以再导入。
- JSON 下载没有单独过滤器，保存后的对象里有什么就导出什么。

### 3.3 预览和导出时怎么显示

`listBasicsContactEntries` 是页眉的唯一名单，PDF 模板、DOCX、Markdown、公开页和无障碍文本都用它。

显示顺序：邮箱、电话、性别、年龄、现居地、详细住址、政治面貌、个人博客、GitHub、网站。姓名和求职意向仍在页眉标题区，不进这条联系方式列表。

规则：

- 空字符串不进入列表。
- 年龄只有 1 到 120 的整数才显示。`0`、`121`、`abc` 保存后也不印出来。中文显示「25岁」，英文显示「Age 25」。
- 性别：`male`/`female`/`other` 显示为男、女、其他（英文为 Male、Female、Other）。`""` 和 `undisclosed`（不公开，包括修复前已经保存的值）不进入联系方式列表，因此 PDF、DOCX、Markdown、公开页和无障碍文本都不印性别。未知原文仍按原样显示。政治面貌的 `other` 仍使用 `politicalStatusOther`；说明为空时不显示。
- 博客、GitHub、网站只有 `http:` 或 `https:` 才变成链接。其他协议或非法 URL 若用户保存了文本，只以文本出现，不做成链接。
- 个人博客和网站 URL 相同时，网站行省略，避免同一链接印两次。
- `basics.github.url` 为空时，原有 GitHub profile 继续显示，不会在打开简历时被搬进 `basics.github`。
- `basics.github.url` 有值，且某条 profile 的 `network` 是 GitHub、URL 相同，这条 profile 在 PDF、DOCX、Markdown 和无障碍文本里省略。URL 不同的 GitHub 账号仍保留。
- `schoolTier`、`department`、`employmentType`、`role` 只用 `trim()` 后非空才画。它们出现在 PDF `sections.tsx`、DOCX `section-renderers.ts`、Markdown 和无障碍文本里。
- 实习和校园章节跟着布局 id 渲染。条目为空时不输出标题。中文空白简历把这两个 id 放进 `metadata.layout.pages[0].main`，所以模板切换后只要不改布局，章节仍在主栏。
- 章节标题优先用简历里保存的 `title`。中文空白创建会写成「教育背景」「专业技能」等。标题仍是空字符串的旧中文简历，PDF 空标题回退现在用新的 zh-CN 目录。这会改变「标题从未自定义」的旧中文简历的显示文字，但不会改数据库里的标题字段，直到用户保存。

### 3.4 旧数据不会被这次逻辑主动覆盖的内容

- `basics.headline`、`basics.website`、`basics.customFields`。
- `sections.profiles` 里的网络、用户名和 URL。
- 工作条目的 `roles`、公司、职位、地点、期间、描述。
- 无法解析成 `YYYY.MM - YYYY.MM` 或「至今/在读」的 `period` 原文。
- 已有自定义章节。中文空白布局只在新建空白简历时生成；打开旧简历不会插入 `zh-internship`。
- 英文和样例简历的布局、字体、章节标题。

服务端 `resumeService.create` 会在 `parseWritableResumeData` 之后把 `metadata.page.locale` 再设成请求语言。中文空白布局在这之前已经按同一 locale 生成，这一步不会清掉布局或自定义章节。

## 4. 运行了哪些命令，结果如何

工作目录都是 `weekly-resume-release`。包管理器用 `corepack pnpm`。下面的「通过」都是进程退出码 0。

### 4.1 通过的定向测试

| 命令 | 结果 |
| --- | --- |
| 在 `packages/schema` 执行 `corepack pnpm exec vitest run src/resume/cn-fields.test.ts src/resume/json-schema.test.ts src/resume/write.test.ts src/resume/data.test.ts` | 4 个文件，107 个测试通过 |
| 在 `packages/api` 执行 `corepack pnpm exec vitest run src/features/resume/initial-data.test.ts src/features/resume/resume-data-validation.test.ts` | 2 个文件，20 个测试通过 |
| 在 `apps/web` 执行 `corepack pnpm exec vitest run`，文件为 `sidebar-order.test.ts`、`field-labels.test.tsx`、`skills.test.tsx`、`many-sections.test.tsx`、`section-recovery.test.tsx` | 5 个文件，28 个测试通过 |
| 在 `packages/docx` 执行 `vitest run src/section-renderers.test.ts src/index.test.ts` | 20 个测试通过 |
| 在 `packages/resume` 执行 `vitest run src/markdown.test.ts src/ats/rules.test.ts` | 45 个测试通过 |
| 在 `packages/import` 执行 `vitest run` | 9 个文件，145 个测试通过 |
| 在 `packages/pdf` 执行 `vitest run src/semantic/field-registry.test.ts src/semantic/template-manifest.test.ts src/semantic/binding-inventory.test.ts src/semantic/tree.test.ts` | 4 个文件，133 个测试通过 |

web 测试的 stderr 里仍有 Picture 表单 `FormControl` dangling id，以及隐藏章节恢复测试的 `act(...)` 警告。这些断言仍然通过，dangling id 在改基本信息之前就存在于照片测试。

### 4.2 早先一次没有按文件过滤的整包运行

`corepack pnpm --filter <包> test -- <文件>` 实际变成 `vitest run --passWithNoTests "--" <文件>`，Vitest 没有把文件当过滤器，而是跑了整个包。这是历史记录，不是当前结论。

- schema 整包：10 个文件，141 个测试通过。
- api 整包：`initial-data.test.ts` 和 `resume-data-validation.test.ts` 通过。`statistics.test.ts` 当时有 2 个失败：一个在 5000ms 超时，另一个期望 `slug: "authenticated"` 时收到了前一个用例的 `slug: "anonymous"`。同时有未处理的 Postgres `ECONNREFUSED 127.0.0.1:5432` / `::1:5432`。之后只用 `pnpm exec vitest run <文件>` 重跑了简历数据和校验，20 个测试通过。
- 当时 web 整包还没跑完，就看到 `skills.test.tsx`、`many-sections.test.tsx`、`error-message.test.ts`、`insights.test.ts`、`use-confirm.test.tsx` 失败。前两个是测试夹具没有 `metadata`，已经用可选链修掉。后三个是国际化文案在测试里还没激活语言。`apps/web/vitest.setup.web.ts` 现在会 `i18n.activate("en-US")`。不要再把「完整 web 测试失败」当成当前状态。

### 4.4 本次修复后重新运行

| 命令 | 结果 |
| --- | --- |
| `packages/schema`：`corepack pnpm exec vitest run src/resume/cn-fields.test.ts src/resume/json-schema.test.ts src/resume/write.test.ts` | 通过。3 个文件，22 个测试。其中 `cn-fields.test.ts` 含空性别、男、女、其他、不公开，以及旧值 `undisclosed` 的读取和写入。 |
| 修复前 `packages/pdf`：`vitest run src/templates/shared/full-width-column.test.tsx` | 失败。Ditgar、Gengar、Glalie 各 1 个。单栏第一页正文左缘 222.348pt，第二页 14pt，差 208.348pt，等于 A4 宽度 595.28pt 的 35%。 |
| 修复后同一 PDF 测试，加上 `src/templates/gengar/gengar-skills.test.tsx` | 通过。2 个文件，17 个测试。单栏两页左缘一致，双栏两页左缘一致且比单栏至少靠右 80pt。`undisclosed` 不出现在 PDF 文本中。渲染前后简历对象相等。 |
| 同一次更早的 `DitgarPage.test.tsx` | 通过，21 个测试。双栏条目对齐没有被这次侧栏改动打坏。 |
| `corepack pnpm typecheck` | 通过。19/19，约 15.4 秒。schema、docx、pdf、web 等因本次源码变化重新检查，没有缓存命中的也通过。 |
| `corepack pnpm --filter web test` | 退出码 1。140 个文件，954 个测试：6 失败、948 通过，耗时约 210 秒。这次和上面的 typecheck 同时跑。失败都是 5000ms 超时，或缩略图/预览图在等待结束时还是 Loading，不是断言到错误的性别或栏宽。 |
| 随后单独重跑那 5 个文件 | 通过。5 个文件，29 个测试，约 8.6 秒。文件是 `languages-showcase.test.tsx`、`sharing.test.tsx`、`preview.browser.test.tsx`、`resume-thumbnail.test.tsx`、`skill-keyword-layout-menu.test.tsx`。 |

整包失败的 6 个用例：

| 用例 | 整包里的现象 | 单独重跑 |
| --- | --- | --- |
| `languages-showcase.test.tsx` 语言选择器 | 5000ms 超时 | 通过 |
| `sharing.test.tsx` 空密码长度 | 5000ms 超时 | 通过 |
| `skill-keyword-layout-menu.test.tsx` `custom=false` | 5000ms 超时 | 通过 |
| `preview.browser.test.tsx` 无 builder 时用显式数据渲染 | 等到超时仍找不到 `img`「Resume page 1 of 1」。无障碍文本已经有 David Kowalski，说明数据在，PDF 图层没及时出来 | 通过 |
| `resume-thumbnail.test.tsx` 放大后升级缓存图 | `image()` 仍是 undefined，页面还停在 Loading | 通过 |
| `resume-thumbnail.test.tsx` 隐藏再挂载后复用图 | 同上 | 通过 |

审核者若要复现整包绿灯，请单独执行 `corepack pnpm --filter web test`，不要同时跑 typecheck 或 PDF 渲染。本次没有把这 6 个超时改成更长的 timeout。

### 4.3 类型检查和构建

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm typecheck`（教育更新表单类型未收窄时） | 失败。只有 web 失败，其余包成功。`education.tsx`、`experience.tsx`、`project.tsx` 报 TS2322：更新表单把可选字段收成了必填 `string`，和 Zod 输入的 `string \| undefined` 对不上。 |
| 修复后 `corepack pnpm --filter web typecheck` | 通过，`tsgo --noEmit`，退出码 0。 |
| 修复后 `corepack pnpm typecheck` | 通过。20 个包里的 typecheck 任务 19 成功，18 个缓存，web 重新执行。约 4 秒。 |
| `corepack pnpm build` | 通过。先 `pdf:translations`，输出 “Updated PDF section titles for 55 locales.” 目录 diff 仍只有 zh-CN 那 7 个标题。随后 `turbo run build`：web 的 Vite 生产构建、server 的 tsdown、dsh plugin 的 tsdown 都成功。web 构建约 1 分 26 秒。 |

构建产物在各包的 `dist` 或 Vite 输出目录，没有部署。

## 5. 仍需人工核验的页面操作和已知风险

当前环境没有浏览器工具，所以下面各项都还没有在运行中的编辑器里点过。本地服务如果还是旧构建，需要用这次源码重新启动后才能看到变化。

建议按这个顺序点：

1. 界面语言为中文时，用现有「新建空白简历」而不是样例。左栏应从照片、基本信息开始，然后是教育背景、专业技能、实习经历、工作经历、项目经历、校园经历、获奖经历、证书信息、个人评价、科研成果，再是其余章节。
2. 基本信息只填姓名和年龄，邮箱留空，等待自动保存，刷新后年龄仍在，邮箱仍空。再填一个非法邮箱，确认其他字段仍能继续保存，并且字段上有错误提示。
3. 性别选男、女、其他时，预览应出现对应文字。选「不公开」或留空时，预览和导出都不出现性别。政治面貌、详细住址、博客、GitHub 各填一次后应出现；清空后应消失。博客填 `javascript:` 或不完整 URL 时，不应变成可点击的危险链接。
4. 已有简历如果 GitHub 只在社交资料里，页眉不应丢这个链接，也不应自动复制到基本信息的 GitHub。若两边 URL 相同，成品里只应出现一次。
5. 点基本信息里的照片提示，应滚到现有照片章节。上传、裁剪、隐藏、删除仍用原来的控件。
6. 教育、实习、工作、项目各加一条。实习和校园必须出现在预览主栏，而不是只出现在左栏。工作多岗位添加后，再填部门，多岗位不应被清掉。
7. 期间输入「2020.09 - 至今」和一段无法解析的自由文本。自由文本在动起止控件时不能被清空。
8. 切到英文界面，打开一份 `page.locale` 为 `en-US` 的旧简历。基本信息主标签应仍是 Headline、Location，而不是求职意向、现居地。原有经历还在。
9. 切换右侧模板。基本信息、实习章节和布局里的章节 id 不应被模板操作删掉。再导出 PDF、DOCX、JSON，重新导入 JSON，字段应还在且 GitHub 不重复。
10. 桌面和手机宽度都看左栏。教育弹窗的取消和保存应在字段下面，不应跑到字段上面。
11. 空的实习、校园、个人评价不要在 PDF 里留下标题。两页以上的中文长描述和长 URL 不要溢出页面。
12. 一份标题字段仍为空的旧中文简历，PDF 章节名会变成新的「教育背景」等回退名。若该简历曾经自己写过标题，标题应保持原文字。

已知风险：

- 图标栏里实习和校园用的是字体图标 `ph-briefcase`、`ph-users`，和其他 SVG 图标的笔画可能不完全一致。悬停文字是保存的「实习经历」「校园经历」。
- `zh-TW` 和其他非 zh-CN 界面语言还没有新字段译文，会暂时显示英文 msgid。简历内容语言是繁体时，保存进简历的章节标题和性别/政治面貌显示已经是繁体。
- 年龄非法值可以留在 JSON 里，但成品不显示。这是为了不阻断自动保存。
- 打开旧简历不会立刻把新键写进数据库。第一次保存基本信息或相关条目后才会写入空字符串。
- 模板画廊仍然只改模板名。中文空白简历的单栏布局不会在用户稍后点另一个模板时自动套用该模板样例的栏位。这是改前就存在的行为。
- 全套 web 测试的最新结果见第 4 节。第 1.5 节的国际化改动还在工作区里，但 web 测试 setup 已激活英文源文，不再把那些文件当成整包失败原因。
- Ditgar、Gengar、Glalie 的单栏简历第一页页眉改到主栏上方。双栏仍把页眉放在侧栏里。语义树里 `keepEmptySidebar` 仍可能为「页眉放在 sidebar」的模板保留一个空的 sidebar 区域节点；实际 PDF 列宽以页面组件为准，单栏两页正文左缘已由渲染测试对齐。
- 选择「不公开」会把 `basics.gender` 存成 `undisclosed`。这是有意保留的旧值，成品不显示。选择「其他」存成 `other`，成品显示「其他」或 Other，没有单独的自由文本。
