# ============================================================
# zmail Windows 客户端本地构建脚本
# 在 Windows 上运行（或 WSL 中通过 powershell.exe 调用）。
# 前置：Node.js + npm、Rust stable (MSVC) + VS Build Tools(含 link.exe)
#
# 注意：请使用本项目 node_modules 里的 Tauri v2 CLI（npx tauri），
#       不要使用系统全局的 cargo-tauri（很可能是 v1，与 v2 项目不兼容）。
# ============================================================
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # 仓库根（apps/desktop 上两级）
$BuildDir = "$RepoRoot\apps\desktop"

Write-Host "[zmail] 仓库根: $RepoRoot"
Write-Host "[zmail] 桌面工程: $BuildDir"

# 1) 构建前端（产物 -> packages/web/dist）
Write-Host "[zmail] 构建前端..."
Push-Location (Join-Path $RepoRoot "packages\web")
try {
    if (-not (Test-Path "node_modules")) { npm install --no-audit --no-fund }
    npm run build
} finally { Pop-Location }

# 2) 安装 Tauri v2 CLI
Write-Host "[zmail] 安装 Tauri v2 CLI..."
Push-Location $BuildDir
try {
    if (-not (Test-Path "node_modules")) { npm install --no-audit --no-fund }

    # 3) 构建 Windows 安装包（MSI + NSIS EXE）
    Write-Host "[zmail] 开始 Tauri build（首次需编译全部依赖，约 15-30 分钟）..."
    npx tauri build
} finally { Pop-Location }

Write-Host "[zmail] 完成！产物位于:"
Write-Host "  $BuildDir\src-tauri\target\release\bundle\msi\"
Write-Host "  $BuildDir\src-tauri\target\release\bundle\nsis\"
