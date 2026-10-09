# 第一批用户体验优化：完整本地验收

日期：2026-10-01。基线 `ef30b1d819044584b0f729d21e5c186cf3935722`。

## 结论

本轮已完成真实本地后端验收，支持用户继续手动体验。没有提交、推送或部署，没有读写线上或既有用户数据库。此结论只覆盖第一批变更及列出的路径，不是系统全部功能或生产环境保证。

本轮没有新增业务代码修改。沿用前一批已通过的 Import 177、Web 1048、类型检查 19/19 和构建结果，额外从当前源码快照构建独立生产镜像，并运行下述端到端验证。

## 1. 环境与版本

- 地址 `http://127.0.0.1:3300`；专用虚构账号 `ux_oct01@example.test`，实际登录成功。凭据仅在忽略文件 `output/ux-e2e-20261001/credentials.json` 中，报告不含密码。
- 邮件捕获 `http://127.0.0.1:8325`，不对外发邮件；没有配置真实付费 AI。
- Compose 项目 `ux_acceptance_20261001`；独立 PostgreSQL、Redis、上传卷。数据库和 Redis 不发布主机端口，应用与 Mailpit 只绑定 `127.0.0.1`。
- 最终镜像 `sha256:d9cfa48ee706160a29d4228996b0279ea8729070964b3be2ce2c64f8fd422090`；应用、数据库、Redis、Mailpit 最终均 running/healthy。
- 构建上下文复制当前 tracked 文件内容，加上新运行时 `save-status.tsx`、`review.ts`；不会把未跟踪输出、部署密钥、凭据加入镜像。
- 最终核对 9 个关键运行时/中文目录文件 SHA-256，与构建快照一致。机器记录 `output/ux-e2e-20261001/final-state.json`。

## 2. 实际验收

| 场景 | 结果与直接证据 |
| --- | --- |
| 生产镜像启动与迁移 | Compose 构建完成，健康接口数据库/本地存储 healthy；`compose-build.log` |
| 登录、创建样例简历 | 真实浏览器登录并通过产品入口创建，独立数据库只含虚构账号 |
| 修改姓名、求职意向、电话 | 等待“已保存”、刷新、只读 SQL 核对三字段；浏览器联系方式隐私脱敏不作为数据丢失证据 |
| 保存失败与恢复 | 暂停独立 app 容器，修改意向；状态变“仅本机备份”，点击可读解释和“重试保存”；启动后点击重试，状态“已保存”，刷新与 SQL 均保留新值 |
| 照片上传 | 内置虚构头像→真实文件选择→裁剪上传→800×800 缩略图加载→刷新仍加载 |
| 照片删除与撤销 | 正式“删除图片”→等待保存→正式“撤销”→照片 URL 与实际图片恢复，刷新仍正常 |
| 照片隐藏/显示 | 提示“照片已隐藏，不会显示在简历中”；显示后等待已保存，URL 未丢失 |
| 四格式浏览器导出 | PDF 1,157,278 bytes，DOCX 13,661，Markdown 7,144，JSON 24,049；浏览器 CDP 记录 completed，文件实际存在并复制归档 |
| 导出文字一致性 | PDF、DOCX XML、Markdown、JSON 均含 3 个指定姓名/意向/电话标记；`export-verification.json` |
| PDF 照片和视觉 | PDF 3 页 A4；实际嵌入图像；Poppler 渲染三页逐页查看，姓名/中文章节/照片显示正常，本样例未见重叠或截断 |
| 正常 PDF 回导 | 用浏览器导出的 PDF 真实导入、进入新简历；正常识别结果不强制复核提示。未声称 PDF 回导等同 JSON 精确回导 |
| 歧义 PDF 取消 | 独立样例 ACME CORPORATION 没有职位；出现“请核对识别结果”，指出未识别职位；确认前没有新增，取消后 SQL 数量仍 2 |
| 歧义 PDF 确认 | 同文件重新导入→“导入后核对”→新简历，数量 3；列表“ACME CORPORATION 尚未填写职位”，已有简历不改变 |
| 390px 长标题 | 正式应用，无横向页面溢出（clientWidth=scrollWidth=390）；菜单右缘约344.67，下载左缘352.67，间隔约8px；保存文字独立显示 |

样例故意沿用内置英文正文，不是中文空白默认数据。测试期记录的“照片不显示”不能仅凭照片输入值下结论，必须核对 URL、服务响应、图像自然尺寸、刷新和导出；本轮上述完整路径均通过。

## 3. 备份恢复演练

Windows 环境通过 `output/ux-e2e-20261001/backup-drill.mjs` 直接编排 Docker，使用与 shell helper 相同的网络隔离/限额原则；没有声称 Linux shell 脚本本轮完整运行过。

1. 先验证源容器 Compose project 标签，只接受本次独立项目。
2. 导出实际测试库的 custom-format `database.dump`，归档实际 `/app/data`。
3. 临时 PostgreSQL 17 容器 `--network none`，不发布端口，内存 256MiB、数据 tmpfs 256MiB、pids 128，只读备份挂载。
4. `pg_restore --exit-on-error --no-owner --no-acl` 成功；用户 1、简历 3、版本 6，与源一致。
5. 指定验收简历 JSON 文本完整相等；解包后的照片 SHA-256 与源照片相等：`c24dcaefde6a7743bc0ae7277bc2d742324df36cc4e4e3392cd34121554391da`。
6. finally 只清理脚本新建的精确容器 ID，独立验收应用仍运行。

记录 `backup-drill-result.json` 含归档哈希。本次只证明新建虚构数据可恢复，没有证明线上备份存在、最新、定时任务正常或恢复后完整应用登录导出兼容。后者仍是发布前独立项目。

## 4. 异常、限制与下一步

- Docker Desktop 起初启动失败：Windows 残留 AF_UNIX sockets 导致 inference/secrets engine 初始化失败。停止失败官方进程，保留并移动只含运行时 socket 的目录后重新启动成功。没有重置 Docker、清空镜像/卷、修改旧项目数据。原运行时目录留作备份。
- 浏览器高层下载等待两次超时。改用浏览器正式下载事件和实际下载文件核对，PDF 确实成功；不能将工具超时写成产品导出缺陷。
- 导出时有 `Buffer is not defined` warning，但 PDF 实际图像、文字和下载完成，本轮未出现导出失败。仍记录为后续浏览器依赖排查项。
- **DOCX 文件没有 `word/media/` 图像，当前 Word 导出不嵌入照片。**文字通过；未将 Word 照片列为通过。用户要求 Word 成品含照片时，应独立修复并核对 Word 实际排版。
- 中文真实输入法、键盘/读屏体验、真机手机、真实付费 Agent/Word AI 导入尚未执行。上传在途删除、反序响应、存储配额/并发冲突仍引用前批组件/单元对抗测试，未伪称本轮全场景浏览器复现。
- 线上备份及告警、生产数据迁移/回退、DNS/TLS、生产部署后冒烟未验证；本轮没有上线。

下一步：用户按手动清单体验；针对反馈与 DOCX 照片制定小范围改动；随后检查线上备份和发布回退。Agent 改动对比、模板筛选和无障碍属于后续优化批次。

## 5. 文件和复跑

目录 `output/ux-e2e-20261001/`：

- `compose.yml`、`prepare.mjs`、`compose-build.log`：构建启动；prepare 会拒绝覆盖已有随机密钥。
- `verify-exports.py`：核对导出标记、PDF 图像并生成缺职位的虚构输入；Python 需要 pypdf/reportlab。
- `backup-drill.mjs`：限定验收源容器，独立恢复与照片哈希检查。
- `final-state.mjs`：镜像/健康/数据/源码快照只读最终检查。
- `exports/`：四格式虚构导出物、三页 PDF 渲染。
- `local-backup-status.png`、`import-review.png`、`mobile-390-real-app.png`、`desktop-final-real-app.png`：真实产品截图。

复跑命令（工作目录为项目根目录）：

```text
docker compose -f output/ux-e2e-20261001/compose.yml --env-file output/ux-e2e-20261001/.env.acceptance up -d
node output/ux-e2e-20261001/backup-drill.mjs
node output/ux-e2e-20261001/final-state.mjs
```

不使用 `down -v`；环境和用户测试数据保持运行，便于后续体验。
