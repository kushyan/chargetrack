/**
 * 站点与上游配置（server.mjs 与 scripts/fetch-data.mjs 共用）
 */
export const CONFIG = {
	port: Number(process.env.PORT) || 4175,
	host: process.env.HOST || "127.0.0.1",

	title: "信息工程院充电桩",
	subtitle: "端口空闲状态 · 每 10 秒自动刷新",

	// 上游充电桩平台（一充云）
	upstream: {
		base: "http://iot.yizhongyun.com/Appapi",
		uid: "tSRE_Ki6boBIGPqfXRcfD2xn",
		referer: "http://iot.yizhongyun.com/App20260429/",
		timeoutMs: 8000,
		// 本地服务对上游结果的缓存时间
		cacheMs: 5000,
	},

	// 站点顺序 = 页面顺序
	stations: [
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
	],

	/**
	 * 已知故障端口：上游仍返回"使用中(0)"，但实际坏了、无法充电。
	 * 这里登记后会强制标成故障 -1（琥珀色），页面上与其他端口区分开。
	 * 端口修好后把对应一行删掉即可。
	 */
	faultPorts: [
		{ station: "3号", channel: "09" },
		{ station: "8号", channel: "09" },
		{ station: "10号", channel: "03" },
	],
};

/** 把 faultPorts 覆盖到某个站点的端口数组上（server 与 Actions 脚本共用） */
export function applyFaultOverrides(stationName, ports) {
	const bad = CONFIG.faultPorts
		.filter((f) => f.station === stationName)
		.map((f) => String(f.channel).padStart(2, "0"));

	if (!bad.length) return ports;

	return ports.map((p) =>
		bad.includes(String(p.channel).padStart(2, "0")) ? { ...p, status: -1 } : p,
	);
}
