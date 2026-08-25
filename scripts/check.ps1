$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
node --check (Join-Path $root 'bootstrap.js')
node --check (Join-Path $root 'content\wallpaper.js')
node --check (Join-Path $root 'content\preferences.js')

$required = 'manifest.json', 'bootstrap.js', 'prefs.js', 'content\wallpaper.js', 'content\preferences.xhtml'
foreach ($file in $required) {
	if (-not (Test-Path -LiteralPath (Join-Path $root $file))) { throw "Missing $file" }
}

Write-Host 'Zotero Wallpaper static checks passed.'
