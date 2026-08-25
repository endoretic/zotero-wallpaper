var ZoteroWallpaper = {
	PREF: "extensions.zotero-wallpaper.",
	IMAGE_RE: /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i,
	currentPath: "",
	timer: null,

	async startup() {
		this.pickRandom();
		for (let win of Zotero.getMainWindows()) this.attach(win);
		this.resetTimer();
	},

	async shutdown() {
		this.stopTimer();
		for (let win of Zotero.getMainWindows()) this.detach(win);
	},

	get(name, fallback) {
		let value = Zotero.Prefs.get(this.PREF + name, true);
		return value === undefined ? fallback : value;
	},

	set(name, value) {
		Zotero.Prefs.set(this.PREF + name, value, true);
	},

	getImages() {
		let source = this.get("source", "single");
		let path = this.get(source === "folder" ? "folderPath" : "singlePath", "");
		if (!path) return [];
		if (source === "single") return this.IMAGE_RE.test(path) && this.isFile(path) ? [path] : [];

		try {
			let dir = this.file(path);
			if (!dir.exists() || !dir.isDirectory()) return [];
			let images = [];
			let entries = dir.directoryEntries;
			while (entries.hasMoreElements()) {
				let entry = entries.getNext().QueryInterface(Ci.nsIFile);
				if (entry.isFile() && this.IMAGE_RE.test(entry.leafName)) images.push(entry.path);
			}
			return images.sort((a, b) => a.localeCompare(b));
		}
		catch (error) {
			Zotero.logError(error);
			return [];
		}
	},

	file(path) {
		let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
		file.initWithPath(path);
		return file;
	},

	isFile(path) {
		try {
			let file = this.file(path);
			return file.exists() && file.isFile();
		}
		catch (_) {
			return false;
		}
	},

	pickRandom() {
		let images = this.getImages();
		if (!images.length) {
			this.currentPath = "";
			return "";
		}
		let choices = images.length > 1 ? images.filter(path => path !== this.currentPath) : images;
		this.currentPath = choices[Math.floor(Math.random() * choices.length)];
		return this.currentPath;
	},

	next() {
		this.pickRandom();
		this.apply();
		return this.status();
	},

	refresh({ repick = false } = {}) {
		if (repick || !this.isFile(this.currentPath) || !this.getImages().includes(this.currentPath)) {
			this.pickRandom();
		}
		this.apply();
		this.resetTimer();
		return this.status();
	},

	status() {
		let images = this.getImages();
		return {
			count: images.length,
			currentPath: this.currentPath,
			currentName: this.currentPath ? this.file(this.currentPath).leafName : "",
		};
	},

	attach(win) {
		let doc = win.document;
		let pane = doc.getElementById("zotero-pane");
		if (!pane || doc.getElementById("zotero-wallpaper-layer")) return;

		let layer = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
		layer.id = "zotero-wallpaper-layer";
		pane.prepend(layer);

		let style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
		style.id = "zotero-wallpaper-style";
		style.textContent = this.css;
		doc.documentElement.append(style);
		this.applyToWindow(win);
	},

	detach(win) {
		win.document.getElementById("zotero-wallpaper-layer")?.remove();
		win.document.getElementById("zotero-wallpaper-style")?.remove();
	},

	apply() {
		for (let win of Zotero.getMainWindows()) {
			this.attach(win);
			this.applyToWindow(win);
		}
	},

	applyToWindow(win) {
		let layer = win.document.getElementById("zotero-wallpaper-layer");
		if (!layer) return;
		let enabled = this.get("enabled", true) && this.isFile(this.currentPath);
		layer.hidden = !enabled;
		if (!enabled) return;

		let uri = Services.io.newFileURI(this.file(this.currentPath)).spec;
		let fit = this.get("fit", "cover");
		let layout = {
			cover: ["cover", "center", "no-repeat"],
			contain: ["contain", "center", "no-repeat"],
			center: ["auto", "center", "no-repeat"],
			stretch: ["100% 100%", "center", "no-repeat"],
		}[fit] || ["cover", "center", "no-repeat"];

		layer.style.backgroundImage = `url("${uri}")`;
		layer.style.backgroundSize = layout[0];
		layer.style.backgroundPosition = layout[1];
		layer.style.backgroundRepeat = layout[2];
		layer.style.opacity = Math.min(100, Math.max(0, Number(this.get("opacity", 30)))) / 100;
	},

	resetTimer() {
		this.stopTimer();
		let minutes = Number(this.get("interval", 0));
		if (!this.get("enabled", true) || ![5, 10, 15, 30].includes(minutes)) return;
		this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
		this.timer.initWithCallback(() => this.next(), minutes * 60 * 1000, Ci.nsITimer.TYPE_REPEATING_SLACK);
	},

	stopTimer() {
		this.timer?.cancel();
		this.timer = null;
	},

	async chooseSingle(parentWindow) {
		let { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
		let picker = new FilePicker();
		picker.init(parentWindow, "选择一张壁纸", picker.modeOpen);
		picker.appendFilter("图片", "*.avif; *.bmp; *.gif; *.jpg; *.jpeg; *.png; *.webp");
		if (await picker.show() !== picker.returnOK) return null;
		this.set("source", "single");
		this.set("singlePath", picker.file);
		return this.refresh({ repick: true });
	},

	async chooseFolder(parentWindow) {
		let { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
		let picker = new FilePicker();
		picker.init(parentWindow, "选择壁纸文件夹", picker.modeGetFolder);
		if (await picker.show() !== picker.returnOK) return null;
		this.set("source", "folder");
		this.set("folderPath", picker.file);
		return this.refresh({ repick: true });
	},

	css: `
#zotero-pane {
	position: relative !important;
	isolation: isolate;
}
#zotero-wallpaper-layer {
	position: absolute;
	inset: 0;
	z-index: 0;
	pointer-events: none;
	background-color: var(--material-background, #fff);
}
#zotero-pane > :not(#zotero-wallpaper-layer) {
	position: relative;
	z-index: 1;
}
#zotero-pane #zotero-trees,
#zotero-pane #zotero-layout-switcher,
#zotero-pane #zotero-collections-pane,
#zotero-pane #zotero-collections-tree-container,
#zotero-pane #zotero-tag-selector-container,
#zotero-pane #zotero-items-pane-container,
#zotero-pane #zotero-items-pane,
#zotero-pane #zotero-items-tree,
#zotero-pane #zotero-item-pane,
#zotero-pane #zotero-item-pane-content,
#zotero-pane .virtualized-table-container,
#zotero-pane .virtualized-table,
#zotero-pane .virtualized-table-header,
#zotero-pane .virtualized-table-header .cell,
#zotero-pane .virtualized-table .body,
#zotero-pane .item-pane-content,
#zotero-pane .zotero-view-item-main,
#zotero-pane item-details {
	background-color: transparent !important;
	background-image: none !important;
}
#zotero-pane .virtualized-table .row:not(.selected):not(:hover),
#zotero-pane .virtualized-table .row:not(.selected):not(:hover) .cell {
	background-color: transparent !important;
}
#zotero-pane .zotero-toolbar {
	background-color: rgba(248, 248, 250, .78) !important;
	backdrop-filter: blur(10px);
}
@media (prefers-color-scheme: dark) {
	#zotero-pane .zotero-toolbar {
		background-color: rgba(36, 36, 39, .78) !important;
	}
}
`,
};
