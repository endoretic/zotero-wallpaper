var WallpaperScope;

async function startup({ id, rootURI }) {
	WallpaperScope = { Zotero, Services, ChromeUtils, Cc, Ci };
	Services.scriptloader.loadSubScript(rootURI + "content/wallpaper.js", WallpaperScope);
	Zotero.Wallpaper = WallpaperScope.ZoteroWallpaper;
	await Zotero.Wallpaper.startup(id);

	await Zotero.PreferencePanes.register({
		id: "zotero-wallpaper-prefpane",
		pluginID: id,
		src: rootURI + "content/preferences.xhtml",
		scripts: [rootURI + "content/preferences.js"],
		stylesheets: [rootURI + "content/preferences.css"],
	});
}

async function shutdown() {
	if (!Zotero.Wallpaper) return;
	await Zotero.Wallpaper.shutdown();
	delete Zotero.Wallpaper;
	WallpaperScope = null;
}

function onMainWindowLoad({ window }) {
	Zotero.Wallpaper?.attach(window);
}

function onMainWindowUnload({ window }) {
	Zotero.Wallpaper?.detach(window);
}

function install() {}
function uninstall() {}
