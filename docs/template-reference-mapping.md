# 模板参考映射清单

核对日期：2026-09-27。

③—⑬参考图均已在仓库根目录找到，并与当前 11 个中文优先模板逐张对照。映射顺序与 `apps/web/src/dialogs/resume/template/labels.ts` 中的 `chineseReferenceTemplates` 一致。这里的“通过”表示主要版式骨架已经落到真实 renderer；产品模板统一使用虚构样例、当前字体和品牌色，不宣称像素级复刻，也不复用参考图中的照片或联系方式。

| 参考 | 实际模板 | 核对结果 | 已保留的版式骨架 | 明确差异 | 证据 |
|---|---|---|---|---|---|
| ③ | `ditgar` | 结构映射通过 | 浅蓝侧栏、主栏图标标题、紧凑技术/项目信息、双栏信息层级 | 参考图侧栏更窄且正文从教育区开始；当前模板补齐个人页眉 | [原图](../resume-reference-03.jpeg) / [渲染缩略图](../apps/web/public/templates/zh-CN/jpg/ditgar.jpg) |
| ④ | `meowth` | 结构映射通过 | 单栏、右上照片、蓝色章节标题与长分隔线、日期右对齐 | 当前页眉联系方式更精简，章节图标更轻 | [原图](../resume-reference-04.png) / [渲染缩略图](../apps/web/public/templates/zh-CN/jpg/meowth.jpg) |
| ⑤ | `scizor` | 结构映射通过 | 无照片、紧凑单栏、技术项目优先、清晰的日期/标题网格 | 当前模板去掉了参考图的章节图标与深色标题线，视觉更极简 | [原图](../resume-reference-05.png) / [渲染缩略图](../apps/web/public/templates/zh-CN/jpg/scizor.jpg) |
| ⑥ | `rhyhorn` | 结构映射通过 | 单栏技术简历、图标章节标题、细分隔线、项目层级与右侧日期 | 参考图使用紫蓝色和装饰页眉；当前模板使用低饱和紫色且不含装饰图形 | [原图](../resume-reference-06.png) / [渲染缩略图](../apps/web/public/templates/zh-CN/jpg/rhyhorn.jpg) |
| ⑦ | `azurill` | 结构映射通过 | 纵向引导线、分区节点、单栏经历流、顶部照片 | 参考图采用横向色带标题；当前模板用时间轴节点替代 | [原图](../resume-reference-07.png) / [渲染缩略图](../apps/web/public/templates/zh-CN/jpg/azurill.jpg) |
| ⑧ | `pikachu` | 结构映射通过 | 大面积蓝色页眉、右上照片、圆角章节胶囊、浅色背景 | 当前正文密度更高，未复刻参考图的个人信息宫格 | [原图](../resume-reference-08.png) / [渲染缩略图](../apps/web/public/templates/zh-CN/jpg/pikachu.jpg) |
| ⑨ | `onyx` | 结构映射通过 | 黑白线性图标、宽松单栏、右上照片、长横线与圆点收尾 | 当前个人信息行更紧凑，英文副标题被省略 | [原图](../resume-reference-09.png) / [渲染缩略图](../apps/web/public/templates/zh-CN/jpg/onyx.jpg) |
| ⑩ | `gengar` | 结构映射通过 | 深蓝灰主色、技术/运营型密集正文、强分区线、照片页眉 | 当前使用左侧深色信息栏，参考图为单栏且照片在右上 | [原图](../resume-reference-10.png) / [渲染缩略图](../apps/web/public/templates/zh-CN/jpg/gengar.jpg) |
| ⑪ | `lapras` | 结构映射通过 | 蓝色标签标题、规则边框、照片页眉、经历三段式对齐 | 参考图是左侧贯穿竖线，当前模板改为分区边框 | [原图](../resume-reference-11.png) / [渲染缩略图](../apps/web/public/templates/zh-CN/jpg/lapras.jpg) |
| ⑫ | `kakuna` | 结构映射通过 | 灰蓝几何标题带、全宽分隔线、照片页眉、紧凑商务正文 | 当前去掉顶部/底部的大面积装饰色块，减少打印耗墨 | [原图](../resume-reference-12.png) / [渲染缩略图](../apps/web/public/templates/zh-CN/jpg/kakuna.jpg) |
| ⑬ | `chikorita` | 结构映射通过 | 青蓝色标签、左侧定位线、照片页眉、分区图标与横线 | 当前没有参考图顶部英文大标题和底部双色页脚 | [原图](../resume-reference-13.png) / [渲染缩略图](../apps/web/public/templates/zh-CN/jpg/chikorita.jpg) |

映射结论：11 张参考图均已有唯一、可打开、可导出的模板承接；其中 ④、⑧、⑨、⑫、⑬的视觉特征最接近，③、⑤、⑥、⑦、⑩、⑪采用结构语义映射。后者的差异已经显式记录，后续若要做像素级复刻，应作为新的视觉重制任务，不再混入本轮模板库可用性验收。

统一样例证据位于 `output/pdf/template-library/`。`scizor`、`rhyhorn`、`ditto` 各有短内容、长内容（三页）和无内容/无照片样例；样例使用林志远虚构资料与 `lin.zhiyuan@example.com`，没有引用参考图中的真实联系方式或照片。
