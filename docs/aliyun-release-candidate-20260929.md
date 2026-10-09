# 阿里云发布候选整理（2026-09-29）

## 19:41 迁移准备进展

- 从阿里云服务器执行 `getent ahostsv4 weeklyresumeai.online`，结果仍为美国服务器 `82.158.91.216`。这是该服务器解析器的结果，不代表全球缓存状态。本机解析返回 `198.18.0.90`，不用于判定公网源站。
- 已在阿里云创建备份目录 `/opt/weekly-resume-backups/aliyun-before-migration-20260929-1942`（目录后缀是标识，实际完成时间约 19:41）。
- 已保存 PostgreSQL 自定义格式转储（约 79KB）、上传目录归档（110B）、部署配置归档（约 3.3KB）和 SHA256SUMS；文件权限为 root 0600。
- `pg_restore --list` 与 `gzip -t` 已通过；尚未在独立数据库做完整恢复演练。上传卷仅占 4KB，不能假设其中包含美国线上用户照片。
- 已添加旧镜像标签 `weekly-resume:aliyun-before-migration-20260929`。标签不是独立镜像离线备份。
- 未切换 DNS、未升级运行容器、未恢复或覆盖数据库。
- 迁移前需核对美国线上数据库与文件存储，并以线上最新数据做最终迁移；不能直接让用户进入阿里云旧数据库。相关加密密钥也须随源数据保持兼容。
- 在 DNS 缓存过渡期须避免两台独立数据库同时接收写入；应规划短暂维护窗口或让旧入口转发到新源站。只改 A 记录无法完成数据迁移。

## 结论

阿里云应以 GitHub `main` 的提交 `ef30b1d819044584b0f729d21e5c186cf3935722` 作为本次唯一源码候选。该提交已经推送到 `origin/main`，包含中国化编辑器、中文模板与技能分组、照片链路、草稿恢复、Agent 撤销、中文 ATS、同源字体和相关测试。

不要把当前工作区整体复制到服务器。当前业务源码没有未提交修改，但仍有大量未跟踪的审查证据、参考图片、临时脚本和本地验收编排；这些内容不属于生产应用。

## 三个环境的已核实状态

| 环境 | 已核实版本 | 状态 | 结论 |
| --- | --- | --- | --- |
| GitHub `origin/main` | `ef30b1d` | 已通过 `git ls-remote` 核实 | 本次发布源码基准 |
| 阿里云服务器 | `24be96b`，镜像 `caa640a73edc` | 应用、PostgreSQL、Redis、Nginx 均健康 | 旧版本，比候选少 15 个提交 |
| 美国服务器 | 尚未取得运行容器的提交 SHA | 以前的公开健康检查只能证明服务可访问 | 不能据此认定运行的是 `ef30b1d` |

美国服务器可能已经部署过较新的工作区镜像，但现有证据不足以把“推送到 GitHub”“本地构建镜像”和“服务器已经切换到该镜像”视为同一件事。其健康接口只返回应用版本 `5.3.1`，无法区分不同 Git 提交。

## 阿里云现状

- 项目目录：`/opt/weekly-resume`
- Git：最初克隆 `a170f63`，随后快进到 `24be96b`
- Compose 项目：`weekly_resume`
- 运行服务：`weekly_resume`、`postgres`、`redis`、`nginx`
- 应用镜像：`weekly_resume-weekly_resume:latest` / `caa640a73edc`
- 数据卷：
  - `weekly_resume_postgres_data`
  - `weekly_resume_redis_data`
  - `weekly_resume_app_data`
- 健康接口：HTTP 200；数据库与本地文件存储健康
- 服务器源码目录存在部署专用未提交文件：修改过的 `Dockerfile`、`compose.nginx.yml`、`deploy/`

部署时必须保留现有 `.env.production`、三个数据卷以及服务器上的域名/TLS 配置。不得用本地 `.env.nightly` 或示例密钥覆盖生产配置。

## 应进入生产镜像的内容

只使用提交 `ef30b1d` 中受 Git 跟踪的内容，包括：

- `apps/`、`packages/`、`migrations/`、`tooling/` 中已提交源码
- `apps/web/public/fonts/` 中已提交的同源字体及许可证
- `Dockerfile`
- `compose.production.yml`
- `package.json`、`pnpm-lock.yaml` 和工作区配置
- 已提交的迁移、Schema、OpenAPI 和生成文档

生产构建建议直接从 GitHub 检出精确提交：

```text
ef30b1d819044584b0f729d21e5c186cf3935722
```

不要使用浮动的“当前目录内容”作为版本标识。

## 不应进入生产镜像或源码发布包的内容

- `compose.nightly.yml`
- `compose.editor-review.yml`
- `docs/*evidence*/` 下的截图、导出样例和测试证据
- `docs/release-candidate-inventory-20260928.json`
- `output/`
- 根目录 `resume-reference-03` 至 `resume-reference-13` 参考图
- `tooling/tmp-*.py`
- `tooling/dump-ats-lines.mts`
- `tooling/review-nightly-ats.mts`
- 仅用于本地/夜间审查的测试账号、Mailpit、mock LLM 和随机验收密钥

审查报告可以保留在本地，不需要传到生产服务器。

## 需要单独处理的部署文件

`compose.nginx.yml` 与 `deploy/nginx/private.conf` 当前是未跟踪文件，作用是让 Nginx 只监听 `127.0.0.1:8080` 供备案期间私下验收。它们不是完整的公网 HTTPS 配置。

正式上线阿里云时应二选一：

1. 继续使用服务器已有的 Caddy/证书方案，将上游指向 `127.0.0.1:3000`；或
2. 为 Nginx 增加正式的域名、80 到 443 跳转、证书链、私钥路径和续期方案。

在正式公网代理配置确定前，不应简单把 `127.0.0.1:8080` 改成 `0.0.0.0:80`。

## 发布前必须通过的检查

1. 在干净检出 `ef30b1d` 的目录运行：
   - `pnpm typecheck`
   - `pnpm exec turbo boundaries`
   - `pnpm test`
   - `pnpm build`
2. 在阿里云使用现有受保护的 `.env.production` 运行生产配置预检。
3. 验证 `docker compose ... config --quiet`。
4. 备份 PostgreSQL、上传文件卷和生产环境文件，并实际检查备份文件可读。
5. 给旧镜像 `caa640a73edc` 添加不可变回滚标签。
6. 构建新镜像时写入 Git SHA 标签，禁止只保留 `latest`。
7. 使用临时 Compose 项目名或临时端口启动候选，不连接正式写入流量。
8. 验证注册登录、简历创建、照片上传与删除、模板切换、刷新持久化、Agent 编辑与撤销、四格式导出、公开分享和移动端。
9. 验证真实 SMTP、真实 LLM、中转站兼容性和 HTTPS 回调。
10. 验收通过后再切换反向代理，并保留旧容器、旧镜像和备份直到观察期结束。

## 回滚边界

- 应用回滚：切回旧镜像标签。
- 数据回滚：使用发布前 PostgreSQL 备份；不能假设切回旧镜像就能自动撤销数据库迁移。
- 文件回滚：恢复 `weekly_resume_app_data` 的发布前备份。
- 配置回滚：恢复原 `.env.production` 和反向代理配置。

发布命令中禁止使用 `docker compose down -v`，避免删除正式数据卷。

## 当前判定

`ef30b1d` 是整理后的源码候选，但还没有证据证明美国服务器正在运行它。阿里云仍明确运行旧版。因此，阿里云更新应从该精确提交重新构建，并在切换流量前完成备份、生产配置预检和临时实例验收。

## 2026-09-29 美国源站核验与备份补充

- 美国源站仓库 HEAD 为 ef30b1d819044584b0f729d21e5c186cf3935722，与本地/GitHub 候选一致；已跟踪文件无修改。
- 运行镜像短 ID 为 1cfa14c8cf45，构建时间为 2026-09-29 07:04:59 UTC；镜像无 revision 标签，因此尚未证明镜像内容与该提交完全一致。
- 宿主机 127.0.0.1:3000/api/health 成功，数据库与本地存储 healthy。
- 磁盘使用率 94%，剩余约 1.8GB。数据库容量查询为 9958kB；配置源文件总计 12KB。
- 备份目录：/opt/weekly-resume-backups/us-before-migration-20260929。database.dump 约88KB、config.tar.gz约1.9KB、uploads.tar.gz为99字节，另有SHA256SUMS。文件权限600。
- pg_restore --list 与 gzip -t 通过，仅证明归档可读，尚未进行实际恢复演练。
- 上传卷目前为空，需进一步核对数据库图片引用及实际存储来源，不能据此认定照片已完整迁移。
- 首次整批备份被自动审批因空间风险拦截；未执行的命令已安全取消。测量体积后，改用单文件64MB上限的分步备份，执行成功。
- 未改变DNS、未替换阿里云应用、未覆盖任一线上数据库。备份产生后源站仍可写，正式切换前需要停写窗口和最终增量/全量同步。

### 备份传输核验完成

用户完成SSH密码认证后，美国备份已复制至阿里云 /home/admin/weekly-migration-mIVYdGPm/us-before-migration-20260929（终端 migration_dir 变量保留父目录）。三份归档的 sha256sum -c 全部 OK，gzip -t 与 pg_restore --list 通过，终端输出 BACKUP_VERIFIED。仅完成传输和归档校验；尚未恢复数据库、替换应用或切换DNS。后续需隔离恢复、照片引用核对、候选部署验证及正式停写同步。

### 隔离恢复与候选构建进展

- 已在阿里云现有PostgreSQL实例中新建独立数据库 weekly_restore_20260929_200433，pg_restore --no-owner --no-acl --exit-on-error 实际恢复成功；未覆盖正式库。
- 恢复库：1个用户、2份简历、1条历史版本。当前与历史 picture.url 均为空；源站空上传卷与这些数据一致。
- 阿里云旧正式库：0个用户、0份简历。
- 阿里云旧目录存在 Dockerfile 修改及未跟踪 compose.nginx.yml/deploy，已保留。
- git fetch已获取精确提交ef30b1d；git archive导出至 /home/admin/weekly-release-ef30b1d-udsNaFEP。
- 后台构建 weekly-resume:ef30b1d 已启动，附加 OCI revision 标签；日志在传输父目录的 build-ef30b1d.log。构建启动时可用内存约867MB、swap2GB、磁盘余25GB。尚未确认构建成功。
- 后续门槛：构建成功、隔离候选启动、关键流程验证、最终停写备份和同步、反向代理与DNS切换。不得将后台构建已启动写成已部署。

### 当前连接阻塞

构建最后可见进度为pnpm下载依赖（部分npm请求慢），随后Workbench输入无响应；刷新后持续连接中。本地SSH到112.126.65.245:22在banner exchange超时。不能断言构建完成，也不能确定为OOM或网络故障。尚未切换服务或DNS。下一步需要阿里云VNC/实例监控检查内存、负载和构建日志，必要时只停止该构建进程，不盲目重启或删除数据。后台构建启动PID为1975692；实际停止前必须重新核对进程身份。

### 重启后核验（2026-09-29 20:44 CST）
正常重启请求经用户身份验证后下发。重新连接成功，uptime约7分钟；四个原服务容器均healthy，宿主机健康接口返回数据库/存储healthy。三份美国备份SHA256全部通过；隔离恢复库仍有2份简历。旧回滚镜像caa640a73edc保留，无docker build进程，新镜像尚未生成。上一启动内核日志未检索到OOM记录，不能认定故障根因为OOM。本地改用精确提交git archive作为构建上下文，避免在小内存服务器再次构建。尚未发布或改DNS。

### 本地镜像构建完成
本机Docker Desktop因Docker/run/dockerInference及docker-secrets-engine/engine.sock残留重解析点无法启动；停止失败的Desktop进程后，将两个临时通信目录改名保留，同时重启成功。未重置Docker，未删除镜像或卷。引擎MemTotal=8122392576。
从git archive导出的ef30b1d精确源码构建成功，web/server两项构建成功。镜像weekly-resume:ef30b1d，ID sha256:9b6a7ba6fc32aff699407267db990a1053ecf6e9c64e89a5fbca360f27c02de7，linux/amd64，revision标签为完整提交。
压缩归档output/weekly-resume-ef30b1d.tar.gz，440840593字节，SHA256=C0B334E3FB904D7A60237685CD0969162BDBD483857EF25187D5BC6451F25B34。正通过Workbench上传，尚未确认服务器接收完成。

### 阿里云候选运行验证完成
归档已上传/root/weekly-resume-ef30b1d.tar.gz，服务器SHA256及440840593字节均与本地一致，docker load成功。候选weekly-candidate-ef30b1d监听127.0.0.1:3100，独立恢复库weekly_restore_20260929_200433、独立卷weekly_candidate_ef30b1d_data，512MB内存限制。首次直接使用Compose的.env文件导致带引号布尔值校验失败，已改用docker compose config --format json解析环境后生成/root/weekly-candidate-ef30b1d.env（600），失败容器改名保留。
候选数据库迁移完成，health healthy，首页与登录页HTTP200，恢复库2份简历仍在，内存165.5MiB；原4个服务健康。此为启动冒烟，不等于浏览器全流程验收。正式应用、DNS未切换。
最终同步阻塞：重启后/tmp/weekly-migration-known-hosts不再含源站主机公钥，StrictHostKeyChecking阻止连接；未降低校验。Chrome当前美国VNC标签868525280两次接管超时，需恢复该连接核验指纹后继续最终同步。

### 源站认证恢复与 HTTPS 入口核验
SSH ControlMaster 认证成功，源站 hostname 为 zero39e7yarn13rm。阿里云 getent 查询 weeklyresumeai.online 仍返回 82.158.91.216；源站实时计数为 1 用户、2 简历，/app/data 为 4KB。阿里云 nginx 只监听本机 8080，配置测试通过，尚无公网 80/443 监听。候选 /api/health HTTP 200。
源站 caddy:2-alpine 镜像通过 SSH 流式传输并 docker load 成功；源站镜像 ID 为 sha256:de23def33b17fb5d1290b0f6c2add1d70780e52341896c00a4c8a2a2fe9d355e。源站 /data 116KB、/config 16KB。
拟将 Caddy /data 证书及私钥状态复制到阿里云的命令被自动审批拒绝，未执行；原因是缺少对具体敏感凭据载荷及目的地的明确授权。等待用户确认美国 82.158.91.216 的 HTTPS 证书/私钥及续期状态迁移到阿里云 112.126.65.245。未切换 DNS、未停写源站、未覆盖正式数据。

### HTTPS 迁移验证完成，生产配置授权待补充
用户明确确认后，Caddy /data 已通过 SSH 传输到 /root/weekly-tls-migration-20260929/caddy-data.tar.gz，gzip 校验通过。隔离 TLS 代理 weekly-tls-candidate 监听127.0.0.1:8443，访问登录页 TLS_VERIFY=0 HTTP=200；证书有效期2026-09-22至2026-12-21。隔离代理使用只读证书目录，出现存储清理锁只读日志，非握手失败。
正式入口 weekly-edge 已运行，监听80/443，配置仅返回503维护提示，证书目录可写并启用Caddy自动证书管理。从美国源站用 curl --resolve 直接检查112.126.65.245：ALIYUN_TLS=0 HTTP=503，证明公网可达及证书有效。域名DNS仍美国；源站未停写。
生成 /opt/weekly-release-ef30b1d/.env.production 的命令被自动审批拒绝，未执行。理由：本轮用户确认仅覆盖TLS证书，未明确覆盖源站完整生产环境中的应用/AI/SMTP等密钥。不能将该配置记为已准备完成。需用户明确授权源站应用配置及数据库/文件迁往阿里云供正式切换使用。未切换业务数据或线上流量。

### 完整迁移授权与最终同步开始
用户明确确认完整用户数据、文件、应用密钥/登录密钥、SMTP及AI配置迁移到阿里云。正式环境配置 /opt/weekly-release-ef30b1d/.env.production 已生成，600权限；独立数据库 weekly_release_20260929 与卷 weekly_release_ef30b1d_data 已创建，未覆盖旧库。临时验收容器已停止释放资源。最终停写及pg_dump/pg_restore命令已下发，需后续核验结果，不能视作完成。

### 正式业务已迁移到阿里云（2026-09-29 22:30—22:35 CST）
- 美国应用 weekly_resume-weekly_resume-1 已正常停止（状态 exited）；此后 pg_dump 成功，恢复到阿里云独立库 weekly_release_20260929，输出 FINAL_DATABASE_RESTORED。
- 最终备份在阿里云 /root/weekly-final-sync-20260929/：database.dump、uploads.tar.gz；上传卷经 gzip 校验后恢复至 weekly_release_ef30b1d_data。原库/卷未覆盖。
- 正式应用 weekly-release-ef30b1d 已启动，镜像 weekly-resume:ef30b1d（此前已核对完整revision），容器ID以17a7ba80开头；宿主机仅127.0.0.1:3200映射3000。896MiB内存限制，restart unless-stopped。
- 生产配置 /opt/weekly-release-ef30b1d/.env.production 权限600；DB指向独立新库、Redis使用14号逻辑库、APP_URL保持https://weeklyresumeai.online。与源容器配置对比，排除数据库/Redis/文件目录和显式本地存储类型后，差异键为空。源STORAGE_TYPE未设置，本地存储在源健康检查中已确认。
- 数据库迁移成功；数据库/本地存储healthy；1用户、2简历、1历史版本。正式应用当时约148MiB内存。
- 阿里云 weekly-edge 80/443反向代理指向 weekly-release-ef30b1d:3000，www重定向主域；TLS校验0，登录页200，Caddy配置验证/热加载成功。
- 美国 Caddy /config/Caddyfile 已备份为 /config/Caddyfile.before-aliyun-20260929，新配置将主域和www通过HTTPS转发到112.126.65.245，tls_server_name/Host为weeklyresumeai.online。未禁用证书校验。美国旧应用保持停止，避免双站写入。
- 通过公网原域名获取登录页200，浏览器原登录会话仍有效，仪表盘显示两份原有简历，打开原简历编辑器后中文内容和两页预览成功渲染。未改真实简历内容。
- 当前是“美国入口转发、阿里云提供应用与数据”。DNS还未改直连阿里云。当前Chrome阿里云DNS账号公网权威解析列表为空，已请用户打开域名实际管理账号的解析记录页。不能写成DNS迁移完成。

#### 运维与回退边界
正式应用与edge通过docker run部署，已设unless-stopped；应用网络依赖原weekly_resume_data_network及原postgres/redis容器。原/opt/weekly-resume的compose不是本次新应用编排，不能误用旧compose覆盖新版本。新配置目录/卷与旧部署分开，备份和旧镜像保留。
可读取状态：docker inspect weekly-release-ef30b1d --format '{{.State.Health.Status}}'；健康接口http://127.0.0.1:3200/api/health；日志docker logs weekly-release-ef30b1d。
迁移后已接受新写入，回退到美国旧数据库前必须再次停写并反向同步新数据。不能直接启动美国旧应用并改回代理，否则会丢失阿里云上的迁移后编辑。
本轮验证仅覆盖部署、TLS、会话继续有效、原简历读取和预览；未重新执行真实邮件发送、付费LLM调用、全部编辑/导出/上传端到端回归。剩余主要工作为DNS直连、两地解析验证和上线后用户验收。

### DNS 账号归属阻塞

在当前阿里云主账号 `nick4384222356` 的公网权威解析中添加 `weeklyresumeai.online` 时，控制台提示该域名已存在于其他账号，当前账号无法直接添加。阿里云帮助文档确认：解析记录转移必须由当前持有解析记录的阿里云主账号发起，输入目标账号登录名和账号 ID，并通过原账号的短信或邮箱验证；转移的是 DNS 解析管理权，不包含域名注册管理权。DNS 尚未直连 `112.126.65.245`，当前仍由美国入口转发至阿里云正式应用。

### DNS 直连切换完成（2026-09-29 23:01 CST）

- 用户在域名实际管理账号中将根域名 `@` 的 A 记录改为 `112.126.65.245`，TTL 600 秒；将 `www` 配置为指向 `weeklyresumeai.online` 的 CNAME，TTL 600 秒。
- Google Public DNS-over-HTTPS 返回根域名 A=`112.126.65.245`；`www` 返回 CNAME=`weeklyresumeai.online.`，并最终解析到 `112.126.65.245`。公网权威解析已经脱离美国入口。
- `https://weeklyresumeai.online/api/health` 返回 HTTP 200，服务版本 `5.3.1`，应用、数据库和本地存储均为 `healthy`。
- `https://www.weeklyresumeai.online/` 返回 HTTP 301，Location 为 `https://weeklyresumeai.online/`，Server 为 Caddy。根域名与 `www` 的 HTTPS 行为正确。
- 本机普通 DNS 查询受代理 Fake-IP 模式影响，会显示 `198.18.0.0/15` 保留地址，不能用该结果判断公网源站；最终结论以上述公共 DoH 和实际 HTTPS 响应为准。
- DNS 切换和阿里云正式服务验证已经完成。美国 Caddy 转发可暂时保留作为旧 DNS 缓存过渡路径；待至少一个旧 TTL 窗口并确认访问日志无残余流量后，再停止美国 Caddy。
