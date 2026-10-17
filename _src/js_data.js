"use strict";
async function getStationsInfo() {
	const res = await fetchWithRetry("/api/stations");
	return await res.json();
}

// Hydrate skeleton cards in-place with real data
(async function hydrateSkeletons() {
	const stations = await getStationsInfo();
	const main = document.getElementById("main");
	const cards = main.children;

	stations.forEach((station, si) => {
		const card = cards[si];
		if (!card) return;

		// Update station name
		const nameEl = card.querySelector(".station-number");
		if (nameEl) {
			nameEl.parentElement.classList.remove("skeleton-card");
			nameEl.textContent = station.name;
		}

		const points = card.querySelectorAll(".point");
		points.forEach((point, pi) => {
			const socket = station.data[pi];
			if (!socket) return;

			point.style.opacity = "1";
			const delay = (si * 10 + pi) * 10;
			setTimeout(() => {
				point.classList.remove("skeleton-card");
				point.style.opacity = "0";
				point.textContent = socket.channel;
				let newStatus;
				if (socket.status === -1) {
					newStatus = "fault";
				} else {
					newStatus = socket.status ? "available" : "occupied";
				}
				point.classList.add(
					newStatus,
					newStatus === "available" ? "flash-available" : (newStatus === "fault" ? "flash-fault" : "flash-occupied"),
				);
				requestAnimationFrame(() => {
					point.style.opacity = "1";
				});
			}, delay);
		});
	});
})().then(() => {
  setTimeout(refreshAndLoop, 10000);
});

async function refreshAndLoop() {
  const start = Date.now();
  await refreshStations();
  const elapsed = Date.now() - start;
  const delay = Math.max(0, 10000 - elapsed);
  setTimeout(refreshAndLoop, delay);
}

// In-place update: diff against existing DOM, update only changed points
async function refreshStations() {
	const stations = await getStationsInfo();
	const main = document.getElementById("main");

	stations.forEach((station, si) => {
		const card = main.children[si];
		if (!card) return;

		const points = card.querySelectorAll(".point");

		points.forEach((point, pi) => {
			let newStatus;
			if (station.data[pi].status === -1) {
				newStatus = "fault";
			} else {
				newStatus = station.data[pi].status ? "available" : "occupied";
			}
			let oldStatus = null;
			if (point.classList.contains("available")) {
				oldStatus = "available";
			} else if (point.classList.contains("occupied")) {
				oldStatus = "occupied";
			} else if (point.classList.contains("fault")) {
				oldStatus = "fault";
			}

			if (newStatus !== oldStatus) {
				point.classList.remove(
					"available",
					"occupied",
					"fault",
					"flash-available",
					"flash-occupied",
					"flash-fault",
				);
				void point.offsetWidth;
				point.classList.add(
					newStatus,
					newStatus === "available" ? "flash-available" : (newStatus === "fault" ? "flash-fault" : "flash-occupied"),
				);
			}
		});
	});
}

