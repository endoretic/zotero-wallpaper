# Zotero Wallpaper

面向 Zotero 10 的本地壁纸插件。支持单张图片或文件夹、启动随机、5/10/15/30 分钟随机切换、透明度以及覆盖/填充/居中/拉伸四种显示方式。

## 开发加载

在 Zotero 配置目录的 `extensions` 文件夹创建名为 `zotero-wallpaper@endoretic.github.io` 的无扩展名文本文件，内容为本仓库绝对路径。完全退出 Zotero，再使用 `-purgecaches` 参数启动，插件会直接从源码目录加载，无需打包 XPI。

首次通过 extension proxy 加载时，Zotero 可能把外部插件默认设为禁用；在 `工具 → 插件` 中启用一次即可。之后修改源码只需重启 Zotero。`manifest.json` 中的 `update_url` 供未来发布版本检查更新，不参与 extension proxy 的发现和加载。

设置入口：`编辑 → 设置 → Zotero Wallpaper`。

## 自检

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check.ps1
```

壁纸只保存本地路径，不复制或修改原始图片。文件夹模式读取所选目录第一层中的 AVIF、BMP、GIF、JPEG、PNG 和 WebP 文件。
