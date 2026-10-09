# 发布前检查记录（2026-09-28）

## 结论

当前源码通过本地代码质量、全量测试和生产构建检查，可以进入“使用真实生产配置的发布候选”阶段。当前不能直接发布：仓库没有 `.env.production`，仅有的 `.env.nightly` 是隔离验收环境，发布配置预检按预期拒绝它。

本次没有提交、推送、部署，也没有修改线上数据。工作区原有未提交改动全部保留。

## 已通过

- `pnpm typecheck`：19/19 个包通过。
- `pnpm exec turbo boundaries`：1516 个文件、20 个包通过。
- `pnpm test`：19/19 个任务通过。
  - Web：146 个测试文件、1023 个测试。
  - Server：14 个测试文件、122 个测试（另有 5 个明确 skip）。
  - Tooling：9 个测试文件、128 个测试。
  - PDF：85 个测试文件、1064 个测试。
- `pnpm build`：PDF 文案生成、Server、插件和 Web 生产构建全部通过。
- 本地验收服务：`http://127.0.0.1:3100/api/health` 返回 HTTP 200，数据库、Redis、文件存储均为 healthy。

## 本次修正

1. 为 Tooling 的 Node PDF 集成测试补充本地字体映射，避免 `happy-dom` 的全局 `URL` 将 `/fonts/...` 解析为 `tooling/undefined`。
2. 重新生成 `docs/spec.json`，使 OpenAPI 与当前运行时 schema 同步。
3. 重新生成 JSON Resume schema 指南和技能 schema 参考文档，使生成文档与当前 schema 同步。

## 发布阻塞

`pnpm release:preflight -- --env .env.nightly` 未通过，失败项是验收环境专用配置：

- `APP_URL` 是本地 HTTP 地址，不是生产 HTTPS 根地址。
- `FLAG_ALLOW_UNSAFE_AI_BASE_URL=true`，生产必须关闭。
- 使用 Mailpit，本地邮件捕获服务不能用于生产。

发布前需要在部署机或受保护的生产配置管理中提供真实值，并重新运行：

```powershell
pnpm release:preflight -- --env .env.production
```

生产配置至少需要真实 HTTPS `APP_URL`、独立随机密钥、真实 SMTP、生产数据库/Redis 地址，并关闭所有 `ALLOW_UNSAFE_*` 开关。不要把密码放进命令行或提交到仓库。

## 已知但非失败项

- PDF 测试输出了 `standardFontDataUrl`、React `act(...)` 和缺少示例照片的警告；相关测试均通过。这些是测试环境噪声，仍建议后续单独清理。
- 本次没有执行真实生产部署后的 DNS、反向代理、邮件投递、OAuth 回调、真实 LLM 和移动真机验收。
- 工作区相对 HEAD 仍有大量并行会话的未提交改动（该报告生成时约 345 条状态项；之后又有本地文档整理）；发布前应在独立发布分支或干净工作树中只纳入已审查变更。
