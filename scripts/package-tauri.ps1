# 把 Tauri 构建产物整理到 dist/：安装包 + 便携 zip
# -Toolchain 由 npm script 显式传入，避免“GNU 构建完却打包了旧 MSVC 产物”
param(
    [ValidateSet('auto', 'msvc', 'gnu')]
    [string]$Toolchain = 'auto'
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'

$msvcTarget = Join-Path $root 'src-tauri\target\x86_64-pc-windows-msvc\release'
$gnuTarget = Join-Path $root 'src-tauri\target\release'
if ($Toolchain -eq 'auto') {
    if (Test-Path (Join-Path $msvcTarget 'tradecalc.exe')) {
        $Toolchain = 'msvc'
    } else {
        $Toolchain = 'gnu'
    }
}
if ($Toolchain -eq 'msvc') {
    $target = $msvcTarget
    $needsLoader = $false
} else {
    $target = $gnuTarget
    $needsLoader = $true
}
$toolchain = $Toolchain

$appExe = Join-Path $target 'tradecalc.exe'
$loader = Join-Path $target 'WebView2Loader.dll'
if (-not (Test-Path $appExe)) {
    throw "未找到 $appExe，请先运行 npm run tauri:build 或 MSVC 构建"
}

$setup = Get-ChildItem (Join-Path $target 'bundle\nsis') -Filter "*$version*-setup.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($null -eq $setup) {
    throw "未找到 $version 的 NSIS 安装包（$toolchain），请先运行对应的 Tauri 构建"
}

if (Test-Path $dist) {
    Remove-Item -Recurse -Force $dist
}
New-Item -ItemType Directory -Force $dist | Out-Null

Copy-Item $setup.FullName (Join-Path $dist $setup.Name)

$portableDir = Join-Path $dist "TradeCalc-$version-Portable"
New-Item -ItemType Directory -Force $portableDir | Out-Null
Copy-Item $appExe (Join-Path $portableDir 'TradeCalc.exe')
if ($needsLoader -and (Test-Path $loader)) {
    # GNU 目标不会把 WebView2Loader 静态链接进 exe，必须同目录分发
    Copy-Item $loader $portableDir
}
Copy-Item (Join-Path $root 'LICENSE') $portableDir

Compress-Archive -Path (Join-Path $portableDir '*') `
    -DestinationPath (Join-Path $dist "TradeCalc-$version-Portable.zip") `
    -CompressionLevel Optimal -Force
Remove-Item -Recurse -Force $portableDir

Write-Output "toolchain: $toolchain"

Get-ChildItem $dist | ForEach-Object {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($_.FullName)
    try {
        $hash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLower()
    } finally {
        $stream.Dispose()
        $sha.Dispose()
    }
    "{0}  {1}  {2:N2} MiB" -f $hash, $_.Name, ($_.Length / 1MB)
}
