// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
	createBrowserHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
	RouterProvider,
	redirect,
} from "@tanstack/react-router";
import { StrictMode, useState } from "react";
import { ConfirmDialogProvider } from "@/hooks/use-confirm";
import { getLocaleMessages } from "@/libs/locale";
import { useTemporaryInputGuard } from "./use-temporary-input-guard";

function InputPage() {
	const [value, setValue] = useState("");
	useTemporaryInputGuard({ hasTemporaryInput: value.length > 0, loginRequired: true });
	return (
		<>
			<label>
				Temporary name
				<input value={value} onChange={(event) => setValue(event.target.value)} />
			</label>
			<Link to="/dashboard">Start</Link>
			<Link to="/ats-checker">Checker</Link>
			<Link to="/" hash="templates">
				Templates
			</Link>
			<a href="/templates/pdf/rhyhorn.pdf" target="_blank" rel="noreferrer">
				Sample PDF
			</a>
			<a href="blob:synthetic-download" download="sample.json">
				Download
			</a>
		</>
	);
}

const histories: ReturnType<typeof createBrowserHistory>[] = [];

async function setup() {
	const history = createBrowserHistory();
	histories.push(history);
	const root = createRootRoute({ component: Outlet });
	const home = createRoute({ getParentRoute: () => root, path: "/", component: InputPage });
	const checker = createRoute({ getParentRoute: () => root, path: "/ats-checker", component: InputPage });
	const dashboard = createRoute({
		getParentRoute: () => root,
		path: "/dashboard",
		beforeLoad: () => {
			throw redirect({ to: "/auth/login", replace: true });
		},
	});
	const login = createRoute({ getParentRoute: () => root, path: "/auth/login", component: () => <p>Sign in here</p> });
	const router = createRouter({ routeTree: root.addChildren([home, checker, dashboard, login]), history });
	await router.load();
	const view = render(
		<StrictMode>
			<I18nProvider i18n={i18n}>
				<ConfirmDialogProvider>
					<RouterProvider router={router} />
				</ConfirmDialogProvider>
			</I18nProvider>
		</StrictMode>,
	);
	await screen.findByLabelText("Temporary name");
	return { ...view, history, router };
}

function edit() {
	fireEvent.change(screen.getByLabelText("Temporary name"), { target: { value: "GUEST-GUARD-中文" } });
}

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	window.history.replaceState(null, "", "/");
});
afterEach(() => {
	cleanup();
	for (const history of histories.splice(0)) history.destroy();
	vi.restoreAllMocks();
});

it("has no blocker on an untouched page and keeps the original login redirect", async () => {
	const { history } = await setup();
	expect(history._getBlockers()).toHaveLength(0);
	fireEvent.click(screen.getByText("Start"));
	await screen.findByText("Sign in here");
	expect(history.location.pathname).toBe("/auth/login");
	expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("cancels without losing input, focuses Stay first and restores focus after Escape", async () => {
	const { history } = await setup();
	edit();
	screen.getByText("Start").focus();
	fireEvent.click(screen.getByText("Start"));
	expect(await screen.findByRole("alertdialog")).toHaveTextContent("Signing in will not carry over");
	await waitFor(() => expect(screen.getByText("Stay on this page")).toHaveFocus());
	fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
	await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
	expect(history.location.pathname).toBe("/");
	expect(screen.getByLabelText("Temporary name")).toHaveValue("GUEST-GUARD-中文");
	await waitFor(() => expect(screen.getByText("Start")).toHaveFocus());
});

it("deduplicates pending clicks, continues once through the auth redirect and protects a later edit", async () => {
	const { history, router } = await setup();
	edit();
	fireEvent.click(screen.getByText("Start"));
	fireEvent.click(screen.getByText("Checker"));
	expect(await screen.findAllByRole("alertdialog")).toHaveLength(1);
	fireEvent.click(screen.getByText("Leave anyway"));
	await screen.findByText("Sign in here");
	expect(history.location.pathname).toBe("/auth/login");
	await act(async () => {
		await router.navigate({ to: "/" });
	});
	edit();
	fireEvent.click(screen.getByText("Checker"));
	expect(await screen.findByRole("alertdialog")).toHaveTextContent("not saved");
	fireEvent.click(screen.getByText("Stay on this page"));
	await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
	expect(history.location.pathname).toBe("/");
});

it("ignores same-page hashes, new-tab PDFs and downloads without marking input saved", async () => {
	const { history } = await setup();
	edit();
	fireEvent.click(screen.getByText("Templates"));
	await waitFor(() => expect(history.location.hash).toBe("#templates"));
	expect(screen.queryByRole("alertdialog")).toBeNull();
	// The DOM emulator does not perform downloads or open real tabs.
	for (const label of ["Sample PDF", "Download"]) {
		const link = screen.getByText(label);
		link.addEventListener("click", (event) => event.preventDefault(), { once: true });
		fireEvent.click(link);
	}
	expect(history._getBlockers()).toHaveLength(1);
	expect(screen.queryByRole("alertdialog")).toBeNull();
	expect(screen.getByLabelText("Temporary name")).toHaveValue("GUEST-GUARD-中文");
});

it("enables native beforeunload only while dirty and removes its blocker on reset/unmount in StrictMode", async () => {
	const { history, unmount } = await setup();
	const unload = () => {
		const event = new Event("beforeunload", { cancelable: true });
		window.dispatchEvent(event);
		return event.defaultPrevented;
	};
	expect(unload()).toBe(false);
	edit();
	expect(history._getBlockers()).toHaveLength(1);
	expect(unload()).toBe(true);
	fireEvent.change(screen.getByLabelText("Temporary name"), { target: { value: "" } });
	expect(history._getBlockers()).toHaveLength(0);
	expect(unload()).toBe(false);
	edit();
	unmount();
	expect(history._getBlockers()).toHaveLength(0);
	expect(unload()).toBe(false);
});

it("handles Back and Forward using the installed browser-history adapter", async () => {
	const { history, router } = await setup();
	await act(async () => {
		await router.navigate({ to: "/ats-checker" });
	});
	edit();
	act(() => history.back());
	await screen.findByRole("alertdialog");
	fireEvent.click(screen.getByText("Stay on this page"));
	await waitFor(() => expect(window.location.pathname).toBe("/ats-checker"));
	expect(screen.getByLabelText("Temporary name")).toHaveValue("GUEST-GUARD-中文");
	act(() => history.back());
	await screen.findByRole("alertdialog");
	fireEvent.click(screen.getByText("Leave anyway"));
	await waitFor(() => expect(history.location.pathname).toBe("/"));
	await screen.findByLabelText("Temporary name");
	edit();
	act(() => history.forward());
	await screen.findByRole("alertdialog");
	fireEvent.click(screen.getByText("Stay on this page"));
	await waitFor(() => expect(window.location.pathname).toBe("/"));
});

it("keeps one dialog and restores the current page after repeated Back is cancelled", async () => {
	const { history, router } = await setup();
	await act(async () => {
		await router.navigate({ to: "/auth/login" });
	});
	await act(async () => {
		await router.navigate({ to: "/ats-checker" });
	});
	edit();
	act(() => {
		history.back();
		history.back();
	});
	expect(await screen.findAllByRole("alertdialog")).toHaveLength(1);
	fireEvent.click(screen.getByText("Stay on this page"));
	await waitFor(() => expect(window.location.pathname).toBe("/ats-checker"));
	expect(history.location.pathname).toBe("/ats-checker");
	expect(screen.getByLabelText("Temporary name")).toHaveValue("GUEST-GUARD-中文");
});

it("accepts the first pending Back once even when another Back arrives while the dialog is open", async () => {
	const { history, router } = await setup();
	await act(async () => {
		await router.navigate({ to: "/auth/login" });
	});
	await act(async () => {
		await router.navigate({ to: "/ats-checker" });
	});
	edit();
	act(() => history.back());
	await screen.findByRole("alertdialog");
	act(() => history.back());
	expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
	fireEvent.click(screen.getByText("Leave anyway"));
	await screen.findByText("Sign in here");
	expect(history.location.pathname).toBe("/auth/login");
	expect(window.location.pathname).toBe("/auth/login");
});

it("uses the Chinese catalog for the warning without writing browser storage or uploading input", async () => {
	await setup();
	const chinese = await getLocaleMessages("zh-CN");
	act(() => i18n.loadAndActivate(chinese));
	const storage = vi.spyOn(Storage.prototype, "setItem");
	const network = vi.spyOn(globalThis, "fetch");
	edit();
	fireEvent.click(screen.getByText("Start"));
	expect(await screen.findByRole("alertdialog")).toHaveTextContent("离开当前页面？");
	expect(screen.getByRole("alertdialog")).toHaveTextContent("登录不会自动带入当前示例或分析内容");
	fireEvent.click(screen.getByText("留在本页"));
	await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
	expect(storage).not.toHaveBeenCalled();
	expect(network).not.toHaveBeenCalled();
});
