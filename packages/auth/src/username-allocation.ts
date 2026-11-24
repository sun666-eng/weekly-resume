import { generateId, toUsername } from "@reactive-resume/utils/string";

export async function allocateUniqueUsername(
	email: string,
	taken: (candidate: string) => Promise<boolean>,
	preferred?: string | null,
) {
	const prefix = toUsername(preferred ?? "") || toUsername(email.split("@")[0] ?? "");
	const base = prefix.length >= 3 ? prefix : prefix ? `user-${prefix}` : "user";
	let candidate = base;
	for (let index = 1; await taken(candidate); index++) {
		const suffix = index <= 999 ? `-${index}` : `-${generateId().slice(0, 8).toLowerCase()}`;
		candidate = base.slice(0, 64 - suffix.length) + suffix;
	}
	return candidate;
}
