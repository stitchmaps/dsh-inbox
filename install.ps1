# Install the "dsh-inbox" plugin into the running DSH desktop profile.
#
#   pwsh -File .\install.ps1
#
# Copies this repository's plugin files (package.json, lib/, node_modules, ...)
# into the profile's node_modules, records a file: dependency, and appends a
# loader row to the profile's cordis.patch.yml. Every modified file is backed up
# next to the original with a timestamp.

param(
  [string]$Profile = $(if ($env:DSH_PROFILE_DIR) { $env:DSH_PROFILE_DIR } else { Join-Path (Join-Path $env:USERPROFILE '.dsh') 'profiles\desktop' }),
  [switch]$NoEnable
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = $repoRoot
if (-not (Test-Path (Join-Path $source 'package.json'))) { throw "plugin source not found: $source" }
if (-not (Test-Path $Profile)) { throw "profile not found: $Profile" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $Profile 'node_modules\dsh-inbox'

Write-Host "[1/4] copying plugin to $target"
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
New-Item -ItemType Directory -Path $target -Force | Out-Null
$copyItems = @('package.json', 'cordis.patch.yml', 'icon.svg', 'README.md', 'README.zh.md', 'LICENSE', 'lib')
foreach ($item in $copyItems) {
  $from = Join-Path $source $item
  if (Test-Path $from) { Copy-Item -Recurse -Force $from (Join-Path $target $item) }
}

# Dependencies are pre-bundled into lib/vendor.cjs — no node_modules is shipped.
if (-not (Test-Path (Join-Path $target 'lib\vendor.cjs'))) {
  throw "lib/vendor.cjs missing; run 'npm install' then 'npm run build:vendor' in the plugin repo first"
}

Write-Host "[2/4] registering dependency in profile package.json"
$pkgPath = Join-Path $Profile 'package.json'
Copy-Item $pkgPath "$pkgPath.bak-$stamp" -Force
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($null -eq $pkg.dependencies) {
  $pkg | Add-Member -MemberType NoteProperty -Name dependencies -Value ([pscustomobject]@{}) -Force
}
$fileSpec = 'file:' + ($source -replace '\\', '/')
$existing = $pkg.dependencies.PSObject.Properties['dsh-inbox']
if ($null -eq $existing) {
  $pkg.dependencies | Add-Member -NotePropertyName 'dsh-inbox' -NotePropertyValue $fileSpec -Force
} else {
  $existing.Value = $fileSpec
}
$pkg | ConvertTo-Json -Depth 40 | Set-Content -Path $pkgPath -Encoding utf8

if ($NoEnable) {
  Write-Host "[3/4] -NoEnable set; skipping cordis.patch.yml edit"
  Write-Host "[4/4] done (not enabled)"
  return
}

Write-Host "[3/4] enabling plugin row in cordis.patch.yml"
$patchPath = Join-Path $Profile 'cordis.patch.yml'
Copy-Item $patchPath "$patchPath.bak-$stamp" -Force
$patch = Get-Content $patchPath -Raw
if ($patch -match '(?m)^\s*name:\s*[''"]?dsh-inbox[''"]?\s*$') {
  Write-Host "      dsh-inbox row already present; leaving as is"
} else {
  $block = @"

# --- dsh-inbox plugin (added by install.ps1) ---
- insert:
    - id: dsh-inbox
      name: dsh-inbox
"@
  Add-Content -Path $patchPath -Value $block -Encoding utf8
  Write-Host "      row appended"
}

Write-Host "[4/4] done"
Write-Host "If the GUI does not show the new entry immediately, refresh the Web GUI page."
