# Agent 撤销第二阶段验收

日期：2026-09-28

## 范围

本阶段解决 Agent 修改后用户继续手工编辑时的撤销安全性：

- 不同字段的后续编辑继续保留；
- 同一字段发生后续编辑时默认拒绝覆盖，并要求用户再次确认；
- 用户取消二次确认时不写入任何数据；
- 用户明确确认后只恢复冲突字段，其他后续编辑继续保留；
- 已保存的冲突动作可以再次尝试，不会被一次 409 永久锁死。

## 实现

- `packages/resume/src/agent-rollback.ts`：按字段计划撤销，区分独立编辑和同字段冲突。
- `packages/api/src/features/agent/service.ts`：事务内锁定简历，使用乐观锁和 409 `AGENT_ROLLBACK_CONFLICT`，支持显式 `restore-agent-fields` 策略。
- `packages/api/src/features/agent/actions.ts`：暴露可选冲突策略。
- `apps/web/src/routes/agent/-components/agent-chat.tsx`：冲突时显示第二次确认，只在用户明确同意后覆盖冲突字段。
- `apps/web/src/libs/error-message.ts`、`apps/web/locales/zh-CN.po`：补充错误和中文提示。

## 自动化验证

- Resume 撤销规划测试：5/5 通过。
- Agent API service 测试：28/28 通过。
- Agent Chat 测试：11/11 通过。
- Resume、API、Web 类型检查：通过。
- Biome 定向检查：通过。
- Turbo package boundaries：1515 个文件、20 个包通过。

## 真实浏览器验证

在隔离的 nightly compose 环境（端口 3100、独立数据库和随机密钥）中完成：

1. Agent 修改 summary 后手工修改 phone，撤销后 summary 恢复，phone 保留。
2. Agent 修改 summary 后用户再次修改 summary，第一次撤销确认后服务端返回 409。
3. 页面显示二次确认“后续编辑修改了相同字段，仍要恢复吗？”。
4. 取消二次确认后，summary 和 phone 均不变，动作仍为 `applied`。
5. 再次撤销并确认覆盖后，summary 恢复为 Agent 修改前的值，phone 仍保留，动作标记为 `rolled_back`。
6. 刷新页面后状态与数据库一致。

409 请求在浏览器控制台中出现是预期的冲突信号，随后由界面转为二次确认；不是未处理异常。

## 限制

- 尚未用真实付费模型产生新的 Agent 流式会话；本阶段使用隔离数据库中的可控 patch 验证撤销时序。
- 尚未进行多浏览器同时点击同一撤销动作的压力测试；数据库行锁和 `expectedUpdatedAt` 提供了并发保护。
- 未提交、未推送、未部署；线上数据未触碰。
