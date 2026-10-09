# 专业技能分组修复与独立检查

日期：2026-09-26。范围：本地源码与 nightly_audit 独立验收环境。未提交、未推送、未部署生产，未改用户真实简历或清理数据库。

## 结论

技能的“分类和成员混成平级条目”问题已修复。当前本地 `http://127.0.0.1:3100` 已运行修复镜像，用户刷新后可验收。旧简历不会被自动猜测分类或批量改写，应在“专业技能 → 整理技能分组”中显式选择、预览后合并。

这不是全系统无缺陷或允许生产上线的结论。另确认个人信息章节的联系方式映射错误，见第 5 节，已交给 GLM 审查提示词优先处理。

## 1. 根因

1. 普通文本导入原先对 skills 使用 `splitList`，把所有内容写成独立 `name`，`keywords` 为空。分类与成员的原始关系丢失。
2. 技能编辑卡片只显示名称与熟练度，不显示关键词摘要，分组内容不直观。
3. `SQL`、`MQTT` 等全大写技能有机会被段落分割器误识别为章节。
4. 关键词输入若未按 Enter，直接点保存时可能尚未写入表单。
5. “个人评价”原先没有中文章节别名，可能继续落入前一个章节。

## 2. 改动

### 导入与数据

- 新增 `packages/import/src/skill-lines.ts`：识别分类＋列表、分类＋逐行技能、冒号分类，保留顺序；普通独立技能仍保留独立项。
- 改动 `packages/import/src/plain-text.ts`：接入技能解析、防止技能区部分大写条目误分节、增加“个人评价”别名。技能不再静默截断为旧逻辑的 60 项。
- 新增 `packages/resume/src/skill-groups.ts` 和包导出：共享技能分隔及显式合并逻辑；括号内标点、`C++`、`.NET`、`Netty/MQTT` 保持完整。
- 更新 `packages/ai/src/prompts/parser-system.md` 和 `packages/schema/src/resume/data.ts` 的技能说明；没有新增持久化字段或数据库迁移。
- AI 仅调整规则，未调用真实付费模型，不能保证模型总能保持分组。

### 编辑器

- `skills.tsx` 卡片展示具体技能摘要，中文入口为“添加技能分组”。
- `skill.tsx` 中文字段为“分类名称”“具体技能”；熟练程度与评分收进可展开区域，已有值仍保留。
- `chip-input.tsx` 为技能表单提供批量粘贴、失焦提交，避免直接点保存漏掉最后一项；增加组合输入防护。
- 新增 `skill-group-organizer.tsx`：选中平级条目、指定标题、预览、合并、撤销。沿用共享按钮组件。
- 合并只处理普通可见条目，拒绝带评分、熟练程度、已有关键词或特殊图标配置的条目，避免丢属性；隐藏条目不参与。
- 保留标题 ID、成员原始顺序及未选条目；同名成员不会被合并函数静默去重。
- 写入前对照预览快照，过期操作失败；撤销只在技能数组未出现较新修改时允许。切换简历时通过 resume ID 重置组织器状态。
- 撤销是当前页面的即时操作，不是跨刷新备份。没有对用户已有简历执行自动迁移。
- 补充 zh-CN、zh-TW、en-US 文案。

### 渲染

原渲染本已支持“名称＋连续关键词”，本轮没有调整模板布局算法。修正数据后即可显示分类标题与普通正文，避免把每个技能当作独立标题。

## 3. 测试与证据

### 自动化

| 检查 | 结果 |
|---|---|
| import 完整包测试（最终） | 10 文件、151 测试通过 |
| web 定向：ChipInput、技能卡片、组织器、导入对话框 | 4 文件、28 测试通过 |
| resume 技能合并与 Markdown | 9 测试通过 |
| DOCX 技能 | 3 测试通过 |
| PDF 中文分组与已有关键词展示 | 2 文件、15 测试通过；冷启动总耗时约 188 秒 |
| web / schema / import / resume / PDF / DOCX 类型检查 | 6/6 通过 |
| 包边界 | 20 包、1498 文件通过 |
| Docker 生产构建 | 最终本地镜像构建成功 |

定向命令使用 `corepack pnpm --filter <包名> exec vitest run <测试路径>`。注意 `pnpm test -- <路径>` 在该环境可能并未按预期限制范围，应以实际运行文件数为准。

关键测试文件：

- `packages/import/src/skill-lines.test.ts`
- `packages/resume/src/skill-groups.test.ts`
- `apps/web/src/features/resume/builder/skill-group-organizer.test.tsx`
- `apps/web/src/components/input/chip-input.test.tsx`
- `packages/pdf/src/templates/shared/chinese-skill-groups.test.tsx`
- `packages/pdf/src/templates/shared/skill-keyword-presentation.test.tsx`
- `packages/docx/src/skill-keywords.test.ts`

PDF 检查使用真实字体与 PDF.js 文本，验证 leafish、ditgar、gengar、glalie 四种模板，分类与 18 个技能点顺序正确、单页紧凑展示、文字不越界、渲染前后数据不变。生成 PDF 和 PNG 在 `output/playwright/skill-groups/`，已目视查看 leafish、gengar 图片。

首轮新增回归暴露“个人评价”别名缺失，修正后通过；保留这个失败发现，未删除断言。PDF 慢主要发生于模块导入，没有扩大测试超时或删减检查。

### 真实浏览器

使用既有独立测试账号，新建独立测试简历 `01a0dcba-19f3-72b0-855e-9daa04bb404e`，未改用户截图中的简历。

1. 上传真实三组技能 PDF，在未配置 AI 服务的本地文本提取路径中成功生成三组，每组 6 项。
2. 编辑卡片能显示每组具体技能；新中文字段文案正常。
3. 输入“技能保存边界验收”，不按 Enter 直接点保存，之后刷新仍保留。
4. 创建“合并验收分类”“测试成员A”两个平级项，选中、预览、合并；撤销恢复原条目，再合并成功。
5. 最终镜像刷新后，合并结果仍在，原三组技能和新增验证文本未丢失。
6. 浏览器 PDF 下载成功，文件 `browser-export.pdf` 29,905 字节。内容级核验由上述独立渲染测试承担；不把单次下载成功当作全模板验证。

截图与快照：`editor-dialog.png`、`merge-preview.png`、`merge-before.yml`、`merge-open.yml`、`merge-after.yml`，均在 `output/playwright/skill-groups/`。证据含虚构账号和样例，非真实用户资料。

## 4. 本地环境与限制

- 最终镜像：`sha256:e6bce91ccff6e0a3175ac9d1133f00af51fc94b898f824408cf848d0af0993f9`。
- app、postgres、redis、mailpit 健康；原数据卷保留。
- 代码工作区原有大量他人修改。本报告只说明本轮技能相关增量，不把相对 HEAD 的所有修改归为本轮。
- 未跑本轮全量 web / PDF 套件；运行的是上述受影响定向测试以及 import 全包测试。
- 未验证真实 LLM 对所有简历版式的提取；未知分类仍可能需要人工整理。
- 未重做生产 SMTP、线上匿名权限、所有模板所有页面组合的全站验收；不据此宣称线上所有流程无问题。
- 移动端已设置为 390×844 并取得 `mobile-390.yml`，可见底部“编辑 / 预览 / 设计”入口。最初使用桌面的“切换左侧边栏”定位器超时，不是已确认的产品缺陷。随后截图请求因自动审批服务用量上限未执行，手机端视觉与点击验收仍标为未完成。

## 5. 另确认的同类问题，交给 GLM 优先修复

复现输入：

```text
测试用户

个人信息
邮箱：fixture@example.com
电话：13800000000

教育背景
示例大学
```

实际 `parseResumeText` 输出：

```json
{"emailInBasics":false,"phoneInBasics":false,"contactInSummary":true}
```

说明：个人信息章节被映射到 summary，而联系方式提取只读前导区域，导致基本信息缺项。这是已复现的字段映射问题，非单纯视觉差异。本轮未扩大范围修改它。

复现：`corepack pnpm --filter @reactive-resume/resume exec tsx ../../output/playwright/skill-groups/contact-probe.mts`。

脚本、结果：`output/playwright/skill-groups/contact-probe.mts`、`contact-probe-result.json`。

下一步详见 `docs/glm-systematic-resume-consistency-audit-prompt.md`。提示词要求独立复现、最小修复、浏览器和成品核对，并交付审查报告、改动报告及交接文件。
