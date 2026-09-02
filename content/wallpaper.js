var ZoteroWallpaper = {
	PREF: "extensions.zotero-wallpaper.",
	IMAGE_RE: /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i,
	currentTheme: "light",
	currentPaths: { light: "", dark: "" },
	shuffleBags: new Map(),
	themeWatchers: new Map(),
	timer: null,
	readerStates: new Map(),
	readerHandler: null,
	pluginID: "zotero-wallpaper@endoretic.github.io",

	async startup(pluginID = this.pluginID) {
		this.pluginID = pluginID;
		this.debug(`startup ${pluginID}`);
		this.currentTheme = this.detectTheme(Zotero.getMainWindows()[0]);
		this.pickRandom(this.currentTheme);
		this.debug(`selected ${this.getCurrentPath() || "no image"}`);
		for (let win of Zotero.getMainWindows()) this.attach(win);
		this.registerReaderIntegration();
		this.resetTimer();
	},

	async shutdown() {
		this.stopTimer();
		this.unregisterReaderIntegration();
		for (let reader of Array.from(this.readerStates.keys())) this.cleanupReader(reader);
		for (let win of Zotero.getMainWindows()) this.detach(win);
		this.shuffleBags.clear();
	},

	get(name, fallback) {
		let value = Zotero.Prefs.get(this.PREF + name, true);
		return value === undefined ? fallback : value;
	},

	debug(message) {
		try {
			Zotero.debug(`[Zotero Wallpaper] ${message}`);
			Services.console.logStringMessage(`[Zotero Wallpaper] ${message}`);
		}
		catch (_) {}
	},

	reportError(context, error) {
		let actualError = error instanceof Error ? error : new Error(`${context}: ${String(error)}`);
		let message = `${context}: ${actualError}\n${actualError.stack || ""}`;
		Zotero.logError(actualError);
		this.debug(message);
	},

	set(name, value) {
		Zotero.Prefs.set(this.PREF + name, value, true);
	},

	text(english, chinese) {
		return this.get("language", "en") === "zh-CN" ? chinese : english;
	},

	getThemeSource(theme = this.currentTheme) {
		return this.get(`${theme}Source`, this.get("source", "single"));
	},

	getThemePath(theme = this.currentTheme, source = this.getThemeSource(theme)) {
		let name = source === "folder" ? "folderPath" : "singlePath";
		return this.get(`${theme}${name[0].toUpperCase()}${name.slice(1)}`, this.get(name, ""));
	},

	getCurrentPath(theme = this.currentTheme) {
		return this.currentPaths[theme] || "";
	},

	getBaseColor(theme = this.currentTheme) {
		let fallback = theme === "dark" ? "#1e1e1e" : "#f4f4f4";
		let color = this.get(`${theme}BaseColor`, fallback);
		return /^#[\da-f]{6}$/i.test(color) ? color : fallback;
	},

	getImages(theme = this.currentTheme) {
		let source = this.getThemeSource(theme);
		let path = this.getThemePath(theme, source);
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

	pickRandom(theme = this.currentTheme) {
		let images = this.getImages(theme);
		if (!images.length) {
			this.currentPaths[theme] = "";
			return "";
		}
		if (this.getThemeSource(theme) === "single") return this.currentPaths[theme] = images[0];

		let key = `${theme}\0${this.getThemePath(theme, "folder")}`;
		let signature = images.join("\0");
		let bag = this.shuffleBags.get(key);
		if (!bag || bag.signature !== signature || !bag.paths.length) {
			let paths = images.slice();
			for (let i = paths.length - 1; i > 0; i--) {
				let j = Math.floor(Math.random() * (i + 1));
				[paths[i], paths[j]] = [paths[j], paths[i]];
			}
			let current = this.getCurrentPath(theme);
			if (paths.length > 1 && paths[paths.length - 1] === current) [paths[0], paths[paths.length - 1]] = [paths[paths.length - 1], paths[0]];
			bag = { signature, paths };
			this.shuffleBags.set(key, bag);
		}
		return this.currentPaths[theme] = bag.paths.pop();
	},

	next(theme = this.currentTheme) {
		let themes = theme === "both" ? ["light", "dark"] : [theme];
		for (let value of themes) this.pickRandom(value);
		if (themes.includes(this.currentTheme)) this.apply({ readers: false });
	},

	refresh({ repick = false, readers = true, timer = true } = {}) {
		if (repick || !this.isFile(this.getCurrentPath())) {
			this.pickRandom(this.currentTheme);
		}
		this.apply({ readers });
		if (timer) this.resetTimer();
	},

	status(theme = this.currentTheme) {
		let images = this.getImages(theme);
		let currentPath = this.getCurrentPath(theme);
		return {
			count: images.length,
			currentPath,
			currentName: currentPath ? this.file(currentPath).leafName : "",
		};
	},

	detectTheme(win) {
		let scheme = win?.document?.documentElement?.getAttribute("data-color-scheme");
		if (scheme === "dark" || scheme === "light") return scheme;
		return win?.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	},

	watchTheme(win) {
		if (this.themeWatchers.has(win)) return;
		let media = win.matchMedia?.("(prefers-color-scheme: dark)");
		let update = () => {
			let theme = this.detectTheme(win);
			if (theme === this.currentTheme) return;
			this.currentTheme = theme;
			if (!this.getImages(theme).includes(this.getCurrentPath(theme))) this.pickRandom(theme);
			this.apply();
			this.resetTimer();
		};
		media?.addEventListener?.("change", update);
		let observer = new win.MutationObserver(update);
		observer.observe(win.document.documentElement, { attributes: true, attributeFilter: ["data-color-scheme"] });
		this.themeWatchers.set(win, { media, update, observer });
	},

	attach(win) {
		let doc = win.document;
		let paneStack = doc.getElementById("zotero-pane-stack");
		if (!paneStack || doc.getElementById("zotero-wallpaper-layer")) return false;

		let layer = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
		layer.id = "zotero-wallpaper-layer";
		let image = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
		image.id = "zotero-wallpaper-image";
		layer.append(image);
		paneStack.prepend(layer);

		let style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
		style.id = "zotero-wallpaper-style";
		style.textContent = this.css;
		doc.documentElement.append(style);

		this.watchTheme(win);
		this.applyToWindow(win);
		return true;
	},

	detach(win) {
		let watcher = this.themeWatchers.get(win);
		watcher?.media?.removeEventListener?.("change", watcher.update);
		watcher?.observer.disconnect();
		this.themeWatchers.delete(win);
		win.document.getElementById("zotero-wallpaper-layer")?.remove();
		win.document.getElementById("zotero-wallpaper-style")?.remove();
		win.document.getElementById("zotero-wallpaper-context-style")?.remove();
	},

	apply({ readers = true } = {}) {
		for (let win of Zotero.getMainWindows()) {
			if (!this.attach(win)) this.applyToWindow(win);
		}
		if (readers) this.refreshReaders();
	},

	applyToWindow(win) {
		let layer = win.document.getElementById("zotero-wallpaper-layer");
		if (!layer) return;
		let image = win.document.getElementById("zotero-wallpaper-image");
		if (!image) {
			image = win.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
			image.id = "zotero-wallpaper-image";
			layer.append(image);
		}
		let currentPath = this.getCurrentPath();
		layer.style.backgroundColor = this.getBaseColor();
		let enabled = this.get("enabled", true) && this.isFile(currentPath);
		layer.hidden = !enabled;
		if (!enabled) {
			win.document.getElementById("zotero-wallpaper-context-style")?.remove();
			return;
		}

		let uri = Services.io.newFileURI(this.file(currentPath)).spec;
		let fit = this.get("fit", "cover");
		let layout = {
			cover: ["cover", "center", "no-repeat"],
			contain: ["contain", "center", "no-repeat"],
			center: ["auto", "center", "no-repeat"],
			stretch: ["100% 100%", "center", "no-repeat"],
		}[fit] || ["cover", "center", "no-repeat"];

		image.style.backgroundImage = `url("${uri}")`;
		image.style.backgroundSize = layout[0];
		image.style.backgroundRepeat = layout[2];
		if (this.getThemeSource() === "single") {
			this.applySingleLayout(image);
		}
		else {
			image.style.backgroundPosition = layout[1];
			image.style.transform = "";
			image.style.transformOrigin = "";
		}
		this.setDocumentStyle(win.document, "zotero-wallpaper-context-style", this.buildContextPaneCSS());
	},

	clamp(value, min, max, fallback) {
		value = Number(value);
		return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
	},

	applySingleLayout(image, scale = this.get("singleScale", 100), x = this.get("singlePositionX", 50), y = this.get("singlePositionY", 50)) {
		scale = this.clamp(scale, 50, 200, 100);
		x = this.clamp(x, 0, 100, 50);
		y = this.clamp(y, 0, 100, 50);
		image.style.backgroundPosition = `${x}% ${y}%`;
		image.style.transform = scale === 100 ? "" : `scale(${scale / 100})`;
		image.style.transformOrigin = `${x}% ${y}%`;
	},

	previewSingleLayout(scale, x, y) {
		if (this.getThemeSource() !== "single") return;
		for (let win of Zotero.getMainWindows()) {
			let image = win.document.getElementById("zotero-wallpaper-image");
			if (image) this.applySingleLayout(image, scale, x, y);
		}
	},

	getWallpaperOpacity() {
		return Math.min(100, Math.max(0, Number(this.get("opacity", 30)))) / 100;
	},

	getSurfaceOpacity() {
		return Number((1 - this.getWallpaperOpacity()).toFixed(3));
	},

	getToolbarOpacity() {
		return Number((1 - this.getWallpaperOpacity() / 2).toFixed(3));
	},

	registerReaderIntegration() {
		if (this.readerHandler) return;
		if (typeof Zotero.Reader?.registerEventListener !== "function") {
			this.debug("Zotero Reader API unavailable");
			return;
		}
		this.readerHandler = event => {
			if (event?.reader) void this.applyToReader(event.reader).catch(error => this.reportError("Reader event failed", error));
		};
		try {
			Zotero.Reader.registerEventListener("renderToolbar", this.readerHandler, this.pluginID);
			this.debug("Reader renderToolbar listener registered");
			this.refreshReaders();
		}
		catch (error) {
			this.readerHandler = null;
			Zotero.logError(error);
		}
	},

	unregisterReaderIntegration() {
		try {
			if (this.readerHandler && typeof Zotero.Reader?._unregisterEventListenerByPluginID === "function") {
				Zotero.Reader._unregisterEventListenerByPluginID(this.pluginID);
			}
		}
		catch (error) {
			Zotero.logError(error);
		}
		this.readerHandler = null;
	},

	getReaders() {
		try {
			let readers = Zotero.Reader?._readers;
			if (!readers) return [];
			return Array.isArray(readers) ? readers.slice() : Array.from(readers);
		}
		catch (_) {
			return [];
		}
	},

	refreshReaders() {
		let readers = this.getReaders();
		let active = new Set(readers);
		for (let reader of this.readerStates.keys()) {
			if (!active.has(reader)) this.cleanupReader(reader);
		}
		for (let reader of readers) {
			void this.applyToReader(reader).catch(error => this.reportError("Reader refresh failed", error));
		}
	},

	async applyToReader(reader) {
		if (!reader) return;
		let outerWindow = await this.waitForReaderWindow(reader);
		if (!outerWindow || outerWindow.closed || !outerWindow.document?.documentElement) return;

		let state = this.readerStates.get(reader);
		if (state?.outerWindow !== outerWindow) {
			this.cleanupReader(reader);
			state = null;
		}
		if (!state) {
			state = { outerWindow, observer: null, frames: new Map() };
			state.unloadHandler = () => this.readerStates.get(reader) === state && this.cleanupReader(reader);
			outerWindow.addEventListener("unload", state.unloadHandler, { once: true });
			this.readerStates.set(reader, state);
		}

		let enabled = this.get("enabled", true) && this.isFile(this.getCurrentPath());
		if (!enabled) {
			this.cleanupReader(reader);
			return;
		}

		let changed = this.setDocumentStyle(outerWindow.document, "zotero-wallpaper-reader-style", this.buildReaderCSS());
		if (!state.observer || changed) this.scanReaderFrames(reader, state, changed);
		this.ensureReaderObserver(reader, state);
	},

	async waitForReaderWindow(reader) {
		for (let attempt = 0; attempt < 60; attempt++) {
			try {
				let outerWindow = reader?._iframeWindow;
				if (outerWindow && !outerWindow.closed && outerWindow.document?.documentElement) return outerWindow;
			}
			catch (_) {}
			await Zotero.Promise.delay(50);
		}
		return null;
	},

	ensureReaderObserver(reader, state) {
		if (state.observer || !state.outerWindow.MutationObserver) return;
		let splitView = state.outerWindow.document.getElementById("split-view") || state.outerWindow.document.querySelector(".split-view");
		if (!splitView) return;
		state.observer = new state.outerWindow.MutationObserver(() => this.scanReaderFrames(reader, state));
		state.observer.observe(splitView, { childList: true, subtree: true });
	},

	scanReaderFrames(reader, state, refresh = false) {
		let document = state.outerWindow.document;
		let frames = new Set(document.querySelectorAll("#split-view iframe, .split-view iframe"));
		for (let [frame, frameState] of Array.from(state.frames.entries())) {
			if (frames.has(frame) && frame.isConnected) continue;
			this.cleanupReaderFrame(frame, frameState);
			state.frames.delete(frame);
		}
		for (let frame of frames) {
			let frameState = state.frames.get(frame);
			let isNew = !frameState;
			if (!frameState) {
				frameState = { loadHandler: () => this.applyReaderFrame(frame) };
				frame.addEventListener("load", frameState.loadHandler);
				state.frames.set(frame, frameState);
			}
			if (isNew || refresh) this.applyReaderFrame(frame);
		}
	},

	applyReaderFrame(frame) {
		let document = frame.contentDocument;
		if (!document?.documentElement || !document.querySelector("#viewerContainer, .pdfViewer")) return;
		this.setDocumentStyle(document, "zotero-wallpaper-pdf-style", this.buildPDFCSS());
	},

	setDocumentStyle(document, id, css) {
		if (!document?.documentElement) return false;
		let style = document.getElementById(id);
		if (!style) {
			style = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
			style.id = id;
			document.documentElement.append(style);
		}
		if (style.textContent === css) return false;
		style.textContent = css;
		return true;
	},

	cleanupReaderFrame(frame, frameState) {
		frame.removeEventListener("load", frameState.loadHandler);
		frame.contentDocument?.getElementById("zotero-wallpaper-pdf-style")?.remove();
	},

	cleanupReader(reader) {
		let state = this.readerStates.get(reader);
		state?.observer?.disconnect();
		state?.outerWindow?.removeEventListener("unload", state.unloadHandler);
		for (let [frame, frameState] of state?.frames || []) this.cleanupReaderFrame(frame, frameState);
		let document = state?.outerWindow?.document || reader?._iframeWindow?.document;
		document?.getElementById("zotero-wallpaper-reader-style")?.remove();
		this.readerStates.delete(reader);
	},

	buildReaderCSS() {
		let surfaceOpacity = this.getSurfaceOpacity();
		let toolbarOpacity = this.getToolbarOpacity();
		return `
	:root {
	--zw-surface: rgba(255, 255, 255, ${surfaceOpacity});
	--zw-toolbar: rgba(249, 249, 249, ${toolbarOpacity});
	--zw-sheen: rgba(255, 255, 255, .08);
	--material-background: var(--zw-surface);
	--material-sidepane: var(--zw-surface);
	--material-toolbar: var(--zw-toolbar);
}
html,
body,
#reader-ui,
#split-view,
.split-view,
.primary-view,
.secondary-view {
	background-color: transparent !important;
}
#split-view iframe,
.split-view iframe {
	background: transparent !important;
}
.toolbar,
#reader-ui .toolbar {
	background-color: var(--zw-toolbar) !important;
	background-image: linear-gradient(125deg, var(--zw-sheen), transparent 36%) !important;
	backdrop-filter: blur(4px);
}
#sidebarContainer {
	background-color: var(--zw-surface) !important;
	background-image: linear-gradient(125deg, var(--zw-sheen), transparent 36%) !important;
}
#sidebarContent,
#thumbnailsView,
.thumbnails-view,
.thumbnails {
	background-color: transparent !important;
	background-image: none !important;
}
:root[data-color-scheme="dark"] {
	--zw-surface: rgba(30, 30, 30, ${surfaceOpacity});
	--zw-toolbar: rgba(39, 39, 39, ${toolbarOpacity});
	--zw-sheen: rgba(255, 255, 255, .025);
}
@media (prefers-color-scheme: dark) {
	:root:not([data-color-scheme="light"]) {
		--zw-surface: rgba(30, 30, 30, ${surfaceOpacity});
		--zw-toolbar: rgba(39, 39, 39, ${toolbarOpacity});
		--zw-sheen: rgba(255, 255, 255, .025);
	}
}
`;
	},

	buildContextPaneCSS() {
		let surfaceOpacity = this.getSurfaceOpacity();
		let toolbarOpacity = this.getToolbarOpacity();
		return `
	:root {
	--zw-surface: rgba(255, 255, 255, ${surfaceOpacity});
	--zw-center-surface: rgba(232, 232, 232, ${surfaceOpacity});
	--zw-toolbar: rgba(249, 249, 249, ${toolbarOpacity});
	--zw-sheen: rgba(255, 255, 255, .08);
	--material-background: var(--zw-surface);
	--material-sidepane: var(--zw-surface);
	--material-toolbar: var(--zw-toolbar);
}
#zotero-pane #zotero-collections-pane {
	background-color: transparent !important;
	background-image: linear-gradient(to bottom, transparent 0 41.5px, var(--zw-surface) 41.5px) !important;
}
#zotero-pane #zotero-items-pane-container {
	background: transparent !important;
}
#zotero-pane #zotero-items-pane {
	background-color: var(--zw-center-surface) !important;
	background-image: none !important;
}
#zotero-pane #zotero-item-pane,
#zotero-context-pane-inner {
	background-color: transparent !important;
	background-image: linear-gradient(125deg, var(--zw-sheen), transparent 36%), linear-gradient(to bottom, var(--zw-toolbar) 0 41px, var(--color-panedivider, #dadada) 41px 41.5px, var(--zw-surface) 41.5px) !important;
}
#zotero-context-pane-deck,
#zotero-context-pane-item-deck,
#zotero-context-pane-inner .zotero-item-pane-content,
#zotero-context-pane-inner .item-pane-container-root,
#zotero-context-pane-inner item-details,
#zotero-context-pane-inner .item-details,
#zotero-context-pane-inner .zotero-view-item-container,
#zotero-context-pane-inner .zotero-view-item-main,
#zotero-context-pane-inner .zotero-view-item,
#zotero-context-pane-inner item-pane-header {
	background-color: transparent !important;
	background-image: none !important;
}
#zotero-context-pane,
#zotero-context-pane > vbox,
#zotero-context-pane .stacked-context-placeholder {
	background: transparent !important;
}
#zotero-context-pane-item-deck {
	box-sizing: border-box;
	padding-top: 41.5px;
}
#zotero-context-pane-sidenav {
	--material-sidepane: transparent;
	background-color: var(--zw-toolbar) !important;
	background-image: linear-gradient(125deg, var(--zw-sheen), transparent 36%) !important;
	backdrop-filter: blur(4px);
}
@media (prefers-color-scheme: dark) {
	:root {
		--zw-surface: rgba(30, 30, 30, ${surfaceOpacity});
		--zw-center-surface: rgba(52, 52, 52, ${surfaceOpacity});
		--zw-toolbar: rgba(39, 39, 39, ${toolbarOpacity});
		--zw-sheen: rgba(255, 255, 255, .025);
	}
}
`;
	},

	buildPDFCSS() {
		let surfaceOpacity = this.getSurfaceOpacity();
		return `
	:root {
	--zw-stage: rgba(245, 245, 245, ${surfaceOpacity});
}
html,
body,
#outerContainer,
#mainContainer,
.pdfViewer {
	background-color: transparent !important;
}
#viewerContainer {
	background: var(--zw-stage) !important;
}
:root[data-color-scheme="dark"] {
	--zw-stage: rgba(30, 30, 30, ${surfaceOpacity});
}
@media (prefers-color-scheme: dark) {
	:root:not([data-color-scheme="light"]) {
		--zw-stage: rgba(30, 30, 30, ${surfaceOpacity});
	}
}
`;
	},

	resetTimer() {
		this.stopTimer();
		let minutes = Number(this.get("interval", 0));
		if (!this.get("enabled", true) || this.getThemeSource() !== "folder" || ![5, 10, 15, 30].includes(minutes)) return;
		this.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
		this.timer.initWithCallback(() => this.next(), minutes * 60 * 1000, Ci.nsITimer.TYPE_REPEATING_SLACK);
	},

	stopTimer() {
		this.timer?.cancel();
		this.timer = null;
	},

	async chooseSingle(parentWindow, theme = this.currentTheme) {
		let { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
		let picker = new FilePicker();
		picker.init(parentWindow, this.text("Choose a wallpaper", "选择一张壁纸"), picker.modeOpen);
		picker.appendFilter(this.text("Images", "图片"), "*.avif; *.bmp; *.gif; *.jpg; *.jpeg; *.png; *.webp");
		if (await picker.show() !== picker.returnOK) return null;
		let themes = theme === "both" ? ["light", "dark"] : [theme];
		for (let value of themes) {
			this.set(`${value}Source`, "single");
			this.set(`${value}SinglePath`, picker.file);
			this.pickRandom(value);
		}
		if (themes.includes(this.currentTheme)) this.refresh({ timer: true });
		return true;
	},

	async chooseFolder(parentWindow, theme = this.currentTheme) {
		let { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
		let picker = new FilePicker();
		picker.init(parentWindow, this.text("Choose a wallpaper folder", "选择壁纸文件夹"), picker.modeGetFolder);
		if (await picker.show() !== picker.returnOK) return null;
		let themes = theme === "both" ? ["light", "dark"] : [theme];
		for (let value of themes) {
			this.set(`${value}Source`, "folder");
			this.set(`${value}FolderPath`, picker.file);
		}
		this.shuffleBags.clear();
		for (let value of themes) this.pickRandom(value);
		if (themes.includes(this.currentTheme)) this.refresh({ timer: true });
		return true;
	},

	css: `
#zotero-pane-stack {
	position: relative !important;
	isolation: isolate;
}
#zotero-wallpaper-layer {
	position: absolute;
	inset: 0;
	z-index: 0;
	overflow: hidden;
	pointer-events: none;
}
#zotero-wallpaper-image {
	position: absolute;
	inset: 0;
}
#zotero-pane-stack > :not(#zotero-wallpaper-layer) {
	position: relative;
	z-index: 1;
}
#tabs-deck,
#tabs-deck > browser,
#tabs-deck > iframe,
#zotero-pane {
	background-color: transparent !important;
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
#zotero-pane .item-details,
#zotero-pane item-details {
	background-color: transparent !important;
	background-image: none !important;
}
#zotero-pane .virtualized-table .row:not(.selected):not(:hover),
#zotero-pane .virtualized-table .row:not(.selected):not(:hover) .cell {
	background-color: transparent !important;
}
#zotero-pane #zotero-item-pane {
	box-sizing: border-box;
}
#zotero-pane #zotero-item-pane-content {
	box-sizing: border-box;
	padding-top: 41.5px;
}
#zotero-pane .zotero-toolbar {
	background-color: var(--zw-toolbar, rgba(249, 249, 249, .85)) !important;
	background-image: linear-gradient(125deg, var(--zw-sheen, rgba(255, 255, 255, .08)), transparent 36%) !important;
	backdrop-filter: blur(4px);
}
@media (prefers-color-scheme: dark) {
	#zotero-pane .zotero-toolbar {
		background-color: var(--zw-toolbar, rgba(39, 39, 39, .85)) !important;
	}
}
`,
};
