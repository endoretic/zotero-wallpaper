var ZoteroWallpaper = {
	PREF: "extensions.zotero-wallpaper.",
	IMAGE_RE: /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i,
	currentPath: "",
	timer: null,
	readerStates: new Map(),
	readerHandler: null,
	pluginID: "zotero-wallpaper@endoretic.github.io",
	readerImageCache: { path: "", uri: "" },

	async startup(pluginID = this.pluginID) {
		this.pluginID = pluginID;
		this.debug(`startup ${pluginID}`);
		this.pickRandom();
		this.debug(`selected ${this.currentPath || "no image"}`);
		for (let win of Zotero.getMainWindows()) this.attach(win);
		this.registerReaderIntegration();
		this.resetTimer();
	},

	async shutdown() {
		this.stopTimer();
		this.unregisterReaderIntegration();
		for (let reader of this.getReaders()) this.cleanupReader(reader);
		this.readerImageCache = { path: "", uri: "" };
		for (let win of Zotero.getMainWindows()) this.detach(win);
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
		win.document.getElementById("zotero-wallpaper-context-style")?.remove();
	},

	apply() {
		for (let win of Zotero.getMainWindows()) {
			this.attach(win);
			this.applyToWindow(win);
		}
		this.refreshReaders();
	},

	applyToWindow(win) {
		let layer = win.document.getElementById("zotero-wallpaper-layer");
		if (!layer) return;
		let enabled = this.get("enabled", true) && this.isFile(this.currentPath);
		layer.hidden = !enabled;
		if (!enabled) {
			win.document.getElementById("zotero-wallpaper-context-style")?.remove();
			return;
		}

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
		layer.style.opacity = this.getWallpaperOpacity();
		this.setDocumentStyle(win.document, "zotero-wallpaper-context-style", this.buildContextPaneCSS(uri));
	},

	getWallpaperOpacity() {
		return Math.min(100, Math.max(0, Number(this.get("opacity", 30)))) / 100;
	},

	getSurfaceOpacity() {
		return Number((1 - this.getWallpaperOpacity()).toFixed(3));
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
		for (let reader of this.getReaders()) {
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
			this.readerStates.set(reader, state);
		}

		let enabled = this.get("enabled", true) && this.isFile(this.currentPath);
		if (!enabled) {
			this.cleanupReader(reader);
			return;
		}

		let uri = await this.getReaderImageURI();
		if (!uri) {
			this.cleanupReader(reader);
			return;
		}
		state.imageURI = uri;
		this.setDocumentStyle(outerWindow.document, "zotero-wallpaper-reader-style", this.buildReaderCSS(uri));
		this.scanReaderFrames(reader, state, uri);
		this.ensureReaderObserver(reader, state);
		this.debug("Reader shell style applied");
	},

	async waitForReaderWindow(reader) {
		for (let attempt = 0; attempt < 60; attempt++) {
			try {
				let outerWindow = reader?._iframeWindow;
				if (outerWindow && !outerWindow.closed && outerWindow.document?.documentElement) return outerWindow;
			}
			catch (_) {}
			await new Promise(resolve => Services.appShell.hiddenDOMWindow.setTimeout(resolve, 50));
		}
		return null;
	},

	ensureReaderObserver(reader, state) {
		if (state.observer || !state.outerWindow.MutationObserver) return;
		let splitView = state.outerWindow.document.getElementById("split-view") || state.outerWindow.document.querySelector(".split-view");
		if (!splitView) return;
		state.observer = new state.outerWindow.MutationObserver(() => this.scanReaderFrames(reader, state, state.imageURI));
		state.observer.observe(splitView, { childList: true, subtree: true });
	},

	scanReaderFrames(reader, state, uri) {
		let document = state.outerWindow.document;
		let frames = new Set(document.querySelectorAll("#split-view iframe, .split-view iframe"));
		this.debug(`Reader frames found: ${frames.size}`);
		for (let [frame, frameState] of Array.from(state.frames.entries())) {
			if (frames.has(frame) && frame.isConnected) continue;
			this.cleanupReaderFrame(frame, frameState);
			state.frames.delete(frame);
		}
		for (let frame of frames) {
			let frameState = state.frames.get(frame);
			if (!frameState) {
				frameState = { loadHandler: () => this.applyReaderFrame(frame, state.imageURI) };
				frame.addEventListener("load", frameState.loadHandler);
				state.frames.set(frame, frameState);
			}
			this.applyReaderFrame(frame, uri);
		}
	},

	applyReaderFrame(frame, uri) {
		let document = frame.contentDocument;
		if (!document?.documentElement || !document.querySelector("#viewerContainer, .pdfViewer")) return;
		this.setDocumentStyle(document, "zotero-wallpaper-pdf-style", this.buildPDFCSS(uri));
		this.debug("PDF frame style applied");
	},

	async getReaderImageURI() {
		let path = this.currentPath;
		if (!this.isFile(path)) return "";
		if (this.readerImageCache.path === path && this.readerImageCache.uri) return this.readerImageCache.uri;

		try {
			let extension = path.split(".").pop().toLowerCase();
			let mime = {
				avif: "image/avif",
				bmp: "image/bmp",
				gif: "image/gif",
				jpeg: "image/jpeg",
				jpg: "image/jpeg",
				png: "image/png",
				webp: "image/webp",
			}[extension] || "application/octet-stream";
			let uri = await Zotero.File.generateDataURI(path, mime);
			this.readerImageCache = { path, uri };
			this.debug("Reader image converted to data URL");
			return uri;
		}
		catch (error) {
			this.reportError("Reader image conversion failed", error);
			this.debug("Reader image conversion failed");
			return "";
		}
	},

	setDocumentStyle(document, id, css) {
		if (!document?.documentElement) return;
		let style = document.getElementById(id);
		if (!style) {
			style = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
			style.id = id;
			document.documentElement.append(style);
		}
		style.textContent = css;
	},

	cleanupReaderFrame(frame, frameState) {
		frame.removeEventListener("load", frameState.loadHandler);
		frame.contentDocument?.getElementById("zotero-wallpaper-pdf-style")?.remove();
	},

	cleanupReader(reader) {
		let state = this.readerStates.get(reader);
		state?.observer?.disconnect();
		for (let [frame, frameState] of state?.frames || []) this.cleanupReaderFrame(frame, frameState);
		let document = state?.outerWindow?.document || reader?._iframeWindow?.document;
		document?.getElementById("zotero-wallpaper-reader-style")?.remove();
		this.readerStates.delete(reader);
	},

	buildReaderCSS(uri) {
		let image = JSON.stringify(uri);
		let surfaceOpacity = this.getSurfaceOpacity();
		return `
html,
body,
#reader-ui,
#split-view,
.split-view,
.primary-view,
.secondary-view {
	background-color: transparent !important;
}
body {
	background-image: url(${image}) !important;
	background-position: center center !important;
	background-repeat: no-repeat !important;
	background-size: cover !important;
	background-attachment: fixed !important;
}
.toolbar,
#reader-ui .toolbar {
	background-color: rgba(249, 249, 249, .94) !important;
	backdrop-filter: blur(4px);
}
#sidebarContainer {
	background-color: rgba(242, 242, 242, ${surfaceOpacity}) !important;
	backdrop-filter: blur(4px);
}
#sidebarContent,
#thumbnailsView,
.thumbnails-view,
.thumbnails {
	background-color: transparent !important;
	background-image: none !important;
}
:root[data-color-scheme="dark"] .toolbar,
:root[data-color-scheme="dark"] #reader-ui .toolbar {
	background-color: rgba(39, 39, 39, .94) !important;
}
:root[data-color-scheme="dark"] #sidebarContainer {
	background-color: rgba(48, 48, 48, ${surfaceOpacity}) !important;
}
@media (prefers-color-scheme: dark) {
	:root:not([data-color-scheme="light"]) .toolbar,
	:root:not([data-color-scheme="light"]) #reader-ui .toolbar {
		background-color: rgba(39, 39, 39, .94) !important;
	}
	:root:not([data-color-scheme="light"]) #sidebarContainer {
		background-color: rgba(48, 48, 48, ${surfaceOpacity}) !important;
	}
}
`;
	},

	buildContextPaneCSS(uri) {
		let image = JSON.stringify(uri);
		let surfaceOpacity = this.getSurfaceOpacity();
		return `
#zotero-context-pane-inner {
	background-color: transparent !important;
	background-image: linear-gradient(to bottom, rgba(249, 249, 249, .94) 0 41px, var(--color-panedivider, #dadada) 41px 41.5px, rgba(242, 242, 242, ${surfaceOpacity}) 41.5px), url(${image}) !important;
	background-position: center center, center center !important;
	background-repeat: no-repeat, no-repeat !important;
	background-size: auto, cover !important;
	background-attachment: scroll, fixed !important;
	backdrop-filter: blur(4px);
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
#zotero-context-pane-item-deck {
	box-sizing: border-box;
	padding-top: 41.5px;
}
#zotero-context-pane-sidenav {
	background-color: rgba(249, 249, 249, .94) !important;
	backdrop-filter: blur(4px);
}
@media (prefers-color-scheme: dark) {
	#zotero-context-pane-inner {
		background-image: linear-gradient(to bottom, rgba(39, 39, 39, .94) 0 41px, var(--color-panedivider, #404040) 41px 41.5px, rgba(48, 48, 48, ${surfaceOpacity}) 41.5px), url(${image}) !important;
	}
	#zotero-context-pane-sidenav {
		background-color: rgba(39, 39, 39, .94) !important;
	}
}
`;
	},

	buildPDFCSS(uri) {
		let image = JSON.stringify(uri);
		let surfaceOpacity = this.getSurfaceOpacity();
		return `
html,
body,
#outerContainer,
#mainContainer,
.pdfViewer {
	background-color: transparent !important;
}
#viewerContainer {
	background-color: transparent !important;
	background-image: linear-gradient(rgba(245, 245, 245, ${surfaceOpacity}), rgba(245, 245, 245, ${surfaceOpacity})), url(${image}) !important;
	background-position: center center, center center !important;
	background-repeat: no-repeat, no-repeat !important;
	background-size: auto, cover !important;
	background-attachment: scroll, fixed !important;
}
:root[data-color-scheme="dark"] #viewerContainer {
	background-image: linear-gradient(rgba(30, 30, 30, ${surfaceOpacity}), rgba(30, 30, 30, ${surfaceOpacity})), url(${image}) !important;
}
@media (prefers-color-scheme: dark) {
	:root:not([data-color-scheme="light"]) #viewerContainer {
		background-image: linear-gradient(rgba(30, 30, 30, ${surfaceOpacity}), rgba(30, 30, 30, ${surfaceOpacity})), url(${image}) !important;
	}
}
`;
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
		picker.init(parentWindow, this.text("Choose a wallpaper", "选择一张壁纸"), picker.modeOpen);
		picker.appendFilter(this.text("Images", "图片"), "*.avif; *.bmp; *.gif; *.jpg; *.jpeg; *.png; *.webp");
		if (await picker.show() !== picker.returnOK) return null;
		this.set("source", "single");
		this.set("singlePath", picker.file);
		return this.refresh({ repick: true });
	},

	async chooseFolder(parentWindow) {
		let { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
		let picker = new FilePicker();
		picker.init(parentWindow, this.text("Choose a wallpaper folder", "选择壁纸文件夹"), picker.modeGetFolder);
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
	background: linear-gradient(to bottom, rgba(248, 248, 250, .78) 0 41px, var(--color-panedivider, #dadada) 41px 41.5px, transparent 41.5px) !important;
}
#zotero-pane #zotero-item-pane-content {
	box-sizing: border-box;
	padding-top: 41.5px;
}
#zotero-pane .zotero-toolbar {
	background-color: rgba(248, 248, 250, .78) !important;
	backdrop-filter: blur(10px);
}
@media (prefers-color-scheme: dark) {
	#zotero-pane #zotero-item-pane {
		background: linear-gradient(to bottom, rgba(36, 36, 39, .78) 0 41px, var(--color-panedivider, #404040) 41px 41.5px, transparent 41.5px) !important;
	}
	#zotero-pane .zotero-toolbar {
		background-color: rgba(36, 36, 39, .78) !important;
	}
}
`,
};
