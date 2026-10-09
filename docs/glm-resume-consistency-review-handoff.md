# GLM 一致性审查——Codex 复核交接

日期：2026-09-26。对象：本会话（GLM）在 `weekly-resume-release` 工作区的未提交改动。前情：`docs/skill-group-fix-review-2026-09-26.md`（前会话技能分组修复）。本文件列出复核重点、易错假设、盲区与下一步具体操作。

## 0. 一句话结论

在 `packages/import`（文本导入解析）与 `apps/web`（ChipInput/兴趣/Tags）共修 8 个缺陷（DEF-1~8），全部先复现、先红灯、后最小修复；import 10 文件 171 测试、web ChipInput 15、组织器 4 全绿；真实浏览器（最终镜像 `sha256:7f85dbdf…`）完成导入/编辑/模板切换/四格式导出/公开分享/390px/上传路径/失焦提交的主链路核验。

## 1. 最容易出错的假设（请优先攻击）

1. **DEF-1 的"不覆盖"规则**：个人信息章节内的邮箱与头部已提取邮箱冲突时，保留头部值、冲突行留在 summary。假设：头部值更早出现即更权威。反例思考：若章节内是带标签的明确值、头部是启发式值，是否应反过来？当前选择保守不覆盖，报告已声明。
2. **DEF-2 的固定 ID**：文本导入用 `zh-internship`/`zh-campus` 常量 ID 创建自定义章节。假设：与 `blank-zh-cn.ts` 一致即安全。请检查这两个 ID 在并发保存/合并（merge.ts）和版本历史里是否有 ID 冲突特判。
3. **DEF-3/4 的启发式平衡**：「孤立全大写行=章节、连续全大写行=技能内容」+「分类词+下一行逗号列表=技能分类（即使撞章节别名）」。这两条规则在 Skills/Languages/Tools/SPEAKING 四类样例上互相兼容，但语义边界是统计性的。`Languages\nJava`（逐行成员、无逗号）会被误开语言章节——记录为已知残余，不是遗漏。
4. **DEF-5 正则放宽**：category 前缀 `{2,20}`→`{0,20}`。请专门找「以 后缀词结尾的技能名被误当分类」的反例（如孤立行"云开发"后跟成员行会开组——语义上多半正确，但请验证）。
5. **DEF-6 复合 id**：`${index}:${chip}` 作为 React key 与 dnd id。注意 chips 变化时 id 会整体重算——dnd-kit 在拖拽中 items 引用变化是否稳定，jsdom 没验证，需要真实拖拽复核。
6. **浏览器验证的边界**：JSON 导入路径的"解析"发生在 Node 端探针（工作区代码）；浏览器内解析只有 PDF 文本导入路径（extractPdfLines→parseResumeText，新镜像 15b9996b 之后才含全部修复——**旧镜像 e6bce91 不含本轮修复，任何基于它的浏览器结论只对渲染/编辑有效，对解析无效**）。第一轮重建镜像 15b9996b 含 DEF-1~7、不含 DEF-8；**最终镜像 sha256:7f85dbdf… 含全部修复**。

## 2. 边界情况清单（建议补测）

- 个人信息章节：`邮箱 <email>`（空格分隔无冒号）、全角冒号、标签重复出现三次、`姓名` 与英文 `Name` 同章节混排。
- `applyPersonalInfo` 的 headline 规则：40 字符上限与句读判断的 Unicode 边界（全角句号已排除，省略号"……"未排除）。
- 实习经历标题出现两次（应合并到同一章节）——单元已覆盖合并逻辑，未单独断言两次标题场景。
- ChipInput：两个重复词分别编辑为不同值（index-based updateChip 应各自生效）；重复词存在时拖拽第二个。
- `holdsInSkills`：`Languages` 分类后跟顿号列表（`Java、Go`）应命中（splitSkillKeywords 支持顿号）；`LANGUAGES` 后跟逗号语言列表会误留技能区（已知残余）。

## 3. 测试盲区（本会话明确未做）

- 真实 LLM（AI 解析路径完全未测，PDF/DOCX 的 AI 导入需要配置 provider）。
- jsdom 无 dnd 拖拽模拟；ChipInput 拖拽修复靠代码审查。
- 真机中文 IME 组合输入。
- 全量 web/PDF 套件（工作区含并行会话大量改动，假失败归因成本高；已跑受影响定向套件）。
- 生产环境、真实 SMTP、扫描件 OCR。
- 组织器（merge/undo）浏览器操作本会话未重做（单元 19/19 绿；前会话浏览器证据存在但按规则不作为本轮通过依据——如需，用 §4 步骤 6 补做）。

## 4. 给 Codex 的下一步具体操作

1. `git diff -- packages/import apps/web/src/components/input/chip-input.tsx apps/web/src/dialogs/resume` 逐块对照实现报告（注意 diff 混有前会话改动，净增量清单在实现报告）。
2. 重跑：`pnpm --filter @reactive-resume/import exec vitest run`（预期 10 文件/171 绿）、`pnpm --filter web exec vitest run src/components/input/chip-input.test.tsx src/features/resume/builder/skill-group-organizer.test.tsx`（预期 19 绿）。
3. 用 `docs/glm-resume-consistency-evidence/probes/*.mts` 重跑探针（`./tooling/node_modules/.bin/tsx <script>`），对照 before/after JSON。
4. 干净检出验证：`git worktree add --detach ../glm-check HEAD` + `pnpm install --frozen-lockfile` + 上述测试——注意本会话改动**未提交**，干净检出验证的是 HEAD，不含本批改动；如需验证本批，先以补丁方式 apply。
5. 浏览器复核上传路径前，确认 `docker inspect nightly_audit-app-1 --format '{{.Image}}'` 为本报告记录的新镜像，否则解析代码不是最新的。
6. 组织器浏览器复核步骤：编辑器 → 专业技能 → 添加两个普通条目 → 整理技能分组 → 选中两个+指定标题 → 预览（不写库）→ 合并 → 撤销；再在另一标签页修改技能后回此页尝试用旧快照合并（应失败）。

## 5. 证据索引

- 探针与结果：`docs/glm-resume-consistency-evidence/probes/`（contact/section-mapping/misc-paths/matrix-import/json-roundtrip/trace-upload-parse + before/after 对照）。
- 导出物：`docs/glm-resume-consistency-evidence/exports/`（PDF/DOCX/MD/JSON + PDF.js 提取文本）。
- 截图：`browser-template-vision*.png`（三模板）、`browser-public-share.png`、`browser-390px.png`。
- 构建日志：`docker-build.log`、`docker-build-2.log`（镜像 sha256:15b9996b… 为第一轮重建；第二轮重建日志见 build-2）。
