# 用 MSVC 目标构建 Tauri 应用并生成 NSIS 安装包。
# - 有 Visual Studio Build Tools：直接调用 tauri build
# - 没有管理员权限：自动使用用户级 LLVM + cargo-xwin（本机方案）
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 1. 查找 LLVM（clang-cl / lld-link / llvm-rc）
$llvmCandidates = @()
if ($env:LLVM_BIN) {
    $llvmCandidates += $env:LLVM_BIN
}
$llvmCandidates += Get-ChildItem (Join-Path $env:USERPROFILE '.local\llvm') -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'bin' }

$llvmBin = $null
foreach ($candidate in $llvmCandidates) {
    if (Test-Path (Join-Path $candidate 'clang-cl.exe')) {
        $llvmBin = $candidate
        break
    }
}

# 2. 查找 cargo-xwin
$cargoXwin = $null
if ($env:CARGO_XWIN -and (Test-Path $env:CARGO_XWIN)) {
    $cargoXwin = $env:CARGO_XWIN
} else {
    $localXwin = Join-Path $env:USERPROFILE '.local\cargo-xwin\cargo-xwin.exe'
    if (Test-Path $localXwin) {
        $cargoXwin = $localXwin
    }
}

# 3. 组装 PATH（LLVM 必须在 MinGW 前面，避免用到 GNU 的 rc/windres）
$pathParts = @()
if ($llvmBin) { $pathParts += $llvmBin }
if ($cargoXwin) { $pathParts += (Split-Path -Parent $cargoXwin) }
$pathParts += @(
    (Join-Path $env:USERPROFILE '.cargo\bin'),
    (Join-Path $env:USERPROFILE '.local\mingw\mingw64\bin')
)
$env:PATH = ($pathParts -join ';') + ';' + $env:PATH

& npm run check:versions
if ($LASTEXITCODE -ne 0) { throw '版本号检查失败' }

if ($cargoXwin -and $llvmBin) {
    Write-Output "使用 cargo-xwin + LLVM 构建 MSVC 目标"
    & npm run build:web
    if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }

    Push-Location (Join-Path $root 'src-tauri')
    try {
        & $cargoXwin build --release --target x86_64-pc-windows-msvc --features tauri/custom-protocol
        if ($LASTEXITCODE -ne 0) { throw 'cargo-xwin 构建失败' }
    } finally {
        Pop-Location
    }

    & npx tauri bundle --target x86_64-pc-windows-msvc --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw 'NSIS 打包失败' }
} else {
    Write-Output "未找到用户级 LLVM/cargo-xwin，使用已安装的 MSVC Build Tools"
    & npx tauri build --target x86_64-pc-windows-msvc --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw 'MSVC 构建失败' }
}

$release = Join-Path $root 'src-tauri\target\x86_64-pc-windows-msvc\release'
Write-Output "构建完成：$release\tradecalc.exe"
Write-Output "安装包：$release\bundle\nsis"
