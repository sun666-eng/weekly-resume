type AuthError = {
	code?: unknown;
	message?: unknown;
};

const authErrorMessages: Record<string, string> = {
	USER_NOT_FOUND: "未找到该账号，请检查邮箱或用户名。",
	INVALID_EMAIL: "邮箱格式不正确，请重新输入。",
	INVALID_PASSWORD: "密码不正确，请重新输入。",
	INVALID_EMAIL_OR_PASSWORD: "邮箱、用户名或密码不正确。",
	INVALID_USER: "账号信息无效，请重新登录。",
	EMAIL_NOT_VERIFIED: "邮箱尚未验证，请先完成邮箱验证。",
	PASSWORD_TOO_SHORT: "密码长度不能少于 6 位。",
	PASSWORD_TOO_LONG: "密码长度不能超过 64 位。",
	USER_ALREADY_EXISTS: "该邮箱已注册，请直接登录。",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "该邮箱已注册，请直接登录或更换邮箱。",
	INVALID_TOKEN: "验证链接无效，请重新获取。",
	TOKEN_EXPIRED: "验证链接已过期，请重新获取。",
	SESSION_EXPIRED: "登录状态已过期，请重新登录。",
	INVALID_CODE: "验证码不正确，请重新输入。",
	INVALID_BACKUP_CODE: "备用验证码不正确，请重新输入。",
	OTP_HAS_EXPIRED: "验证码已过期，请重新获取。",
	TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "尝试次数过多，请重新获取验证码。",
	ACCOUNT_TEMPORARILY_LOCKED: "失败次数过多，账号已暂时锁定，请稍后再试。",
};

const authMessageCodes: Record<string, string> = {
	"User already exists.": "USER_ALREADY_EXISTS",
	"User already exists. Use another email.": "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
	"Invalid email or password": "INVALID_EMAIL_OR_PASSWORD",
	"Invalid password": "INVALID_PASSWORD",
	"Email not verified": "EMAIL_NOT_VERIFIED",
	"Password too short": "PASSWORD_TOO_SHORT",
	"Password too long": "PASSWORD_TOO_LONG",
	"Invalid token": "INVALID_TOKEN",
	"Token expired": "TOKEN_EXPIRED",
};

export function getAuthErrorMessage(error: unknown, fallback: string): string {
	if (typeof error !== "object" || error === null) return fallback;

	const { code, message } = error as AuthError;
	if (typeof code === "string" && authErrorMessages[code]) return authErrorMessages[code];

	if (typeof message === "string") {
		const mappedCode = authMessageCodes[message];
		if (mappedCode) return authErrorMessages[mappedCode] ?? fallback;
	}

	return fallback;
}
