$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$manifest = Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
node --check (Join-Path $root 'bootstrap.js')
node --check (Join-Path $root 'content\wallpaper.js')
node --check (Join-Path $root 'content\preferences.js')
[xml](Get-Content -LiteralPath (Join-Path $root 'content\preferences.xhtml') -Raw -Encoding UTF8) | Out-Null

$required = 'manifest.json', 'bootstrap.js', 'prefs.js', 'README.md', '.github\workflows\release.yml', 'content\wallpaper.js', 'content\preferences.xhtml'
foreach ($file in $required) {
	if (-not (Test-Path -LiteralPath (Join-Path $root $file))) { throw "Missing $file" }
}

if ($manifest.description -match '[\u3400-\u9fff]') { throw 'The default manifest description must be English' }
if ((Get-Content -LiteralPath (Join-Path $root 'prefs.js') -Raw) -notmatch 'zotero-wallpaper\.language') { throw 'Missing language preference' }

Write-Host 'Zotero Wallpaper static checks passed.'
