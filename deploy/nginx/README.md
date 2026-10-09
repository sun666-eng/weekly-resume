# Nginx 私下验收入口

备案期间，代理只监听服务器的 `127.0.0.1:8080`，不开放公网网站端口。
应用仍保留原来的 `127.0.0.1:3000` 入口；数据库和现有配置不变。

## 启动或更新代理

在服务器 `/opt/weekly-resume` 中执行：

```sh
docker compose --env-file .env.production -f compose.production.yml -f compose.nginx.yml config --quiet
docker compose --env-file .env.production -f compose.production.yml -f compose.nginx.yml up -d --no-deps nginx
docker compose --env-file .env.production -f compose.production.yml -f compose.nginx.yml exec -T nginx nginx -t
curl --fail http://127.0.0.1:8080/api/health
```

代理支持流式输出和 WebSocket，上传请求上限为 50 MiB（应用自身的限制仍然有效）。
默认关闭响应缓冲，读取空闲超时为 600 秒；这不是模型请求一定能运行 600 秒的保证。

## 本机访问

当服务器 `APP_URL=http://localhost:3000` 时，在电脑的终端执行。请先从服务器控制台确认公网 IP、SSH 用户和端口；不要直接复用旧文档中的地址：

```sh
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 127.0.0.1:3000:127.0.0.1:8080 <ssh-user>@<server-public-ip>
```

按提示输入服务器密码，然后打开 `http://localhost:3000`。终端没有输出通常表示隧道正在运行。
本机 3000 端口须空闲；若本地开发项目正在运行，请先停止它。
关闭隧道或电脑后服务器仍运行，次日重新建立隧道即可。
若生产环境 APP_URL 不同，应先统一访问地址和 APP_URL，避免登录来源校验失败。

服务器面板截图曾显示 `82.158.91.216` 和 `root`，但这不是经过 SSH 验证的部署事实；如果面板仍显示该信息，应先在面板确认实例状态、SSH 端口和当前凭据，再执行只读核验。不要把密码写进命令、仓库或交接文件。

## 正式上线前

备案完成后另行配置真实域名、DNS、TLS 证书、HTTPS 代理、APP_URL 与安全组。
不要仅把此配置的监听地址改成公网地址就当作 HTTPS 部署完成。
上线验收需包含登录、头像上传、Agent 流式对话、PDF 导出和邮件链接。

## 停止代理

```sh
docker compose --env-file .env.production -f compose.production.yml -f compose.nginx.yml stop nginx
```

仅停止代理，不影响原应用及数据库。不要使用 `down -v`，以免删除数据卷。
