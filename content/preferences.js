window.ZoteroWallpaper_Preferences = {
	strings: {
		en: {
			general: "General",
			language: "Language",
			wallpaper: "Wallpaper",
			enable: "Enable wallpaper",
			enableHint: "Cover the collections, item list, and item details panes.",
			source: "Image source",
			wallpaperFor: "Wallpaper for",
			bothModes: "Both modes",
			lightMode: "Light mode",
			darkMode: "Dark mode",
			pickSingle: "Choose image",
			pickFolder: "Choose folder",
			next: "Choose another",
			display: "Display",
			opacity: "Opacity",
			imageBaseColors: "Image base colors",
			imageBaseColorsHint: "Shown behind transparent pixels in PNG and GIF images.",
			singleAdjustments: "Single image adjustments",
			singleAdjustmentsHint: "Size and position refine the selected alignment.",
			size: "Size",
			horizontalPosition: "Horizontal position",
			verticalPosition: "Vertical position",
			reset: "Reset",
			alignment: "Alignment",
			cover: "Cover",
			coverHint: "Fill the area and crop",
			contain: "Contain",
			containHint: "Show the full image",
			center: "Center",
			centerHint: "Keep original image size",
			stretch: "Stretch",
			stretchHint: "Force the image to fit",
			rotation: "Random rotation",
			interval: "Change interval",
			startupOnly: "Randomize on startup only",
			minutes5: "Every 5 minutes",
			minutes10: "Every 10 minutes",
			minutes15: "Every 15 minutes",
			minutes30: "Every 30 minutes",
			rotationHint: "Folder mode shuffles every image once before starting a new round.",
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
			wallpaperFor: "壁纸适用于",
			bothModes: "两种模式",
			lightMode: "白天模式",
			darkMode: "夜间模式",
			pickSingle: "选择单张图片",
			pickFolder: "选择壁纸文件夹",
			next: "随机换一张",
			display: "显示方式",
			opacity: "透明度",
			imageBaseColors: "图片底色",
			imageBaseColorsHint: "显示在 PNG 和 GIF 图片的透明像素下方。",
			singleAdjustments: "单图调整",
			singleAdjustmentsHint: "尺寸和位置在所选的对齐方式上微调。",
			size: "大小",
			horizontalPosition: "水平位置",
			verticalPosition: "垂直位置",
			reset: "复位",
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
			rotationHint: "文件夹模式会将全部图片无重复播放一轮，再开始下一轮洗牌。",
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
		this.wallpaperTheme = document.getElementById("zw-pref-theme");
		this.enabled = document.getElementById("zw-pref-enabled");
		this.opacity = document.getElementById("zw-pref-opacity");
		this.opacityValue = document.getElementById("zw-pref-opacity-value");
		for (let theme of ["light", "dark"]) {
			let color = document.getElementById(`zw-pref-${theme}-base-color`);
			let output = document.getElementById(`zw-pref-${theme}-base-value`);
			color.value = this.api.get(`${theme}BaseColor`, theme === "dark" ? "#1e1e1e" : "#f4f4f4");
			output.value = color.value.toUpperCase();
			color.addEventListener("input", () => output.value = color.value.toUpperCase());
			color.addEventListener("change", () => this.save(`${theme}BaseColor`, color.value));
		}
		this.singleAdjustments = document.getElementById("zw-pref-single-adjustments");
		this.singleScale = document.getElementById("zw-pref-single-scale");
		this.singlePositionX = document.getElementById("zw-pref-single-position-x");
		this.singlePositionY = document.getElementById("zw-pref-single-position-y");
		this.interval = document.getElementById("zw-pref-interval");

		this.language.value = this.languageCode;
		this.wallpaperTheme.value = this.api.currentTheme;
		this.enabled.checked = this.api.get("enabled", true);
		this.opacity.value = this.api.get("opacity", 30);
		this.singleScale.value = this.api.get("singleScale", 100);
		this.singlePositionX.value = this.api.get("singlePositionX", 50);
		this.singlePositionY.value = this.api.get("singlePositionY", 50);
		this.interval.value = String(this.api.get("interval", 0));
		document.querySelector(`input[name="zw-pref-fit"][value="${this.api.get("fit", "cover")}"]`).checked = true;

		this.language.addEventListener("change", () => {
			this.api.set("language", this.language.value);
			this.applyLanguage();
			this.render();
		});
		this.wallpaperTheme.addEventListener("change", () => this.render());
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
		for (let [control, pref] of [
			[this.singleScale, "singleScale"],
			[this.singlePositionX, "singlePositionX"],
			[this.singlePositionY, "singlePositionY"],
		]) {
			control.addEventListener("input", () => {
				this.updateSingleOutputs();
				this.previewSingleLayout();
			});
			control.addEventListener("change", () => this.api.set(pref, Number(control.value)));
		}
		document.getElementById("zw-pref-single-reset").addEventListener("click", () => {
			for (let [control, pref, value] of [
				[this.singleScale, "singleScale", 100],
				[this.singlePositionX, "singlePositionX", 50],
				[this.singlePositionY, "singlePositionY", 50],
			]) {
				control.value = value;
				this.api.set(pref, value);
			}
			this.updateSingleOutputs();
			this.previewSingleLayout();
		});
		for (let radio of document.querySelectorAll('input[name="zw-pref-fit"]')) {
			radio.addEventListener("change", () => radio.checked && this.save("fit", radio.value));
		}
		document.getElementById("zw-pref-pick-single").addEventListener("click", async () => {
			if (await this.api.chooseSingle(window, this.wallpaperTheme.value)) this.render();
		});
		document.getElementById("zw-pref-pick-folder").addEventListener("click", async () => {
			if (await this.api.chooseFolder(window, this.wallpaperTheme.value)) this.render();
		});
		document.getElementById("zw-pref-next").addEventListener("click", () => {
			this.api.next(this.wallpaperTheme.value);
			this.render();
		});

		this.opacityValue.value = `${this.opacity.value}%`;
		this.updateSingleOutputs();
		this.applyLanguage();
		this.render();
	},

	updateSingleOutputs() {
		for (let name of ["singleScale", "singlePositionX", "singlePositionY"]) {
			document.getElementById(`zw-pref-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}-value`).value = `${this[name].value}%`;
		}
	},

	previewSingleLayout() {
		if (this.singleLayoutFrame) return;
		this.singleLayoutFrame = window.requestAnimationFrame(() => {
			this.singleLayoutFrame = 0;
			this.api.previewSingleLayout(
				Number(this.singleScale.value),
				Number(this.singlePositionX.value),
				Number(this.singlePositionY.value),
			);
		});
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
		let theme = this.wallpaperTheme.value;
		let shownTheme = theme === "both" ? this.api.currentTheme : theme;
		let source = this.api.getThemeSource(shownTheme);
		this.singleAdjustments.hidden = source !== "single";
		let status = this.api.status(shownTheme);
		let path = this.api.getThemePath(shownTheme, source);
		let countLabel = this.languageCode === "zh-CN"
			? `${this.text.folder} · ${status.count} ${this.text.images}`
			: `${this.text.folder} · ${status.count} ${status.count === 1 ? this.text.image : this.text.images}`;
		document.getElementById("zw-pref-source-badge").textContent = source === "folder" ? countLabel : this.text.singleImage;
		document.getElementById("zw-pref-current").textContent = status.currentName || this.text.noWallpaper;
		document.getElementById("zw-pref-path").textContent = path || this.text.choosePath;
		document.getElementById("zw-pref-next").disabled = status.count < 2;
	},
};
