import type { ResumeData } from "@reactive-resume/schema/resume/data";

const absent = Symbol("absent");
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function equal(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
	if (!object(a) || !object(b)) return false;
	const keys = Object.keys(a);
	return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]));
}

/** Merge independent edits, reporting every ambiguous value before a caller writes anything. */
export function mergeResumeVersions(
	base: ResumeData,
	local: ResumeData,
	server: ResumeData,
	preference: "local" | "server" = "local",
): { data: ResumeData; conflicts: string[] } {
	const conflicts: string[] = [];
	const conflict = (path: string, a: unknown, b: unknown) => {
		conflicts.push(path);
		return preference === "local" ? a : b;
	};
	function merge(b: unknown, l: unknown, s: unknown, path: string): unknown {
		if (equal(l, b)) return s;
		if (equal(s, b) || equal(l, s)) return l;
		if (object(b) && object(l) && object(s)) {
			const out: Record<string, unknown> = {};
			for (const key of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(s)])) {
				const value = merge(
					Object.hasOwn(b, key) ? b[key] : absent,
					Object.hasOwn(l, key) ? l[key] : absent,
					Object.hasOwn(s, key) ? s[key] : absent,
					`${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
				);
				if (value !== absent)
					Object.defineProperty(out, key, { value, enumerable: true, configurable: true, writable: true });
			}
			return out;
		}
		if (Array.isArray(b) && Array.isArray(l) && Array.isArray(s)) {
			const identified = (items: unknown[]): items is { id: string }[] =>
				items.every((v) => object(v) && typeof v.id === "string") &&
				new Set(items.map((v) => (v as { id: string }).id)).size === items.length;
			if (identified(b) && identified(l) && identified(s)) {
				const bm = new Map(b.map((v) => [v.id, v]));
				const lm = new Map(l.map((v) => [v.id, v]));
				const sm = new Map(s.map((v) => [v.id, v]));
				const common = b.map((v) => v.id).filter((id) => lm.has(id) && sm.has(id));
				const retainedOrder = (items: { id: string }[]) => items.map((v) => v.id).filter((id) => common.includes(id));
				const lo = retainedOrder(l);
				const so = retainedOrder(s);
				let order = equal(lo, common) ? s : l;
				if (!equal(lo, common) && !equal(so, common) && !equal(lo, so))
					order = conflict(`${path}/order`, l, s) as typeof l;
				const out: unknown[] = [];
				for (const id of new Set([...order, ...l, ...s, ...b].map((v) => v.id))) {
					const value = merge(bm.get(id) ?? absent, lm.get(id) ?? absent, sm.get(id) ?? absent, `${path}/${id}`);
					if (value !== absent) out.push(value);
				}
				return out;
			}
		}
		return conflict(path, l, s);
	}
	return { data: structuredClone(merge(base, local, server, "") as ResumeData), conflicts };
}
