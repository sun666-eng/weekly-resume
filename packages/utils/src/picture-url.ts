/** Resolve local upload URLs without rewriting third-party image hosts. */
export function normalizePictureUrl(value: string, origin: string): string {
	if (!value || !origin) return value;
	try {
		const url = new URL(value, origin);
		const current = new URL(origin);
		const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
		const sameServer = url.origin === current.origin || (
			loopback.has(url.hostname) && loopback.has(current.hostname) &&
			url.protocol === current.protocol && url.port === current.port
		);
		if (!sameServer || url.username || url.password) return value;
		if (url.pathname.startsWith("/uploads/")) url.pathname = `/api${url.pathname}`;
		if (!url.pathname.startsWith("/api/uploads/")) return value;
		return `${current.origin}${url.pathname}${url.search}${url.hash}`;
	} catch {
		return value;
	}
}
