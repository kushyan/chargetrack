/**
 * Cloudflare Worker：把一充云的上游接口包装成带 CORS 的 JSON，供 GitHub Pages 直接调用。
 *
 * 部署步骤：
 *   1. 打开 https://workers.cloudflare.com/ → Sign up / Log in（免费）
 *   2. Create application → Create Worker → 名字随意（如 chargetrack-api）→ Deploy
 *   3. 点 Edit code，把本文件全部内容粘贴进去 → Save and deploy
 *   4. 复制形如 https://chargetrack-api.<你的子域>.workers.dev 的地址
 *   5. 把它填到 public/js/app.js 顶部的 REMOTE_API 常量里，提交即可
 *
 * 免费额度：每天 10 万次请求，这里每 10 秒才 1 次，完全够用。
 */

const UID = "tSRE_Ki6boBIGPqfXRcfD2xn";
const UPSTREAM = "http://iot.yizhongyun.com/Appapi";
const REFERER = "http://iot.yizhongyun.com/App20260429/";

const STATIONS = [
	{ name: "1号", id: "2022002744" },
	{ name: "2号", id: "2022002731" },
	{ name: "3号", id: "2022002746" },
	{ name: "4号", id: "2022002804" },
	{ name: "5号", id: "2022002756" },
	{ name: "6号", id: "2022002733" },
	{ name: "7号", id: "2022002723" },
	{ name: "8号", id: "2022002738" },
	{ name: "9号", id: "2022002741" },
	{ name: "10号", id: "2022002747" },
	{ name: "11号", id: "2022002735" },
];

// 已知故障端口：上游返回"使用中"，实际不能充电
const FAULT_PORTS = {
	"3号": ["09"],
	"8号": ["09"],
	"10号": ["03"],
};

async function post(path, devId) {
	const res = await fetch(UPSTREAM + path, {
		method: "POST",
		headers: {
			"Content-Type": "application/json;charset=UTF-8",
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
			Origin: new URL(REFERER).origin,
			Referer: REFERER,
		},
		body: JSON.stringify({ dev_id: devId, uid: UID }),
	});
	const json = await res.json();
	if (json.code !== 0) throw new Error(`code=${json.code} ${json.msg || ""}`);
	return json.data;
}

async function buildSnapshot() {
	const results = await Promise.all(
		STATIONS.map(async (station) => {
			try {
				const [op, chk] = await Promise.all([
					post("/chargingOperation", station.id),
					post("/checkDev", station.id),
				]);
				const bad = FAULT_PORTS[station.name] || [];
				const data = (op.socket || []).map((s) => {
					const channel = String(s.channel);
					const status = bad.includes(channel) ? -1 : Number(s.status);
					return { channel, status };
				});
				if (!data.length) throw new Error("无端口数据");
				return { name: station.name, id: station.id, online: Number(chk.is_online) === 1, data, live: true };
			} catch (e) {
				return {
					name: station.name,
					id: station.id,
					online: false,
					data: Array.from({ length: 10 }, (_, i) => ({ channel: String(i).padStart(2, "0"), status: -1 })),
					live: false,
				};
			}
		}),
	);

	const liveCount = results.filter((r) => r.live).length;
	return {
		updatedAt: new Date().toISOString(),
		source: liveCount === results.length ? "live" : liveCount > 0 ? "partial" : "offline",
		stations: results.map(({ live, ...rest }) => rest),
	};
}

export default {
	async fetch(request) {
		const cors = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET,OPTIONS",
			"Access-Control-Max-Age": "86400",
		};

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: cors });
		}

		try {
			const snapshot = await buildSnapshot();
			return new Response(JSON.stringify(snapshot), {
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "no-store",
					...cors,
				},
			});
		} catch (e) {
			return new Response(JSON.stringify({ error: String(e && e.message), source: "error", stations: [] }), {
				status: 502,
				headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
			});
		}
	},
};
