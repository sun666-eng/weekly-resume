import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { checkProductionConfig } from "./production-config-checks.ts";

async function main() {
	const { values } = parseArgs({ options: { env: { type: "string", default: ".env.production" } } });
	const root = fileURLToPath(new URL("../", import.meta.url));
	let contents: string;
	try {
		contents = await readFile(resolve(root, values.env), "utf8");
	} catch {
		console.error("无法读取配置文件。使用 --env 指定环境文件（相对仓库根目录），不要把密码粘贴到命令参数。");
		process.exitCode = 2;
		return;
	}
	const checks = checkProductionConfig(parseEnv(contents));
	console.log(
		JSON.stringify(
			{ scope: "production-compose-configuration-only", passed: checks.every((check) => check.passed), checks },
			null,
			2,
		),
	);
	console.log("此命令不发送邮件、不连接数据库、不调用 LLM、不部署；通过后仍需实测真实服务和发布后流程。");
	process.exitCode = checks.every((check) => check.passed) ? 0 : 1;
}

main().catch(() => {
	console.error("配置预检失败；为避免泄露凭据，不输出原始异常或配置内容。");
	process.exitCode = 2;
});
