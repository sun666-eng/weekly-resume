# 全量系统审计交接清单（2026-09-27）

给负责修复的工程师。配套报告：`docs/glm-full-system-audit-report.md`；证据：`docs/glm-full-system-audit-evidence/`。

## 1. 环境复现

```bash
# 隔离栈（与本轮审计相同环境）
docker compose -f compose.nightly.yml --env-file .env.nightly build app
docker compose -f compose.nightly.yml --env-file .env.nightly up -d   # http://127.0.0.1:3100, Mailpit :8025
# 清理（删除全部本轮测试数据）
docker compose -f compose.nightly.yml --env-file .env.nightly down -v
```

- 审计账号：`fullaudit-a@test.local`（密码 FullAudit#2026x，隔离卷）、`fullaudit-b@test.local`（API 注册，未验证登录）。
- 审计中动过的数据：删除过 fullaudit-a 的会话行（P1-1 测试）、其简历姓名改过标记后已恢复为「张审计」、该简历备注含标记文本 NQ0927（可作为 P2-3 的现成回归样本）。glmaudit/nightly-a 等旧账号数据未动。

## 2. 已验证（可直接作为修复后的回归基线）

| # | 事项 | 证据 |
| --- | --- | --- |
| V1 | 注册即登录、退出（UI+API）、登录守卫（dashboard 匿名 → 跳登录页） | 会话证据 JSON |
| V2 | 基本信息五项 + 四类章节编辑 → 自动保存 → DB 逐字段一致；刷新持久 | 同上 |
| V3 | 照片全链路四层一致（API URL = DB = img src = 磁盘文件）；裁剪/跳过裁剪/刷新/15 模板切换/PDF/公开页照片全部正常；超限 10.57MB 直传 400 + 中文文案；跨用户删除 403、路径穿越 403 | photo-chain JSON |
| V4 | 15 模板逐个"预览→使用此模板"，切换后照片/技能分组/关键词/经历/姓名零丢失 | photo-chain JSON |
| V5 | PDF/DOCX/Markdown/JSON 导出内容核验（含中文「成绩：」、技能分组标题+关键词行、无性别「不公开」） | exports JSON |
| V6 | 公开分享开/关、匿名 getBySlug 消毒（notes→""、无 password 字段）、跨账号读写均 404 | exports JSON |
| V7 | 中文 ATS 深度检查 99/100（各部分 95 的唯一警告"无 bullet"为真实发现） | session JSON |
| V8 | 双标签并发：三处跨标签修改全部存活（乐观锁 + 三方合并）；SSE 实时同步；焦点输入框时远端更新延迟到失焦（#54 设计行为，非缺陷） | session JSON |
| V9 | 重新登录后的草稿恢复双路径（恢复/放弃）可用，恢复内容自动落库 | session JSON |
| V10 | 定向测试 ~2829 通过（utils 225 / import 173 / api 144 / web 107+1✗ / pdf 494 / docx 77 / fonts 58 / schema 143 / resume 1407） | 报告第 2 节 |

## 3. 待修复（按建议顺序）

1. **P1-1 会话失效不重定向登录页**（复现 3 次）。先定位 `getSession()` null 语义在 root context/loader 链路的旁路点（候选：`root-context.ts`、`orpc/client.ts` 服务端路径、`builder/$resumeId/route.tsx` 守卫与 query 错误处理）。修复后必须回归：删会话 → 刷新 → 跳登录；重新登录 → 恢复提示出现 → 恢复/放弃双路径（V9 基线已有）。
2. **P2-1 section-recovery 契约冲突**（唯一失败测试）。产品二选一：行为保留则改测试断言；显式放置则改 `packages/resume/src/editor-sections.ts` 的 `enableEditorSection`。**不要两处都动。** 注意该文件是并行会话的未跟踪新文件，动手前先与并行会话确认归属（见第 5 节）。
3. **P2-2 透明图变黑**：`packages/api/src/features/storage/service.ts` `processImageForUpload` 对含 alpha 的 PNG/WebP 保留原格式或白底压平。回归：透明 PNG 上传 → 回读角落 alpha。
4. **P2-3 JSON 导出泄露备注**：导出链剥离或确认后包含 `metadata.notes`。回归：含标记 notes → 四格式导出 → JSON 0 命中；公开 API 消毒行为不得回退（现为对照基线）。
5. **P2-4 DOCX 无照片**：`packages/docx/builder.ts` 补 ImageRun（或明确文档宣称差异）。
6. **P3-1 损坏图 500→400**：sharp 异常捕获 + 业务码 + `error-message.ts` 别名。
7. **P3-2 loading toast 残留**：核查上传 `onSettled`/`onError` 的 toast id 替换。
8. **P2-5 邮件本地化**（Batch 4 既定决策未实施）：上线中文用户前完成或收缩宣称范围。

## 4. 未验证 / 不要据此宣称

- 真实 LLM Agent（异常路径全部未构造）；真实 SMTP/S3；真实 DNS 阻断；生产部署后验证。
- 15 模板 × 3 页以上长文全矩阵；全量 `pnpm test`；Playwright e2e；zh-TW/English 完整链路；真机 IME。
- 审计镜像构建（15:05）之后并行会话对源码的新改动未纳入浏览器验证——修复前先重新快照 `git status`。
- 字体集已扩至约 176MB（download-manifest.json + 22 字族目录 + 根目录散置 TTF）：清单一致性、许可证、镜像体积需在合入前复核（观察项）。

## 5. 并行会话注意事项（重要）

- 本轮全程并行会话活跃：`picture.tsx`/`pdf/browser.tsx`/`utils/picture-url.ts` 是其 12:22 后的未提交改动（照片链路修复本体），`editor-sections.ts`、`draft-recovery.ts`（v2 键格式）、字体目录均为其工作区产物。**P2-1 涉及的两个文件分属"已提交测试"与"并行会话新代码"，修前先对齐归属与产品意图，避免撞车。**
- 建议动手前/提交前各做一次 `git status` 快照；提交只 add 明确路径；源码与 po 分开提交。
- 修复 P1-1/P2-1 后必须重建镜像再做浏览器回归（容器跑的是构建时镜像，改码不重建测的是旧代码）。
- 干净检出验证（worktree + frozen-lockfile + typecheck + 测试）是既有验收硬约束，交回前建议照做。

## 6. 需要重新回归的最小用例集

1. 会话失效矩阵：删会话 → 刷新/新标签 → 守卫；重登 → 恢复提示双路径；编辑中失效 → stash v2 → 重登恢复。
2. section-recovery 8 项测试全绿 + 浏览器手测"显示隐藏章节"。
3. 透明 PNG / 损坏 JPEG / >10MB 三类文件上传（本轮已有构造方法，见证据 JSON）。
4. 含 notes 标记的简历 → 四格式导出 + 公开 API → 标记 0 泄露。
5. 照片链路四层一致快检（上传 → DB → 刷新 → PDF → 公开页）。
