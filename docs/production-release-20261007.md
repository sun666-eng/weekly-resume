# 2026-10-07 正式发布检查与执行记录

## 当前状态

**已于 2026-10-07 19:31:01（Asia/Shanghai）切换正式流量。** 正式入口为 `https://weeklyresumeai.online`，当前容器 `weekly-release-20261007-3c62a7b7ee72`。切流前完成生产备份、独立恢复及候选实例验证，切流后公网健康、资源哈希和真实中文 PDF 检测均通过。

镜像最初自动上传失败，随后由用户通过 Workbench 上传。服务器归档大小和 SHA-256 与本地完全一致后才执行加载和发布。

## 发布对象

- 应用版本：`5.3.1`；该版本号与旧线上版本相同，本次以源码 SHA-256 和镜像标签辨认。
- Git 基线：`ef30b1d819044584b0f729d21e5c186cf3935722`。
- 源码快照：`3c62a7b7ee72a2731b8e36e84de215249ea2defc333dde62ce40a71c30e6c129`，1,695 个文件。
- 镜像：`weekly-resume:release-20261007-3c62a7b7ee72`，Linux amd64。
- 镜像归档：`output/release-20261007/weekly-resume-release-20261007.tar.gz`，419,985,614 字节。
- 归档 SHA-256：`3be8953a126ba4a4e9a7204f02a65d3710ed49efe1bb98d29c833415a78d5196`。
- 镜像带 `io.weekly-resume.source-sha256` 标签；远端 Docker load 后以此标签及归档哈希识别，不依赖 Docker Desktop 的 manifest list ID。

候选版本包含工作区当前应用改动，包括此前的编辑器、照片、导入改动和本次中国岗位参考/中文 ATS 修复。保持已有未提交改动；未提交、推送或创建数据库迁移。镜像从冻结上下文构建，未包含 `.env`、部署输出或生产密钥。

## 已完成检查

| 项目 | 结果 |
| --- | --- |
| 全仓测试 | 19/19 个任务通过；12 项集成测试跳过，未记为通过；完整输出 `output/release-20261007/tests.log` |
| 类型检查 | 19/19 个任务通过 |
| 包边界 | 1,553 个文件、20 个包，无问题 |
| 规则库 | 54 条规则、10 个画像、8 个来源、17 条硬约束；快照一致 |
| diff 空白检查 | 通过 |
| 生产镜像构建 | 成功，冻结上下文及源码清单保留 |
| 本地真实容器健康检查 | 应用、数据库、本地上传存储 healthy |
| PDF.js 静态资源 | 两个 CMap、标准字体、WASM 均 HTTP 200，内容 SHA-256 与依赖原文件相同 |
| 真实业务流程 | 虚构账号登录、创建样例、中文姓名/求职意向编辑、预览成功；刷新后保留“张三”和“Java 后端开发｜发布验收” |
| 编辑器深度检查 | 真实渲染 PDF 并分析；Java/前端岗位参考下均为 94，56 项适用检查中 53 项通过；岗位切换提示重新检测 |
| 规则展示 | 人工基线说明、8 条普通规则及 17 条硬约束展开入口正常 |
| 生产服务器独立候选实例 | 使用恢复的 `weekly_verify_20261007` 数据库、独立 Redis、上传副本；健康接口及 ATS 页面 200，四项 PDF 资源哈希一致 |
| 新旧迁移目录 | 逐文件哈希完全相同；未引入新迁移 |
| 生产切流 | Caddy 配置验证通过再重载；环境变量、上传卷和 896 MiB 内存限额保持原值 |
| 公网验收 | `/api/health` healthy；数据库和本地存储 healthy；两个 CMap、标准字体及 WASM 与原文件逐字节一致 |
| 正式浏览器中文 PDF | `/UniGB-UCS2-H` 外部 CMap 样本成功提取；评分 97，联系方式与日期均 100，中文章节检查通过，文案不因英语元数据启动评分 |
| 正式 JD 与上下文 | 无 JD 时展示人工基线；输入 JD 后出现重新检测提示；重新检测保留 97 分，9 个 JD 词中覆盖 4 个；画像中 Redis 等额外关键词未进入 JD 覆盖词项 |
| 切流后最终状态 | 19:37:51 检查 healthy；重启次数 0、OOM false、致命日志标记 0；应用使用约 157 MiB / 896 MiB；停止旧容器后公网健康仍正常 |

本地独立 Compose 项目为 `release_acceptance_20261007`，应用仅绑定 `127.0.0.1:3407`，使用独立数据库、Redis 和 Mailpit。没有调用真实付费 AI 或发送真实邮件。上线完成后已停止本次本地验收容器，镜像、数据卷和记录保留；其他本地项目未停止。

中文外部 CMap 样本、错误英语元数据、姓名/章节/日期、JD 中英文混排和无 Segmenter 降级的既有验证，见 `docs/china-job-rules-ats-implementation-20261006.md`。本轮额外对候选及正式环境资源逐字节校验，并在正式页面实际选择该 PDF 完成检测。最终页面截图为 `output/release-20261007/production-ats.png`，页面文本分别保存在 `production-no-jd.txt` 和 `production-with-jd.txt`，公网接口记录为 `production-http.json`。

本轮 PDF 下载触发后，浏览器事件确认生成了 244,041 字节的 `20261007.pdf`，但自动化下载等待超时，未确认最终落盘，故不记为本轮下载闭环通过。编辑器预览和深度检查使用的真实 PDF 均已成功生成。内置双栏英文样例存在阅读顺序、紧密行距和教育章节识别警告，94 是该样例解析评分，不是产品上线评级。

## 生产备份与恢复

- 当前线上入口：`https://weeklyresumeai.online`，检查时 `/api/health` 返回 200，应用、数据库、本地存储 healthy。
- 旧生产容器：`weekly-release-ef30b1d`，镜像 `weekly-resume:ef30b1d`；切流验证完成后停止，容器、镜像和原配置保留用于回退。
- 新生产容器：`weekly-release-20261007-3c62a7b7ee72`；镜像 ID `sha256:ad23cf5a00dfcba32ca7e47b0dc9bc6b51708f880932c4fe2aa831adb6ad3315`。
- 当前上传卷：`weekly_release_ef30b1d_data`，挂载 `/app/data`。
- 网络：`weekly_resume_data_network`；新应用仅映射主机 `127.0.0.1:3207`，旧应用回退端口为 `127.0.0.1:3200`。
- Caddy：`weekly-edge`，配置源 `/root/weekly-tls-migration-20260929/Caddyfile.production`。
- 本轮备份目录：`/opt/weekly-resume-backups/release-20261007-3c62a7b7ee72`，受限权限；含数据库 custom dump、上传归档、原容器 inspect 和 Caddy 配置。密钥未复制本地或打印。
- 数据库备份成功恢复到独立 `weekly_verify_20261007`；上传文件恢复后逐文件哈希一致。
- 旧镜像额外保留标签：`weekly-resume:rollback-20261007`。
- 正式候选启动前再次备份：`preswitch-database.dump`、`preswitch-uploads.tar.gz`，对应 `preswitch-checks.json`。原上传文件哈希仍一致。
- 发布记录及受限环境文件位于服务器 `/opt/weekly-release-20261007-3c62a7b7ee72`。发布日志仅输出状态和校验信息，不输出密钥。

## 回退与验证边界

服务器上已保存回退脚本：

```sh
sudo python3 /opt/weekly-release-20261007-3c62a7b7ee72/rollback.py
```

脚本先启动旧容器并等待健康，再验证和恢复旧代理配置；不会恢复或覆盖数据库、上传文件。切流后的新数据应继续保留。本轮没有实际切回旧版本；完成的是数据库/上传恢复演练、候选验证和正式切流验证。

隔离候选容器及 Redis 已停止，验证数据库和上传副本保留。未对旧的其他应用栈、DNS、TLS、SMTP 凭据或 AI 凭据做修改。真实邮件投递、真实付费 AI 返回和生产用户账号登录未作为本轮验收项；本地账号登录、保存与预览已实际验证，AI 合约及编号过滤以自动化测试为依据。
