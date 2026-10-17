"use strict";

renderSkeletons();
initHeader();

async function fetchWithRetry(url, options = {}, retries = 3, delay = 500) {
	let error = "";
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			const response = await fetch(url, options);
			if (response.ok) return response;
			else error = `${response.status} ${response.statusText || ""}`;
		} catch (_) {
			error = "网络错误";
		}
		if (attempt < retries) {
			await new Promise((resolve) => setTimeout(resolve, delay));
		} else break;
	}
	throw `请求失败 ${error}`;
}

function renderSkeletons(count = 11) {
	const main = document.getElementById("main");
	main.innerHTML = new Array(count).fill((i) => `
        <div class="charging-station" style="animation-delay: ${i * 0.05}s">
            <div class="station-header skeleton-card">
                <div class="station-number"></div>
            </div>
            <div class="charging-points">
                ${
		new Array(10).fill('<div class="point skeleton-card"></div>').join("")
	}
            </div>
        </div>
    `).map((fn, i) => fn(i)).join("");
}

function initHeader() {
	const headerName = document.getElementById("name");
	const headerTitle = document.querySelector(".header-title");

	function updateNameWidth() {
		headerTitle.style.setProperty(
			"--name-width",
			headerName.offsetWidth + "px",
		);
	}
	new ResizeObserver(updateNameWidth).observe(headerName);

	fetchWithRetry("/api/name")
		.then((res) => res.text())
		.then(async (name) => {
			if (!name) return;
			const loadTime = performance.now();
			const show_after_ms = 2333;
			if (loadTime < show_after_ms) {
				await new Promise((r) =>
					setTimeout(r, show_after_ms - loadTime)
				);
			}
			headerName.textContent = name;
			updateNameWidth();

			const suffix = document.querySelector(".suffix");
			suffix.classList.add("animated");

			setTimeout(() => {
				headerName.classList.add("animated");
			}, 500);

			document.title = name + document.title;
		})
		.catch(() => {});
}
