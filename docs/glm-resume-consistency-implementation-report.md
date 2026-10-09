# GLM 一致性审查——实现改动报告

日期：2026-09-26。本报告按文件说明本会话（GLM 独立复核）的全部改动、原因、兼容影响与撤回方式。全部改动保留在工作区，未提交、未推送、未部署。

涉及面：**导入解析（packages/import）与编辑器输入组件（apps/web）**。不涉及 schema、数据库迁移、模板、导出器与国际化目录（未新增任何用户可见文案；测试文件内英文描述不进 Lingui 目录）。

## packages/import/src/plain-text.ts（核心修复，3 个缺陷）

改动内容：
1. **个人信息章节结构化提取（DEF-1）**
   - `SECTION_ALIASES` 增补：`基本信息/联系信息/联系方式 → summary`，以及英文 `contact information/contact details/contact info/personal information/personal details/basic information → summary`。
   - 新增 `PERSONAL_INFO_TITLES` 集合与 `isPersonalInfoHeading()`；新增 `PERSONAL_FIELD_LABEL` 正则（邮箱/电话/姓名/网址/求职意向等中英标签，含 ASCII 前置字母 lookbehind 防止 `username` 误切）与 `PERSONAL_FIELD_TYPES` 映射。
   - 新增 `assignPersonalField()`：仅写入空字段；同值判重消费；冲突值原样保留；email/phone/website 部分消费时仅移除已存值。
   - 新增 `consumeInlineContact()`：无标签行走与文档头部一致的 email/phone/URL 内联提取。
   - 新增 `applyPersonalInfo()`：章节级行处理；`objective` 参数（标题为 求职意向/求职目标 时启用）允许单行短文本（≤40 字、无句读）作为 headline，其余行保留。
   - `parseResumeText` 的 summary 分支前置个人信息判断；消费后剩余行仍进 `summary.content`（未知资料不丢弃）。
2. **实习/校园章节忠实映射（DEF-2）**
   - `SectionKey` 扩展 `"zh-internship" | "zh-campus"`；`实习经历/实习经验/實習經歷 → zh-internship`，`校园经历/校园实践/社团经历/校園經歷/社團經歷 → zh-campus`（从 experience/volunteer 别名移出）。
   - `parseResumeText` 新增对应分支：以固定 ID（`zh-internship`/`zh-campus`，与 `packages/schema/src/resume/cn-fields.ts` 一致）创建 `type: "experience"` 的自定义章节，标题保留原文；重复标题条目合并进同一章节。
3. **混排内容行误判修复（DEF-3/DEF-4）**
   - `looksLikeHeading`：含汉字（`\p{Script=Han}`）的行不再参与英文全大写标题判定（CJK 使大小写测试空洞成立，`C++/C#/音乐` 曾整行丢失）。
   - `looksLikeTitleCaseHeading`：单词字母必须全 ASCII（同理防止 `C++学习` 等混排词被当标题）。
   - `segment()` 技能区守卫改为「孤立全大写行可开新章节；连续全大写行串视为技能内容」（`uppercaseRun`），替换原 `(!precededByBlank || isSkillCategory(line))` 判定。
4. **分类词撞章节别名守卫（DEF-8）**
   - `segment()` 新增 `holdsInSkills`：技能区内，命中技能分类词（`isSkillCategory`，如 Languages/Tools）且下一行是逗号类列表（`splitSkillKeywords` 切出 ≥2 项）时，该行保留为技能分类，不再按章节别名（languages 等）开新章节；重新引入 `isSkillCategory` 与 `splitSkillKeywords` import。
5. **headline 标签净化**：`parseHeader` 对 rest 首项剥离 `求职意向：` 等前缀。

兼容影响：仅影响文本导入解析结果。旧数据（数据库中已保存简历）不受影响——无迁移、无读取路径改动。`zh-internship`/`zh-campus` ID 与中文空白简历约定一致；非中文简历不会产生这两个章节（标题本身是中文才会命中）。JSON/API/Agent/导出均按既有自定义章节机制消费，无新 schema。

撤回方式：还原本文件的 3 处编辑块（个人信息提取函数组、别名表、segment 守卫）；完整 git diff 存于 `docs/glm-resume-consistency-evidence/probes/glm-batches-git-diff.txt`（注意该 diff 相对 HEAD，混有前会话未提交改动，本会话净增量以上列块为准）。

## packages/import/src/skill-lines.ts（DEF-5）

- category 正则前缀 `{2,20}` → `{0,20}`，使 `工具/数据库` 等纯后缀中文分类（无冒号、逐行成员版式）可开组；删除冗余的独立 `数据库` 备选。「下一行非分类」守卫保留，孤立词不会误开组。
- 兼容影响：仅影响文本导入分组结构；不分组场景（逗号行、单技能）行为不变。既有「不从 Java/URL 臆造分类」测试未改动且仍绿。
- 撤回：还原该正则一处。

## packages/import/src/plain-text.test.ts / skill-lines.test.ts

- 新增 19 个用例（个人信息 9、中文约定 5、混排行 3、撞名分类 2）与 1 个短分类用例；改写 1 个既有用例断言（实习并入工作 → 独立章节，依据见审查报告 DEF-2）。**无删除断言、无跳过测试**。
- 撤回：删除新增 describe 块、还原「imports common Chinese resume sections…」断言。

## apps/web/src/components/input/chip-input.tsx（DEF-6）

- `addChips`：由 `[...new Set([...chips, ...next])]` 改为「保留既有项 + 仅对新值去重」，既有重复关键词不再因无关编辑被静默合并；无新增时不再触发 onChange。
- 渲染与拖拽：React key 与 dnd-kit sortable id 从裸文本改为 `${index}:${chip}` 复合 id；`handleDragEnd` 按复合 id 定位，修复同名关键词拖拽错位与重复 key 警告。
- 兼容影响：ChipInput 消费方为技能/兴趣/Tags 三处表单，props 未变。dnd 拖拽路径经代码审查+复合 id 单元定位验证，未做 jsdom 拖拽模拟（残余风险已在审查报告声明）。
- 撤回：还原 `addChips` 与 `SortableContext/ChipItem/handleDragEnd` 两处。

## apps/web/src/dialogs/resume/index.tsx、sections/interest.tsx（DEF-7）

- 两处 `<ChipInput>` 各增加 `commitOnBlur` 一行：输入未按 Enter 直接保存时失焦提交，修复丢词。diff 已确认仅含该行。
- 撤回：删除该行即可。

## 非代码交付

- `docs/glm-resume-consistency-audit-report.md`：审查报告（映射表、缺陷、验证、未验证项）。
- `docs/glm-resume-consistency-review-handoff.md`：Codex 复核交接。
- `docs/glm-resume-consistency-evidence/`：12 个探针/脚本 + 导出物 + 截图（全部为虚构样例，无真实用户数据、无密钥）。

## 数据库与持久化

未执行任何迁移、未改任何数据库行；容器重建沿用既有 nightly 数据卷（保留原数据）。测试账号 `glmaudit@test.local` 为本会话注册的独立虚构账号，其下仅含本审查创建的虚构简历。
