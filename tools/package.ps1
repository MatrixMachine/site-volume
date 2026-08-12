# tools/package.ps1 — 打包扩展为 Chrome Web Store 可上传的 zip
#
# 只包含运行必需文件(manifest.json + src/ 下被引用的文件),
# 排除文档(CONTEXT/DESIGN/README)、docs/、tools/、.git 等无关内容。
# 产物:dist/site-volume-<version>-<yyyyMMdd>.zip(dist/ 已在 .gitignore)
#
# 用法:
#   powershell -ExecutionPolicy Bypass -File tools\package.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'manifest.json'
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null

# ---- 1. 需要打包的文件(相对仓库根,运行必需)----
$files = @(
  'manifest.json',
  'src/content/bridge.js',
  'src/inject/volume.js',
  'src/options/options.html',
  'src/options/options.js',
  'src/popup/popup.html',
  'src/popup/popup.js',
  'src/shared/quota-log.js',
  'src/shared/site-icon.js',
  'src/icons/icon16.png',
  'src/icons/icon48.png',
  'src/icons/icon128.png'
)

# ---- 2. 校验:manifest 引用的每个文件都在打包清单里,且都存在 ----
$referenced = @(
  $manifest.action.default_popup,
  $manifest.options_ui.page
)
$referenced += @($manifest.content_scripts | ForEach-Object { $_.js })
$referenced += @($manifest.icons.PSObject.Properties.Value)
foreach ($rel in ($referenced | Where-Object { $_ } | Sort-Object -Unique)) {
  if ($files -notcontains $rel) { throw "manifest 引用了未列入打包清单的文件: $rel" }
}
foreach ($f in $files) {
  if (-not (Test-Path (Join-Path $root $f))) { throw "打包文件不存在: $f" }
}

# ---- 3. 构建暂存目录(干净副本,只含所需文件)----
$stage = Join-Path $dist '_stage'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
foreach ($f in $files) {
  $dest = Join-Path $stage $f
  $destDir = Split-Path -Parent $dest
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item (Join-Path $root $f) $dest -Force
}

# ---- 4. 打成 zip ----
$stamp = Get-Date -Format 'yyyyMMdd'
$zipName = "site-volume-$($manifest.version)-$stamp.zip"
$zipPath = Join-Path $dist $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -CompressionLevel Optimal

# ---- 5. 清理暂存并展示结果 ----
Remove-Item $stage -Recurse -Force

Write-Host ''
Write-Host "打包完成: $zipPath"
Write-Host "版本: $($manifest.version) | 打包文件数: $($files.Count)"
Write-Host ''
Write-Host 'zip 内文件清单:'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$zip.Entries | ForEach-Object { "  $($_.FullName)" } | Sort-Object
$zip.Dispose()
