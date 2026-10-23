import { msg } from "@lingui/core/macro";

export const guestDisclosure = msg({
	id: "guest.disclosure",
	message: "Create without registering. Saving to an account and formal export require sign-in. Local backups do not.",
});
export const guestStorageNotice = msg({
	id: "guest.storageNotice",
	message:
		"Stored only in this browser. Clearing browser data, private browsing, storage eviction, changing device or site address can prevent recovery. Back up important work.",
});
export const guestStatuses = {
	恢复中: msg({ id: "guest.status.restoring", message: "Restoring" }),
	正在本机暂存: msg({ id: "guest.status.saving", message: "Saving in this browser" }),
	已暂存到此浏览器: msg({ id: "guest.status.saved", message: "Saved in this browser" }),
	"暂存失败：可以取回本机备份": msg({ id: "guest.status.failed", message: "Local save failed — retrieve a backup" }),
	"暂存失败：内容仍在本页，请取回备份": msg({
		id: "guest.status.failed",
		message: "Local save failed — retrieve a backup",
	}),
	正在保存到账号: msg({ id: "guest.status.claiming", message: "Saving to account" }),
	已保存到账号: msg({ id: "guest.status.claimed", message: "Saved to account" }),
};
