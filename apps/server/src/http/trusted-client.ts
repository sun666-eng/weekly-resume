import { isIP } from "node:net";

function normalizeIp(value: string | undefined | null) {
	const ip = value?.trim();
	if (!ip || ip.includes("%") || !isIP(ip)) return null;
	if (isIP(ip) === 4) return ip;
	const canonical = new URL(`http://[${ip}]`).hostname.slice(1, -1);
	const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(canonical);
	if (!mapped) return canonical;
	const high = Number.parseInt(mapped[1] ?? "0", 16);
	const low = Number.parseInt(mapped[2] ?? "0", 16);
	return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

function isPrivatePeer(ip: string) {
	if (isIP(ip) === 6) return ip === "::1" || /^f[cd][0-9a-f]{2}:/.test(ip);
	const [a, b = 0] = ip.split(".").map(Number);
	return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function resolveTrustedClient(peer: string | undefined, headers: Headers, trustProxy: boolean) {
	const socket = normalizeIp(peer);
	if (!socket) return "unknown";
	if (!trustProxy || !isPrivatePeer(socket)) return socket;
	// A trusted reverse proxy appends its observed client to the right of the forwarding chain.
	const chain = headers.get("x-forwarded-for")?.split(",").reverse() ?? [];
	for (const hop of chain) {
		const ip = normalizeIp(hop);
		if (!ip) return socket;
		if (!isPrivatePeer(ip)) return ip;
	}
	const real = normalizeIp(headers.get("x-real-ip"));
	return real && !isPrivatePeer(real) ? real : socket;
}
