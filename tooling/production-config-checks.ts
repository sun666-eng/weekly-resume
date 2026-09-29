export type ReleaseCheck = { id: string; passed: boolean; message: string };

/** Configuration-only gate for compose.production.yml. Never return secret values. */
export function checkProductionConfig(env: Record<string, string | undefined>): ReleaseCheck[] {
	const checks: ReleaseCheck[] = [];
	const add = (id: string, passed: boolean, message: string) => checks.push({ id, passed, message });
	const placeholder = /replace[- ]with|example\.(com|org|net)|changeme|your[-_ ]|你刚设置|请填写/i;
	const configured = (key: string) => Boolean(env[key]?.trim() && !placeholder.test(env[key] ?? ""));
	const secureValue = (key: string) => configured(key) && (env[key]?.length ?? 0) >= 32;

	let publicOrigin = false;
	try {
		const url = new URL(env.APP_URL ?? "");
		publicOrigin =
			url.protocol === "https:" &&
			url.hostname.includes(".") &&
			!/(^|\.)localhost$|^127\.|^0\.0\.0\.0$/.test(url.hostname) &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash &&
			url.pathname === "/" &&
			configured("APP_URL");
	} catch {
		/* Missing or invalid URL fails below. */
	}
	add("APP_URL", publicOrigin, "APP_URL 必须是实际 HTTPS 站点根地址，不能含用户名、路径或查询参数。");
	for (const key of ["AUTH_SECRET", "ENCRYPTION_SECRET", "POSTGRES_PASSWORD"]) {
		add(key, secureValue(key), `${key} 必须替换占位值，使用至少 32 字符的独立随机值。`);
	}
	add(
		"secret-independence",
		new Set([env.AUTH_SECRET, env.ENCRYPTION_SECRET, env.POSTGRES_PASSWORD]).size === 3,
		"AUTH_SECRET、ENCRYPTION_SECRET、POSTGRES_PASSWORD 必须各不相同。",
	);
	// Compose interpolates these directly into DATABASE_URL; reserved URI characters change its meaning.
	for (const key of ["POSTGRES_USER", "POSTGRES_DB", "POSTGRES_PASSWORD"]) {
		const value = env[key] ?? (key === "POSTGRES_PASSWORD" ? "" : "weekly_resume");
		add(
			`${key}-url-safe`,
			/^[A-Za-z0-9_.~-]+$/.test(value),
			`${key} 需使用 URL 安全字符；当前 Compose 直接将其拼接到数据库连接地址。`,
		);
	}
	for (const key of [
		"FLAG_DISABLE_SIGNUPS",
		"FLAG_DISABLE_EMAIL_AUTH",
		"FLAG_DISABLE_API_RATE_LIMIT",
		"FLAG_ALLOW_UNSAFE_AI_BASE_URL",
		"FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI",
	]) {
		add(
			`${key}-boolean`,
			env[key] === undefined || /^(true|false)$/.test(env[key] ?? ""),
			`${key} 若设置，必须明确填写 true 或 false。`,
		);
	}
	for (const key of [
		"FLAG_DISABLE_API_RATE_LIMIT",
		"FLAG_ALLOW_UNSAFE_AI_BASE_URL",
		"FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI",
	]) {
		add(key, env[key] === undefined || env[key] === "false", `${key} 上线时必须关闭。`);
	}
	add("PORT", env.PORT === undefined || env.PORT === "3000", "生产 Compose 的容器端口为 3000，PORT 必须保持一致。");
	add(
		"LOCAL_STORAGE_PATH",
		env.LOCAL_STORAGE_PATH === undefined || env.LOCAL_STORAGE_PATH === "/app/data",
		"本地文件存储必须落到 Compose 持久卷 /app/data。",
	);
	add(
		"REDIS_URL",
		env.REDIS_URL === undefined || env.REDIS_URL === "redis://redis:6379",
		"本编排使用内部 Redis；不要复用验收或其他环境的地址。",
	);
	// Email auth remains enabled by default, even when new signups are disabled.
	const emailEnabled = env.FLAG_DISABLE_EMAIL_AUTH !== "true";
	const smtpPresent = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].some((key) => Boolean(env[key]?.trim()));
	if (emailEnabled || smtpPresent) {
		for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
			add(key, configured(key), `${key} 必须完整配置；否则应用可能仅记录邮件而不实际投递。`);
		}
		const port = Number(env.SMTP_PORT ?? "587");
		add("SMTP_PORT", Number.isInteger(port) && port > 0 && port <= 65535, "SMTP_PORT 必须是有效端口。");
		add("SMTP_SECURE", /^(true|false)$/.test(env.SMTP_SECURE ?? "false"), "SMTP_SECURE 必须填写 true 或 false。");
		add(
			"smtp-tls-mode",
			port === 465 ? env.SMTP_SECURE === "true" : port !== 587 || env.SMTP_SECURE !== "true",
			"465 使用 SMTP_SECURE=true；587 使用 false 并通过 STARTTLS 升级。",
		);
		add(
			"smtp-not-test",
			!/^(localhost|127\.|mailpit$|mailhog$)/i.test(env.SMTP_HOST ?? ""),
			"上线不能使用本地邮件捕获服务。",
		);
	}
	return checks;
}
