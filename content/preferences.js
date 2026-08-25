window.ZoteroWallpaper_Preferences = {
	get api() {
		return Zotero.Wallpaper;
	},

	init() {
		this.enabled = document.getElementById("zw-pref-enabled");
		this.opacity = document.getElementById("zw-pref-opacity");
		this.interval = document.getElementById("zw-pref-interval");

		this.enabled.checked = this.api.get("enabled", true);
		this.opacity.value = this.api.get("opacity", 30);
		this.interval.value = String(this.api.get("interval", 0));
		document.querySelector(`input[name="zw-pref-fit"][value="${this.api.get("fit", "cover")}"]`).checked = true;

		this.enabled.addEventListener("change", () => this.save("enabled", this.enabled.checked));
		this.opacity.addEventListener("input", () => {
			document.getElementById("zw-pref-opacity-value").value = `${this.opacity.value}%`;
			this.save("opacity", Number(this.opacity.value));
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

		document.getElementById("zw-pref-opacity-value").value = `${this.opacity.value}%`;
		this.render();
	},

	save(name, value) {
		this.api.set(name, value);
		this.api.refresh({ repick: name === "enabled" });
		this.render();
	},

	render() {
		let source = this.api.get("source", "single");
		let status = this.api.status();
		let path = this.api.get(source === "folder" ? "folderPath" : "singlePath", "");
		document.getElementById("zw-pref-source-badge").textContent = source === "folder" ? `文件夹 · ${status.count} 张` : "单张图片";
		document.getElementById("zw-pref-current").textContent = status.currentName || "未加载壁纸";
		document.getElementById("zw-pref-path").textContent = path || "请选择图片或文件夹";
		document.getElementById("zw-pref-next").disabled = status.count < 2;
	},
};
