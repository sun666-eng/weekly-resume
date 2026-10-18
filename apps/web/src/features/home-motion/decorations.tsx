import type { CSSProperties } from "react";
import type { MotionEngine } from "./browser";
import { useLingui } from "@lingui/react";
import { useEffect, useRef, useState } from "react";
import { crowdAssets } from "./assets";
import "./motion.css";

type Region = "hero" | "crowd";

function useDecoration(region: Region) {
	const host = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const engine = useRef<MotionEngine | null>(null);
	const manual = useRef(false);
	const [paused, setPaused] = useState(false);
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const element = host.current;
		const surface = canvas.current;
		if (!element || !surface) return;
		const abort = new AbortController();
		try {
			manual.current = sessionStorage.getItem(`weekly-home-motion-${region}`) === "paused";
			setPaused(manual.current);
		} catch {
			// Storage is optional; it must never block the existing homepage.
		}
		let loading = false;
		const start = async () => {
			if (loading || abort.signal.aborted) return;
			loading = true;
			try {
				const create =
					region === "hero"
						? (await import("./hero-engine")).createHeroEngine
						: (await import("./crowd-engine")).createCrowdEngine;
				if (abort.signal.aborted) return;
				const instance = await create({
					host: element,
					canvas: surface,
					paused: manual.current,
					signal: abort.signal,
					onReduced: (value) => {
						if (!abort.signal.aborted) setReduced(value);
					},
				});
				if (abort.signal.aborted) {
					instance?.dispose();
					return;
				}
				engine.current = instance;
				instance?.pause(manual.current);
			} catch {
				// A native static fallback remains if loading or Canvas initialization fails.
			}
		};
		const preload =
			region === "crowd" && typeof IntersectionObserver !== "undefined"
				? new IntersectionObserver(
						([entry]) => {
							if (entry?.isIntersecting) {
								preload?.disconnect();
								void start();
							}
						},
						{ rootMargin: "400px" },
					)
				: null;
		if (preload) preload.observe(element);
		else void start();
		return () => {
			abort.abort();
			preload?.disconnect();
			engine.current?.dispose();
			engine.current = null;
		};
	}, [region]);
	const toggle = () => {
		manual.current = !manual.current;
		setPaused(manual.current);
		engine.current?.pause(manual.current);
		try {
			sessionStorage.setItem(`weekly-home-motion-${region}`, manual.current ? "paused" : "playing");
		} catch {
			// Continue with the in-memory preference when storage is unavailable.
		}
	};
	return { host, canvas, paused, reduced, toggle };
}

type PauseControlProps = { region: Region; paused: boolean; reduced: boolean; toggle: () => void };

function PauseControl({ region, paused, reduced, toggle }: PauseControlProps) {
	const { i18n } = useLingui();
	const chinese = i18n.locale === "zh-CN";
	const subject = chinese
		? region === "hero"
			? "首屏背景"
			: "人物动效"
		: region === "hero"
			? "hero background"
			: "crowd motion";
	const action = chinese ? (paused ? "恢复" : "暂停") : paused ? "Play" : "Pause";
	return (
		<button
			type="button"
			className="motion-toggle"
			onClick={toggle}
			aria-pressed={paused}
			aria-label={
				reduced
					? chinese
						? "已按系统偏好减少动态效果"
						: "Motion reduced by system preference"
					: `${action} ${subject}`
			}
			disabled={reduced}
		>
			<span className="motion-toggle-icon" aria-hidden="true">
				{paused ? "▷" : "Ⅱ"}
			</span>
			<span>
				{reduced ? (chinese ? "静态效果" : "Reduced motion") : chinese ? `${action}动效` : `${action} motion`}
			</span>
		</button>
	);
}

export function HeroMotion() {
	const motion = useDecoration("hero");
	return (
		<div ref={motion.host} className="motion-hero" data-home-motion="hero">
			<div className="motion-hero-static" aria-hidden="true" />
			<canvas ref={motion.canvas} aria-hidden="true" tabIndex={-1} />
			<PauseControl region="hero" {...motion} />
		</div>
	);
}

export function CrowdMotion() {
	const motion = useDecoration("crowd");
	return (
		<div ref={motion.host} className="motion-crowd" data-home-motion="crowd">
			<div className="motion-crowd-fallback" aria-hidden="true">
				{crowdAssets.map((src, index) => (
					<img
						key={src}
						src={src}
						alt=""
						loading="lazy"
						decoding="async"
						style={
							{
								"--actor-x": `${(index / (crowdAssets.length - 1)) * 100}%`,
								"--actor-depth": index % 3,
							} as CSSProperties
						}
					/>
				))}
			</div>
			<canvas ref={motion.canvas} aria-hidden="true" tabIndex={-1} />
			<PauseControl region="crowd" {...motion} />
		</div>
	);
}
