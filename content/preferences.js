window.ZoteroWallpaper_Preferences = {
	strings: {
		en: {
			general: "General",
			language: "Language",
			wallpaper: "Wallpaper",
			enable: "Enable wallpaper",
			enableHint: "Cover the collections, item list, and item details panes.",
			source: "Image source",
			pickSingle: "Choose image",
			pickFolder: "Choose folder",
			next: "Choose another",
			display: "Display",
			opacity: "Opacity",
			alignment: "Alignment",
			cover: "Cover",
			coverHint: "Fill the area and crop if needed",
			contain: "Contain",
			containHint: "Show the full image with possible gaps",
			center: "Center",
			centerHint: "Keep the original image size",
			stretch: "Stretch",
			stretchHint: "Force the image to fit the area",
			rotation: "Random rotation",
			interval: "Change interval",
			startupOnly: "Randomize on startup only",
			minutes5: "Every 5 minutes",
			minutes10: "Every 10 minutes",
			minutes15: "Every 15 minutes",
			minutes30: "Every 30 minutes",
			rotationHint: "Folder mode chooses a random wallpaper on startup and avoids immediate repeats when possible.",
			singleImage: "Single image",
			folder: "Folder",
			image: "image",
			images: "images",
			noWallpaper: "No wallpaper loaded",
			choosePath: "Choose an image or folder",
		},
		"zh-CN": {
			general: "通用",
			language: "语言",
			wallpaper: "壁纸",
			enable: "启用背景壁纸",
			enableHint: "覆盖文献库的分类、条目列表和条目详情区域。",
			source: "图片来源",
			pickSingle: "选择单张图片",
			pickFolder: "选择壁纸文件夹",
			next: "随机换一张",
			display: "显示方式",
			opacity: "透明度",
			alignment: "对齐方式",
			cover: "覆盖",
			coverHint: "铺满区域，可能裁切",
			contain: "填充",
			containHint: "完整显示，可能留边",
			center: "居中",
			centerHint: "保持图片原始大小",
			stretch: "拉伸",
			stretchHint: "强制匹配整个区域",
			rotation: "随机切换",
			interval: "切换间隔",
			startupOnly: "仅在每次启动时随机",
			minutes5: "每 5 分钟",
			minutes10: "每 10 分钟",
			minutes15: "每 15 分钟",
			minutes30: "每 30 分钟",
			rotationHint: "文件夹模式下，每次启动都会随机选择一张；定时切换会尽量避免连续显示同一张。",
			singleImage: "单张图片",
			folder: "文件夹",
			image: "张",
			images: "张",
			noWallpaper: "未加载壁纸",
			choosePath: "请选择图片或文件夹",
		},
	},

	get api() {
		return Zotero.Wallpaper;
	},

	get languageCode() {
		let language = this.api.get("language", "en");
		return this.strings[language] ? language : "en";
	},

	get text() {
		return this.strings[this.languageCode];
	},

	init() {
		this.language = document.getElementById("zw-pref-language");
		this.enabled = document.getElementById("zw-pref-enabled");
		this.opacity = document.getElementById("zw-pref-opacity");
		this.opacityValue = document.getElementById("zw-pref-opacity-value");
		this.interval = document.getElementById("zw-pref-interval");

		this.language.value = this.languageCode;
		this.enabled.checked = this.api.get("enabled", true);
		this.opacity.value = this.api.get("opacity", 30);
		this.interval.value = String(this.api.get("interval", 0));
		document.querySelector(`input[name="zw-pref-fit"][value="${this.api.get("fit", "cover")}"]`).checked = true;

		this.language.addEventListener("change", () => {
			this.api.set("language", this.language.value);
			this.applyLanguage();
			this.render();
		});
		this.enabled.addEventListener("change", () => this.save("enabled", this.enabled.checked));
		this.opacity.addEventListener("input", () => {
			this.opacityValue.value = `${this.opacity.value}%`;
			if (this.opacityFrame) return;
			this.opacityFrame = window.requestAnimationFrame(() => {
				this.opacityFrame = 0;
				this.save("opacity", Number(this.opacity.value));
			});
		});
		this.interval.addEventListener("change", () => this.save("interval", Number(this.interval.value)));
		for (let radio of document.querySelectorAll('input[name="zw-pref-fit"]')) {
			radio.addEventListener("change", () => radio.checked && this.save("fit", radio.value));
		}
		document.getElementById("zw-pref-pick-single").addEventListener("click", async () => {
			if (await this.api.chooseSingle(window)) this.render();
		});
		document.getElementById("zw-pref-pick-folder").addEventListener("click", async () => {
			if (await this.api.chooseFolder(window)) this.render();
		});
		document.getElementById("zw-pref-next").addEventListener("click", () => {
			this.api.next();
			this.render();
		});

		this.opacityValue.value = `${this.opacity.value}%`;
		this.applyLanguage();
		this.render();
	},

	applyLanguage() {
		document.documentElement.setAttribute("lang", this.languageCode);
		for (let element of document.querySelectorAll("[data-i18n]")) {
			element.textContent = this.text[element.dataset.i18n];
		}
		for (let element of document.querySelectorAll("[data-i18n-aria-label]")) {
			element.setAttribute("aria-label", this.text[element.dataset.i18nAriaLabel]);
		}
	},

	save(name, value) {
		this.api.set(name, value);
		if (name === "interval") {
			this.api.resetTimer();
			return;
		}
		this.api.refresh({
			repick: name === "enabled",
			readers: name === "enabled" || name === "opacity",
			timer: name === "enabled",
		});
	},

	render() {
		let source = this.api.get("source", "single");
		let status = this.api.status();
		let path = this.api.get(source === "folder" ? "folderPath" : "singlePath", "");
		let countLabel = this.languageCode === "zh-CN"
			? `${this.text.folder} · ${status.count} ${this.text.images}`
			: `${this.text.folder} · ${status.count} ${status.count === 1 ? this.text.image : this.text.images}`;
		document.getElementById("zw-pref-source-badge").textContent = source === "folder" ? countLabel : this.text.singleImage;
		document.getElementById("zw-pref-current").textContent = status.currentName || this.text.noWallpaper;
		document.getElementById("zw-pref-path").textContent = path || this.text.choosePath;
		document.getElementById("zw-pref-next").disabled = status.count < 2;
	},
};
