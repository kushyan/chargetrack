import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG, applyFaultOverrides } from "./config.mjs";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

/* ========== 上游取数 ========== */
async function upstreamPost(apiPath, body) {
	const { base, uid, referer, timeoutMs } = CONFIG.upstream;
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), timeoutMs);
	try {
		const res = await fetch(base + apiPath, {
			method: "POST",
			headers: {
				"Content-Type": "application/json;charset=UTF-8",
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
				"Origin": new URL(referer).origin,
				Referer: referer,
			},
			body: JSON.stringify({ dev_id: body.dev_id, uid }),
			signal: ac.signal,
		});
		const text = await res.text();
		const json = JSON.parse(text);
		if (json.code !== 0) throw new Error(`上游返回 code=${json.code} ${json.msg || ""}`);
		return json.data;
	} finally {
		clearTimeout(timer);
	}
}

/** 单次快照：并行拉全部站点，失败的单站保留上一次成功值 */
async function fetchSnapshot() {
	const results = await Promise.all(
		CONFIG.stations.map(async (station) => {
			const prev = lastGood.get(station.id);
			try {
				const [op, chk] = await Promise.all([
					upstreamPost("/chargingOperation", { dev_id: station.id }),
					upstreamPost("/checkDev", { dev_id: station.id }),
				]);
				const ports = applyFaultOverrides(
					station.name,
					(op.socket || []).map((s) => ({
						channel: String(s.channel),
						status: Number(s.status),
					})),
				);
				if (!ports.length) throw new Error("无端口数据");
				return { station, ports, online: Number(chk.is_online) === 1, live: true };
			} catch (e) {
				return {
					station,
					ports: prev ? prev.ports : fallbackPorts(),
					online: false,
					live: false,
					error: e.message,
				};
			}
		}),
	);

	const snapshot = {
		updatedAt: new Date().toISOString(),
		source: results.every((r) => r.live) ? "live" : results.some((r) => r.live) ? "partial" : "offline",
		stations: results.map((r) => ({
			name: r.station.name,
			id: r.station.id,
			online: r.online,
			data: r.ports,
			...(r.error ? { error: r.error } : {}),
		})),
	};

	for (const r of results) {
		if (r.live) lastGood.set(r.station.id, { ports: r.ports });
	}
	return snapshot;
}

function fallbackPorts() {
	const channels = Array.from({ length: 10 }, (_, i) => String(i).padStart(2, "0"));
	return channels.map((channel) => ({ channel, status: -1 }));
}

const lastGood = new Map();
let cache = { at: 0, snapshot: null };

async function getSnapshot(force = false) {
	const now = Date.now();
	if (!force && cache.snapshot && now - cache.at < CONFIG.upstream.cacheMs) {
		return cache.snapshot;
	}
	const snapshot = await fetchSnapshot();
	cache = { at: Date.now(), snapshot };
	return snapshot;
}

// 后台预热 + 定时刷新（页面上还有请求兜一层，双保险）
getSnapshot().catch((e) => console.warn("预热失败:", e.message));
setInterval(() => {
	getSnapshot(true).catch((e) => console.warn("定时刷新失败:", e.message));
}, CONFIG.upstream.cacheMs).unref();

/* ========== HTTP ========== */
const MIME = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".png": "image/png",
	".woff2": "font/woff2",
};

function send(res, status, body, type) {
	res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
	res.end(body);
}

const json = (res, status, obj) =>
	send(res, status, JSON.stringify(obj), "application/json; charset=utf-8");

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
	const pathname = decodeURIComponent(url.pathname);

	if (pathname === "/api/config") {
		return json(res, 200, { title: CONFIG.title, subtitle: CONFIG.subtitle });
	}

	if (pathname === "/api/status") {
		try {
			const force = url.searchParams.get("force") === "1";
			const snap = await getSnapshot(force);
			return json(res, 200, snap);
		} catch (e) {
			return json(res, 502, { error: e.message, source: "error", stations: [] });
		}
	}

	if (pathname.startsWith("/api/")) {
		return send(res, 404, "404 Not Found", "text/plain; charset=utf-8");
	}

	const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
	const filePath = path.join(PUBLIC_DIR, rel);
	if (!filePath.startsWith(PUBLIC_DIR)) {
		return send(res, 403, "403 Forbidden", "text/plain; charset=utf-8");
	}

	fs.readFile(filePath, (err, data) => {
		if (err) return send(res, 404, "404 Not Found", "text/plain; charset=utf-8");
		send(res, 200, data, MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream");
	});
});

server.on("error", (e) => {
	if (e.code === "EADDRINUSE") {
		console.error(`端口 ${CONFIG.port} 已被占用，可换端口启动：PORT=4175 node server.mjs`);
		process.exit(1);
	}
	console.error(e);
	process.exit(1);
});

server.listen(CONFIG.port, CONFIG.host, () => {
	console.log(`${CONFIG.title} → http://${CONFIG.host}:${CONFIG.port}`);
});
