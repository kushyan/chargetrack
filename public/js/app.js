"use strict";

/**
 * 线上实时数据地址（Cloudflare Worker）。
 * 留空则走 /api/status（本地 server.mjs 或其它自托管），再不行退回 data.json（Actions 快照）。
 */
const REMOTE_API = "https://chargetrack-api.2952832309.workers.dev";

const POLL_MS = 10000;
const CACHE_KEY = "chargetrack.snapshot";
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;

const els = {
	stations: document.getElementById("stations"),
	sourcePill: document.getElementById("source-pill"),
	sourceText: document.getElementById("source-text"),
	updatedAt: document.getElementById("updated-at"),
	refreshBtn: document.getElementById("refresh-btn"),
	themeBtn: document.getElementById("theme-btn"),
	notice: document.getElementById("notice"),
	statFree: document.getElementById("stat-free"),
	statBusy: document.getElementById("stat-busy"),
	statOffline: document.getElementById("stat-offline"),
	statStations: document.getElementById("stat-stations"),
};

/* ---------------- 主题 ---------------- */
(function initTheme() {
	const saved = localStorage.getItem("theme");
	const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
	document.documentElement.dataset.theme = saved || (prefersLight ? "light" : "dark");

	els.themeBtn.addEventListener("click", () => {
		const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
		document.documentElement.dataset.theme = next;
		localStorage.setItem("theme", next);
	});
})();

/* ---------------- 状态映射 ---------------- */
// 上游 status: 1 = 空闲, 0 = 使用中, -1 = 故障；online=false 表示整台设备离线
function portClass(status, online) {
	if (online === false) return "is-fault";
	if (status === 1) return "is-free";
	if (status === -1) return "is-fault";
	return "is-busy";
}

function portLabel(status, online) {
	if (online === false) return "离线";
	if (status === 1) return "空闲";
	if (status === -1) return "故障";
	return "使用中";
}

/* ---------------- 数据请求 ---------------- */
// 优先级：Worker（实时）→ /api/status（本地服务）→ data.json（定时快照）
async function fetchStatus(force = false) {
	if (REMOTE_API) {
		try {
			const res = await fetch(`${REMOTE_API}${force ? "?force=1&t=" + Date.now() : ""}`, { cache: "no-store" });
			if (res.ok) {
				const data = await res.json();
				if (Array.isArray(data.stations) && data.stations.length) {
					data.mode = "live";
					return data;
				}
			}
		} catch (_) {
			/* 落到下一级 */
		}
	}

	try {
		const res = await fetch(force ? "/api/status?force=1" : "/api/status", { cache: "no-store" });
		if (res.ok && (res.headers.get("content-type") || "").includes("json")) {
			const data = await res.json();
			if (Array.isArray(data.stations) && data.stations.length) {
				data.mode = "live";
				return data;
			}
		}
	} catch (_) {
		/* 静态托管下这里会失败，继续往下走 */
	}

	const res = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
	if (!res.ok) throw new Error(`数据不可用 HTTP ${res.status}`);
	const data = await res.json();
	data.mode = "static";
	return data;
}

/* ---------------- 本地缓存：进站秒开 ---------------- */
function loadCachedSnapshot() {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const snap = JSON.parse(raw);
		if (!snap || !Array.isArray(snap.stations) || !snap.stations.length) return null;
		if (Date.now() - Date.parse(snap.updatedAt) > CACHE_MAX_AGE_MS) return null;
		snap.mode = "cached";
		return snap;
	} catch (_) {
		return null;
	}
}

function saveSnapshot(snapshot) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
	} catch (_) {
		/* 隐私模式写不进去，忽略 */
	}
}

/* ---------------- 渲染 ---------------- */
let firstRender = true;

function buildStationCard(station) {
	const card = document.createElement("article");
	card.className = "station skeleton";
	card.dataset.id = station.id;

	const head = document.createElement("div");
	head.className = "station-head";
	head.innerHTML = `
		<div class="station-name">${station.name}<small>${station.id}</small></div>
		<div class="station-meta"></div>`;

	const ports = document.createElement("div");
	ports.className = "ports";
	for (const port of station.data) {
		const el = document.createElement("div");
		el.className = "port";
		el.dataset.channel = port.channel;
		el.textContent = port.channel;
		ports.appendChild(el);
	}

	card.append(head, ports);
	return card;
}

function updateStationCard(card, station) {
	const online = station.online !== false;
	card.classList.toggle("is-offline", !online);

	let free = 0;
	const ports = card.querySelector(".ports");

	station.data.forEach((port, i) => {
		const el = ports.children[i];
		if (!el) return;

		const cls = portClass(port.status, online);
		if (port.status === 1 && online) free++;

		const prev = el.dataset.state;
		if (prev !== cls) {
			el.className = `port ${cls}`;
			el.dataset.state = cls;
			el.title = `通道 ${port.channel} · ${portLabel(port.status, online)}`;
			if (prev !== undefined && !firstRender) {
				void el.offsetWidth;
				el.classList.add("flash");
			}
		}
	});

	const meta = card.querySelector(".station-meta");
	meta.innerHTML = online
		? `<i class="on-dot"></i><span class="free-count">${free}</span>/${station.data.length} 空闲`
		: `<i class="off-dot"></i>离线`;

	card.classList.remove("skeleton");
}

function updateStats(stations) {
	let free = 0;
	let busy = 0;
	let offline = 0;
	let onlineStations = 0;

	for (const s of stations) {
		const online = s.online !== false;
		if (online) onlineStations++;
		for (const p of s.data) {
			if (!online) offline++;
			else if (p.status === 1) free++;
			else if (p.status === -1) offline++;
			else busy++;
		}
	}

	els.statFree.textContent = free;
	els.statBusy.textContent = busy;
	els.statOffline.textContent = offline;
	els.statStations.textContent = `${onlineStations}/${stations.length}`;
}

function render(snapshot) {
	const stations = snapshot.stations || [];
	const container = els.stations;

	const sameShape =
		container.children.length === stations.length &&
		stations.every((s, i) => container.children[i].dataset.id === s.id);

	if (!sameShape) {
		container.innerHTML = "";
		stations.forEach((s, i) => {
			const card = buildStationCard(s);
			card.style.animationDelay = `${i * 34}ms`;
			container.appendChild(card);
		});
	}

	stations.forEach((station, i) => updateStationCard(container.children[i], station));
	updateStats(stations);

	firstRender = false;

	// 数据来源 / 更新时间
	const source = snapshot.source || "live";
	const staticMode = snapshot.mode === "static";
	const cachedMode = snapshot.mode === "cached";
	const ts = snapshot.updatedAt ? new Date(snapshot.updatedAt) : new Date();
	const ageMin = Math.max(0, Math.round((Date.now() - ts.getTime()) / 60000));
	const stale = staticMode && ageMin >= 12;

	els.sourcePill.classList.toggle("live", source === "live" && !stale && !cachedMode);
	els.sourcePill.classList.toggle("error", source === "offline");
	els.sourcePill.classList.toggle("warn", stale);
	els.sourceText.textContent = cachedMode
		? "载入中…"
		: stale
			? `快照 ${ageMin} 分钟前`
			: staticMode
				? "定时快照"
				: source === "live"
					? "实时数据"
					: source === "partial"
						? "部分更新"
						: "上游离线";

	els.updatedAt.textContent = ts.toLocaleTimeString("zh-CN", { hour12: false });
	els.updatedAt.title = `最后更新：${ts.toLocaleString("zh-CN", { hour12: false })}（${ageMin} 分钟前）`;
}

/* ---------------- 轮询 ---------------- */
let inflight = false;
let staticMode = false;

/** 数据到手后收掉"首次加载耐心等待"提示 */
function hideNotice() {
	const n = els.notice;
	if (!n || n.hidden || n.classList.contains("is-hiding")) return;
	n.classList.add("is-hiding");
	setTimeout(() => {
		n.hidden = true;
		n.classList.remove("is-hiding");
	}, 500);
}

async function refresh(force = false) {
	if (inflight) return;
	inflight = true;
	els.refreshBtn.classList.add("spin");
	try {
		const snapshot = await fetchStatus(force);
		staticMode = snapshot.mode === "static";
		render(snapshot);
		if (snapshot.mode !== "cached") {
			saveSnapshot(snapshot);
			hideNotice();
		}
	} catch (e) {
		console.warn("[chargetrack] 刷新失败", e);
		els.sourcePill.classList.remove("live");
		els.sourcePill.classList.add("error");
		els.sourceText.textContent = "连接失败";
	} finally {
		inflight = false;
		setTimeout(() => els.refreshBtn.classList.remove("spin"), 400);
	}
}

async function loop() {
	await refresh();
	// 实时模式 10 秒轮询；静态快照由 Actions 定时更新，60 秒拉一次足够
	setTimeout(loop, staticMode ? 60000 : POLL_MS);
}

els.refreshBtn.addEventListener("click", () => refresh(true));

// 先用上次的数据秒开，再拉最新覆盖；没有缓存才显示"首次加载"提示
const cachedSnapshot = loadCachedSnapshot();
if (cachedSnapshot) {
	render(cachedSnapshot);
} else if (els.notice) {
	els.notice.hidden = false;
}

loop();
