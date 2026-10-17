"use strict";

const lightTheme = {
	"--bg": "#f5f5f0",
	"--card-border": "#d0d0d0",
	"--text": "#1a1a1a",
	"--text-muted": "#6a6a6a",
	"--skeleton": "#d0d0d0",
	"--email": "#e07020",

	/* Available state - teal family */
	"--available": "#00897b",
	"--station-header-bg": "rgba(77, 182, 172, 0.12)",
	"--station-header-border": "rgba(77, 182, 172, 0.3)",
	"--available-bg": "rgba(77, 182, 172, 0.2)",
	"--available-border": "rgba(77, 182, 172, 0.4)",
	"--available-bg-flash": "rgba(77, 182, 172, 0.6)",

	/* Occupied state - red family */
	"--occupied": "#c62828",
	"--occupied-bg": "rgba(229, 115, 115, 0.2)",
	"--occupied-border": "rgba(229, 115, 115, 0.4)",
	"--occupied-bg-flash": "rgba(229, 115, 115, 0.6)",
};

let isDark = true;

(function initTheme() {
	const themeToggle = document.getElementById("theme-toggle");
	const root = document.documentElement;

	if (localStorage.getItem("isDark") === "false") {
		isDark = false;
		setTheme(isDark);
	}

	function setTheme(isDark) {
		if (isDark) {
			Object.keys(lightTheme).forEach((k) =>
				root.style.removeProperty(k)
			);
		} else {
			Object.entries(lightTheme).forEach(([k, v]) =>
				root.style.setProperty(k, v)
			);
		}

		themeToggle.textContent = isDark ? "🌙" : "☀️";
		localStorage.setItem("isDark", isDark);
	}

	themeToggle.addEventListener("click", () => {
		isDark = !isDark;
		setTheme(isDark);
	});
})();
