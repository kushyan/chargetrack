"use strict";
/* ===== 可配置参数 ===== */
const EXTRA_SCROLL_PX = 20;
const SCROLL_SPEED_PX_PER_SEC = 50;
const PAUSE_BEFORE_SCROLL_MS = 1000;
const PAUSE_AFTER_SCROLL_MS = 1000;
const PAUSE_NO_SCROLL_MS = 3500;
const VERTICAL_ANIM_DURATION_MS = 350;
/* ==================== */

function initBanner(items) {
	const bannerText = document.getElementById("banner-text");
	if (!items || items.length === 0) return;

	bannerText.innerHTML = `<div class="banner-text-inner"></div>`;
	const inner = bannerText.querySelector(".banner-text-inner");

	items.forEach((item) => {
		const div = document.createElement("div");
		div.className = "banner-text-item";
		div.innerHTML = item;
		inner.appendChild(div);
	});

	// 复制第一项实现无缝循环
	const firstItem = inner.querySelector(".banner-text-item");
	if (firstItem) {
		const clone = firstItem.cloneNode(true);
		clone.className = "banner-text-item";
		inner.appendChild(clone);
	}

	const totalItems = inner.children.length;
	let currentIndex = 0;
	let isAnimating = false;

	function clearAnimation(item) {
		if (item.classList.contains("scrolling")) {
			item.classList.remove("scrolling");
			item.style.animationDuration = "";
			void item.offsetWidth;
		}
	}

	function doScroll(item) {
		return new Promise((resolve) => {
			const overflow = item.scrollWidth - item.offsetWidth;
			if (overflow <= 0) {
				resolve();
				return;
			}
			const scrollDistance = overflow + EXTRA_SCROLL_PX;
			const duration = scrollDistance / SCROLL_SPEED_PX_PER_SEC;
			item.style.setProperty("--scroll-distance", `-${scrollDistance}px`);
			item.style.animationDuration = `${duration}s`;
			item.classList.add("scrolling");

			function onAnimationEnd() {
				item.removeEventListener("animationend", onAnimationEnd);
				resolve();
			}
			item.addEventListener("animationend", onAnimationEnd);
		});
	}

	async function showNext() {
		if (isAnimating) return;
		isAnimating = true;

		if (currentIndex === totalItems - 1) {
			inner.style.transition = "none";
			inner.style.transform = "translateY(0)";
			currentIndex = 0; // 逻辑上也回到第 0 项
			void inner.offsetHeight; // 强制重绘，确保无动画生效
			inner.style.transition = ""; // 清空以便后续切换可重新附上过渡
		}

		currentIndex = (currentIndex + 1) % totalItems;
		const offset = 100 / totalItems;

		const currentItem = inner.children[currentIndex];

		clearAnimation(currentItem);

		inner.style.transition = "transform 0.35s ease-in-out";
		inner.style.transform = `translateY(-${currentIndex * offset}%)`;

		await new Promise((r) => setTimeout(r, VERTICAL_ANIM_DURATION_MS));

		if (currentItem.scrollWidth > currentItem.offsetWidth) {
			await new Promise((r) => setTimeout(r, PAUSE_BEFORE_SCROLL_MS));
			await doScroll(currentItem);
			await new Promise((r) => setTimeout(r, PAUSE_AFTER_SCROLL_MS));
		} else {
			await new Promise((r) => setTimeout(r, PAUSE_NO_SCROLL_MS));
		}

		isAnimating = false;
		showNext();
	}

	(async () => {
		const currentItem = inner.children[0];
		if (currentItem.scrollWidth > currentItem.offsetWidth) {
			await new Promise((r) => setTimeout(r, PAUSE_BEFORE_SCROLL_MS));
			await doScroll(currentItem);
			await new Promise((r) => setTimeout(r, PAUSE_AFTER_SCROLL_MS));
		} else {
			await new Promise((r) => setTimeout(r, PAUSE_NO_SCROLL_MS));
		}

		showNext();
	})();
}

(function initBannerFromApi() {
	fetchWithRetry("/api/info")
		.then((res) => res.text())
		.then((text) => {
			const items = text.split("|").filter(Boolean);
			initBanner(items);
		})
		.catch(() => {});
})();
