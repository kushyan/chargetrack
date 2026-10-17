/**
 * 拉取上游充电桩状态，生成静态快照 public/data.json
 * 供 GitHub Actions 定时任务使用（GitHub Pages 纯静态托管，无法直连上游）。
 *
 * 用法：node scripts/fetch-data.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, applyFaultOverrides } from "../config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "data.json");

async function upstreamPost(apiPath, devId) {
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
			body: JSON.stringify({ dev_id: devId, uid }),
			signal: ac.signal,
		});
		const json = JSON.parse(await res.text());
		if (json.code !== 0) throw new Error(`code=${json.code} ${json.msg || ""}`);
		return json.data;
	} finally {
		clearTimeout(timer);
	}
}

const previous = (() => {
	try {
		return JSON.parse(fs.readFileSync(OUT, "utf8"));
	} catch (_) {
		return null;
	}
})();

const prevById = new Map((previous?.stations || []).map((s) => [s.id, s]));

const results = await Promise.all(
	CONFIG.stations.map(async (station) => {
		try {
			const [op, chk] = await Promise.all([
				upstreamPost("/chargingOperation", station.id),
				upstreamPost("/checkDev", station.id),
			]);
			const data = applyFaultOverrides(
				station.name,
				(op.socket || []).map((s) => ({
					channel: String(s.channel),
					status: Number(s.status),
				})),
			);
			if (!data.length) throw new Error("无端口数据");
			return { name: station.name, id: station.id, online: Number(chk.is_online) === 1, data, live: true };
		} catch (e) {
			const prev = prevById.get(station.id);
			return {
				name: station.name,
				id: station.id,
				online: false,
				data: prev ? prev.data : Array.from({ length: 10 }, (_, i) => ({ channel: String(i).padStart(2, "0"), status: -1 })),
				live: false,
				error: e.message,
			};
		}
	}),
);

const liveCount = results.filter((r) => r.live).length;
const snapshot = {
	updatedAt: new Date().toISOString(),
	source: liveCount === results.length ? "live" : liveCount > 0 ? "partial" : "offline",
	stations: results.map(({ live, error, ...rest }) => (error ? { ...rest, error } : rest)),
};

fs.writeFileSync(OUT, `${JSON.stringify(snapshot, null, "\t")}\n`, "utf8");

const free = snapshot.stations.reduce((n, s) => n + s.data.filter((d) => d.status === 1).length, 0);
console.log(`已写入 ${path.relative(process.cwd(), OUT)} | source=${snapshot.source} | 空闲端口=${free}`);
