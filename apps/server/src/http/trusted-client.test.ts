import { describe, expect, it } from "vitest";
import { resolveTrustedClient } from "./trusted-client";

const headers = new Headers({ "X-Real-IP": "198.51.100.8", "X-Forwarded-For": "203.0.113.5, 10.1.1.1" });

describe("trusted reverse proxy", () => {
	it.each([
		"127.15.2.3",
		"::1",
		"10.0.0.7",
		"172.16.0.1",
		"172.31.255.255",
		"192.168.0.1",
		"fc00::1",
		"fdab::1",
		"::ffff:192.168.0.9",
	])("accepts forwarding only with opt-in for %s", (peer) => {
		expect(resolveTrustedClient(peer, headers, true)).toBe("203.0.113.5");
		expect(resolveTrustedClient(peer, headers, false)).toBe(peer.startsWith("::ffff:") ? "192.168.0.9" : peer);
	});
	it.each(["198.51.100.4", "172.15.1.1", "172.32.1.1", "192.169.0.1", "fc::1", "2001:db8::1"])(
		"uses direct peer %s regardless of headers",
		(peer) => {
			expect(resolveTrustedClient(peer, headers, true)).toBe(peer);
		},
	);
	it("uses the client address appended by Caddy when X-Real-IP repeats the supplied leftmost hop", () => {
		const forwarded = new Headers({ "X-Real-IP": "1.1.1.1", "X-Forwarded-For": "1.1.1.1, 203.0.113.9" });
		expect(resolveTrustedClient("172.18.0.2", forwarded, true)).toBe("203.0.113.9");
	});
	it("uses the nearest valid public hop, normalizing alternate IP spellings", () => {
		expect(
			resolveTrustedClient(
				"::1",
				new Headers({ "x-real-ip": "not-an-ip", "x-forwarded-for": "203.0.113.5, 2001:0DB8::0020, ::ffff:10.0.0.2" }),
				true,
			),
		).toBe("2001:db8::20");
	});
	it.each([undefined, "10.1.2.3, ::1"])("uses a public X-Real-IP only after a clean forwarding chain (%s)", (chain) => {
		const forwarded = new Headers({ "x-real-ip": "::ffff:198.51.100.8" });
		if (chain !== undefined) forwarded.set("x-forwarded-for", chain);
		expect(resolveTrustedClient("127.0.0.1", forwarded, true)).toBe("198.51.100.8");
	});
	it.each(["", "192.0.2.2, invalid, 10.1.2.3"])(
		"stops at a malformed hop even with a valid X-Real-IP (%s)",
		(chain) => {
			const forwarded = new Headers({ "x-real-ip": "198.51.100.8", "x-forwarded-for": chain });
			expect(resolveTrustedClient("127.0.0.1", forwarded, true)).toBe("127.0.0.1");
		},
	);
	it.each(["::ffff:10.1.2.3", "fd00::2", "invalid"])("discards an unusable X-Real-IP fallback (%s)", (real) => {
		expect(resolveTrustedClient("127.0.0.1", new Headers({ "x-real-ip": real }), true)).toBe("127.0.0.1");
	});
	it.each(["", "10.1.2.3, ::1", "192.0.2.2, invalid, 10.1.2.3"])(
		"falls back to the socket at an unverifiable boundary",
		(chain) => {
			expect(resolveTrustedClient("127.0.0.1", new Headers({ "x-forwarded-for": chain }), true)).toBe("127.0.0.1");
		},
	);
	it("ignores headers without a valid socket peer", () => {
		expect(resolveTrustedClient(undefined, headers, true)).toBe("unknown");
		expect(resolveTrustedClient("invalid", headers, true)).toBe("unknown");
	});
});
