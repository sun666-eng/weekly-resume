# Word 导出个人信息修复与候选发布记录

## 状态

**已于 2026-10-08 17:40:34（Asia/Shanghai）切换正式流量，17:46:30 完成最终复查。** 7/7 个真实编辑器下载用例通过。已完成即时备份、启动新生产容器并切换代理；公网健康、337 个前端资源哈希、即时与五分钟运行检查通过。正式入口为 `https://weeklyresumeai.online`。

此次只修复个人信息头部完整性、位置和重复问题。DOCX 照片、中文导入、ATS 等问题未纳入补丁。既有未提交改动保留，未提交 Git、未增加运行时依赖或数据库迁移。

## 修复

`packages/docx/src/builder.ts` 根据第一布局页实际结构选择头部位置：空布局、显式全宽或空侧栏均在正文顶部输出头部；实际双栏沿用模板配置。栏内头部只允许在第一个布局页输出，因此后续布局页不重复。

沿用 `buildHeader`、纯求职信判断、字段过滤、链接安全规则和 GitHub 去重。姓名、求职意向、邮箱、电话、城市、地址、年龄、性别、政治面貌、网站、博客和自定义字段均保留。单栏使用正文配色，正文顺序、表格宽度、页边距和分页逻辑未改。

根因影响 `chikorita`、`ditgar`、`gengar`、`glalie`、`pikachu` 的单栏组合；同一逻辑也导致这些模板连续双栏布局重复头部。没有修改模板配置来绕过问题。

电话说明：既有 DOCX 安全链接白名单仅允许 HTTP、HTTPS、mailto；电话在 Word 中是可见文本，没有 `tel:` 关系。本补丁保持这项行为，未宣称电话可点击。邮箱、网站、博客、自定义链接的关系目标已核验。

## 自动化和文件证据

| 项目 | 结果 |
| --- | --- |
| 先复现后修复 | 新的 129 项头部/求职信行为测试在修复前 100 通过、29 失败；缺姓名、重复姓名等均由生成 XML 复现 |
| DOCX 全包测试 | 修复后 205/205 通过 |
| 模板基础矩阵 | 15 模板 × 显式单栏、隐式单栏、双栏，45/45 通过；唯一姓名、意向、邮箱、电话各出现一次，区域和正文保留、输入不变通过 |
| 多布局页 | 每模板连续单栏、连续双栏、单双栏混排，共 60 组合通过；头部只出现一次 |
| 边界 | 15 模板空布局、部分字段为空、中文复合姓名、中英混排、英文姓名、单栏配色通过 |
| 求职信 | 以实际输出替换源码字符串断言；纯求职信不额外出现简历头部，普通简历不输出未选中的求职信 |
| 实际 DOCX | 修复前后各 45 份；检查 ZIP 中 document.xml 与超链接关系，修复后 45/45 通过 |
| 前后结构对照 | 修复前 10 个基础组合缺头部；修复后均补回。移除头部、将随机关系 ID 归一化后，45/45 正文及布局 XML 与修复前完全相同 |
| Web 导出相关 | 导出 hook 7/7、编辑器导出控件 6/6、领域导出章节过滤 3/3 通过 |
| 类型 | DOCX 与 Web 类型检查通过 |
| 工程检查 | 包边界 1,556 文件/20 包无问题；54 规则/10 画像快照一致；5 个修改文件 Biome 检查通过，DOCX diff 空白检查通过 |
| 生产构建 | 冻结源码生产 Docker 构建成功，Web/Server 构建通过 |
| 候选运行 | 隔离数据库、Redis、上传卷；2026-10-08 重启后恢复，127.0.0.1:3407 healthy，重启 0、OOM false；1,698 源文件与冻结候选无差异，4 项 PDF.js 资源字节哈希匹配 |
| 真实编辑器下载 | 7/7 用例通过，共 8 份文件（含一次 chikorita 重复下载）；ZIP 完整、核心及扩展个人字段、链接、正文和头部区域检查通过；多页头部一次、第二布局页正文保留 |

证据目录：`output/docx-header-fix-20261007/`。

- `tests-before.json`、`tests-after.json`：行为测试与全包测试机器结果。
- `before/`、`after/`：各 45 份 DOCX、同源 JSON、正文 XML 和链接 XML。
- `after/results.json`：打包后字段与链接验证。旧 `before/results.json` 包含最初对 tel 链接的过严预期；头部缺陷统计以独立 `artifact-comparison.json` 为准，未将旧结果误算为 45 个头部缺陷。
- `artifact-comparison.json`：45 份前后结构和头部区域对照，全部通过。
- `web-tests.json`、`web-export-tests.json`、`export-sections-tests.json`：Web/领域回归结果。
- `render.log`：渲染器失败记录。

复跑包测试：`pnpm --filter @reactive-resume/docx test`。复跑实际成品：`node --import ./tooling/node_modules/tsx/dist/loader.mjs tooling/docx-header-acceptance.mts after`。前后结构比较：用 Python 运行 `output/docx-header-fix-20261007/compare-artifacts.py`。不得用修复后的代码重建并覆盖修复前样本。

## 浏览器下载验收与视觉检查限制

隔离候选环境已通过 API 建立 7 份虚构验收简历：5 个受影响模板单栏、glalie 双栏、pikachu 双栏后接单栏。ID 和地址保存在 `output/docx-header-release-20261007/acceptance-resumes.json`。没有使用真实用户简历作为测试数据。

用户手动下载目录为 `D:\Media\图片`，包含两份 chikorita 单栏和一份 glalie 单栏 DOCX。随后通过内置浏览器完成剩余 5 个用例，实际保存目录为 `C:\Users\lvjun\Downloads`。全部 8 份文件均已解压检查通过，共覆盖 7 个用例；此前下载事件超时不等于文件没有保存。

ditgar、gengar 在实际编辑器中关闭再开启“全宽”后导出。glalie 双栏对照保持双栏；pikachu 多页对照为双栏后接单栏，已保存的 DOCX 中第二布局页专用正文完整，姓名、邮箱、电话及求职意向各出现一次。检查依据为实际落盘文件，不以按钮点击或 Blob 生成判为通过。

`output/docx-header-fix-20261007/downloads/results.json` 保存字段与链接结果，`structure-results.json` 保存正文、头部栏位及多页正文验证，`files/` 保存全部真实下载文件副本。区域断言确认单栏头部位于正文顶部、glalie 双栏头部位于侧栏且先于侧栏正文、pikachu 多页头部位于首表主栏。正常简历未混入求职信。

documents 技能的 `render_docx.py` 已实际执行，缺少 LibreOffice `soffice.exe`，未生成可供检查的页面图。发现本机 Word 可执行文件，但当前工具未提供可用的原生应用控制；尚未完成 Word/WPS 视觉抽查。按用户计划明确记录限制，不用 XML 检查冒充视觉验收。

重启后用户重新登录 Chrome Workbench。切流前只读预检再次确认实际旧容器为 `weekly-release-20261007-3c62a7b7ee72`、回环端口 3207；本次回退目标已核实。Docker 临时 socket 导致启动失败，保留并改名临时运行目录后恢复，本地验收数据库和上传卷保留。

全部下载用例已完成。本地多页验收页面保留，地址为 `http://127.0.0.1:3407/builder/01a116e9-1196-7211-a966-963f04bbfeaa`；截图保存在候选目录的 `browser-multi-proof-20261008.png`，仅证明浏览器 PDF 预览，不代表 Word 视觉验收。

| 已通过用例 | 实际保存目录 |
| --- | --- |
| chikorita 单栏、glalie 单栏 | `D:\Media\图片` |
| pikachu 单栏、ditgar 切换单栏、gengar 切换单栏 | `C:\Users\lvjun\Downloads` |
| glalie 双栏、pikachu 多页 | `C:\Users\lvjun\Downloads` |

## 候选版本身份

- 基线提交：`ef30b1d819044584b0f729d21e5c186cf3935722`。
- 修复前已发布源码：`3c62a7b7ee72a2731b8e36e84de215249ea2defc333dde62ce40a71c30e6c129`。
- 候选源码 SHA-256：`a8bd1a48b43d9ca08c5f2244f8ed3e2ca2b113ba5cc3d3e1b691336b032ca7a7`，1,698 文件。
- 候选镜像：`weekly-resume:docx-header-20261007-a8bd1a48b43d`。
- 本地 Docker manifest ID：`sha256:49b41d2d0870b40858b124a832ca169921f85f35d51a7e26af9b356883317687`；Linux amd64 image config：`sha256:ec7b5cd3667fcfec9fc37adfa87c19acb9af382b757e637b246fb89eac9eaa71`。跨 Docker 引擎应同时校验源码标签与归档哈希，不假定 manifest-list ID 恒定。
- 归档：`output/docx-header-release-20261007/weekly-resume-docx-header-20261007.tar.gz`，419,985,460 字节。
- 归档 SHA-256：`b6ca089173e406caa6871fdd26c533578f9acccaf6d9b1664f4f2c50f6ca6fb6`。
- 冻结源码清单、构建日志、归档校验、容器状态和前端 JS 哈希均保留在候选发布目录。候选清单与当前源码及冻结文件逐一核验，无漂移。
- 相对前次正式发布仅增加/修改 `builder.ts`、3 个测试/辅助文件及 `tooling/docx-header-acceptance.mts`。应用运行行为只修改 DOCX builder。

## 上线与回退记录

本次已完成的服务器准备（2026-10-08）：

- 备份目录 `/opt/weekly-resume-backups/docx-header-20261008-a8bd1a48b43d`，包含当前数据库 dump、上传卷 tar、应用及代理 inspect、Caddy 配置，记录 SHA-256；数据库目录与 tar 列表检查通过，文件权限由 0077 umask 保护。
- 400 MB 归档已上传至 `/home/admin/weekly-resume-docx-header-20261007.tar.gz`，419,985,460 字节和 SHA-256 与本地一致，镜像已加载，源码标签及 amd64 架构通过。
- 隔离候选 `weekly-verify-docx-a8bd1a48b43d` 使用新建空数据库 `weekly_verify_docx_20261008`、独立上传卷和 Redis，回环端口 3308；服务、数据库、存储健康，迁移文件与现有生产版本完全相同。未复制真实用户简历供测试。
- 服务器阶段脚本及结果位于 `/opt/weekly-docx-20261007-a8bd1a48b43d`，本地阶段脚本位于候选发布输出目录。
- 前期隔离候选 337 个前端 JS 文件均与冻结候选哈希匹配，重启 0、OOM false，未发现致命错误日志。已生成 `/opt/weekly-docx-20261007-a8bd1a48b43d/rollback.py` 及本次 `Caddyfile.before`，Caddy 回退配置验证通过；之后按下述步骤完成切流，未执行回退。

正式切流记录（2026-10-08）：

- 即时备份 `/opt/weekly-resume-backups/docx-header-preswitch-20261008T093920923574Z`：数据库 dump 可读、上传 tar 可列出，当前应用和代理 inspect、配置、回退脚本均保存并记录哈希，权限受 0077 umask 保护。
- 新容器 `weekly-docx-20261008-a8bd1a48b43d`，回环端口 3208，沿用实际旧容器全部环境、上传卷、网络、896 MiB 内存限制和重启策略；迁移文件完全相同。
- 17:40:34 经过新容器健康和 337 项资源校验后切换 Caddy；公网健康和全部资源哈希通过。公网入口 JS 为 `/assets/index-C4mlH_MD.js`。
- 17:41:16 即时检查：服务、数据库、存储 healthy，重启 0、OOM false，切流后错误及致命日志标记 0。
- 17:46:30 最终检查：开始复查时距切流 335 秒，服务、数据库、存储 healthy，337 项资源哈希一致，重启 0、OOM false，错误及致命日志标记 0。旧容器已停止但保留；新容器使用约 188 MiB / 896 MiB。17:46:43 从本机再次核验公网健康及 4 项中文 PDF 资源通过。
- 发布脚本 `remote-production-release.py`、`production-prepared.json`、`production-switched.json`、`production-immediate-check.json`、`release-final.json`、公网资源和入口检查结果保存在本地候选目录；服务器同名记录保存在 `/opt/weekly-docx-20261007-a8bd1a48b43d`。上线与复查截图为 `production-final-proof-20261008.png`。

发布流程及重复发布约束：

1. 下载验收已完成。若候选源码或镜像变化，应重新验证相应用例；当前冻结源码、镜像及归档未变。
2. 在恢复的 Workbench 运行 `remote-preflight.py` 只读检查。预期修复前容器是 `weekly-release-20261007-3c62a7b7ee72`、回环端口 3207、代理为 `weekly-edge`。若实际身份不同，应重新确定回退目标。
3. 备份本次实际生产数据库、`weekly_release_ef30b1d_data` 上传卷、容器完整 inspect 及 Caddy 配置，敏感文件权限 0600；验证备份可读并记录哈希。
4. 上传并核验上述归档大小/SHA-256，Docker load 后核验源码标签。用独立数据库、Redis、上传目录检查候选，确认迁移目录与现有版本一致；候选实例不连接生产数据。
5. 保存本次 `Caddyfile.before`，基于实际旧容器环境和存储创建新生产容器，健康且资源哈希与候选一致后才切换代理。新容器应使用空闲回环端口，不能占用旧容器 3207。
6. 切流后立即及约 5 分钟检查公网健康、前端资源哈希、重启/OOM 和错误日志；通过后再停止旧容器，保留镜像和容器供回退。

回退必须启动本次修复前实际容器，确认其 `/api/health` 正常，验证并恢复本次保存的 Caddy 配置，再 reload `weekly-edge`。**不能使用前次发布的 rollback.py：它指向更早的 `weekly-release-ef30b1d`。** 本次已生成且验证的回退命令为 `sudo python3 /opt/weekly-docx-20261007-a8bd1a48b43d/rollback.py`，目标是实际修复前容器 `weekly-release-20261007-3c62a7b7ee72`；回退不得恢复或覆盖数据库及上传文件。

上线后用户需刷新已打开的编辑器，并重新导出此前缺个人信息的 Word 文件。已保存简历无需迁移。

GitHub 未提交或推送本次修复。2026-10-08 最后核对远端 `main` 仍为 `ef30b1d819044584b0f729d21e5c186cf3935722`；本次生产身份以冻结源码和镜像 SHA-256 为准。后续同步仓库应整理源码、测试和文档，排除镜像、备份、验收临时文件及凭据。
