export function isWeChatBrowser(userAgent = globalThis.navigator?.userAgent ?? ""): boolean {
	return /MicroMessenger/i.test(userAgent);
}
