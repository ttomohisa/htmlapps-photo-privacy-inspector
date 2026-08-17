param(
  [switch]$ForceDownload,
  [switch]$SkipSelfExtract,
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TemplatePath = Join-Path $Root "src\index.template.html"
$AppConfigPath = Join-Path $Root "app.config.json"
$DependenciesPath = Join-Path $Root "dependencies.json"
$VerifyPath = Join-Path $Root "scripts\verify-standalone.ps1"
$SelfExtractBuilderPath = Join-Path $Root "scripts\build-self-extract.ps1"
$CacheRoot = Join-Path $Root ".cache"
$DistRoot = Join-Path $Root "dist"

$OutputPathWasSpecified = -not [string]::IsNullOrWhiteSpace($OutputPath)
if ($OutputPathWasSpecified -and -not [System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $Root $OutputPath
}

New-Item -ItemType Directory -Force -Path $CacheRoot, $DistRoot | Out-Null

function Write-Step([string]$Message) {
  Write-Host "[Single HTML] $Message" -ForegroundColor Cyan
}

function Get-Json([string]$Path) {
  if (-not (Test-Path $Path)) { throw "Required file not found: $Path" }
  return Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json
}

function Get-Sha256FileHex([string]$Path) {
  if (-not (Test-Path $Path)) { throw "File not found for SHA-256: $Path" }
  $stream = [System.IO.File]::OpenRead($Path)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $algorithm.ComputeHash($stream)
    return (($hashBytes | ForEach-Object { $_.ToString("x2") }) -join "")
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

function Get-SafeId([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "Dependency id cannot be empty." }
  if ($Value -notmatch '^[a-z0-9][a-z0-9._-]*$') { throw "Dependency id '$Value' must use lowercase letters, numbers, dot, underscore, or hyphen." }
  return $Value
}

function Get-NpmPackage([string]$PackageName, [string]$Version) {
  if ([string]::IsNullOrWhiteSpace($PackageName) -or [string]::IsNullOrWhiteSpace($Version)) {
    throw "Every dependency requires package and version."
  }

  $packageKey = (($PackageName -replace "[^A-Za-z0-9._-]", "-") + "-" + $Version)
  $packageRoot = Join-Path $CacheRoot $packageKey
  $extractRoot = Join-Path $packageRoot "extracted"
  $packageDir = Join-Path $extractRoot "package"
  $archivePath = Join-Path $packageRoot "package.tgz"
  $metadataPath = Join-Path $packageRoot "metadata.json"

  if ($ForceDownload -and (Test-Path $packageRoot)) {
    Remove-Item -Recurse -Force $packageRoot
  }

  New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null

  if (-not (Test-Path $archivePath)) {
    $encodedPackage = [Uri]::EscapeDataString($PackageName)
    $metadataUrl = "https://registry.npmjs.org/$encodedPackage/$Version"
    Write-Step "Resolving $PackageName@$Version"
    $metadata = Invoke-RestMethod -Uri $metadataUrl -UseBasicParsing -Headers @{ "User-Agent" = "single-html-app-template/1.0" }
    if (-not $metadata.dist.tarball) { throw "npm metadata did not contain a tarball URL for $PackageName@$Version" }
    $metadata | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $metadataPath
    $partialPath = "$archivePath.part"
    Remove-Item -Force -ErrorAction SilentlyContinue $partialPath
    Write-Step "Downloading $PackageName@$Version"
    Invoke-WebRequest -Uri ([string]$metadata.dist.tarball) -OutFile $partialPath -UseBasicParsing -Headers @{ "User-Agent" = "single-html-app-template/1.0" }
    Move-Item -Force $partialPath $archivePath
  } else {
    Write-Step "Using cached archive for $PackageName@$Version"
  }

  if (-not (Test-Path $packageDir)) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $extractRoot
    New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
    Write-Step "Extracting $PackageName@$Version"
    & tar.exe -xzf $archivePath -C $extractRoot
    if ($LASTEXITCODE -ne 0) { throw "tar.exe failed while extracting $archivePath" }
  }

  $packageJsonPath = Join-Path $packageDir "package.json"
  if (-not (Test-Path $packageJsonPath)) { throw "package.json was not found in $packageDir" }
  $actualVersion = [string]((Get-Content -Raw -Encoding UTF8 $packageJsonPath | ConvertFrom-Json).version)
  if ($actualVersion -ne $Version) { throw "Expected $PackageName@$Version but the archive contains $actualVersion" }

  return [ordered]@{
    Root = $packageDir
    Archive = $archivePath
    ArchiveSha256 = (Get-Sha256FileHex $archivePath)
  }
}

function Get-MimeType([string]$Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".js" { return "text/javascript" }
    ".mjs" { return "text/javascript" }
    ".css" { return "text/css" }
    ".json" { return "application/json" }
    ".wasm" { return "application/wasm" }
    ".svg" { return "image/svg+xml" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    ".webp" { return "image/webp" }
    ".woff" { return "font/woff" }
    ".woff2" { return "font/woff2" }
    ".txt" { return "text/plain" }
    default { return "application/octet-stream" }
  }
}

function Get-AssetBytes([string]$Path, [bool]$StripSourceMapComment) {
  if (-not (Test-Path $Path)) { throw "Dependency asset not found: $Path" }
  if ($StripSourceMapComment -and [System.IO.Path]::GetExtension($Path) -in @(".js", ".mjs", ".css")) {
    $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    $text = [regex]::Replace($text, "(?m)^\s*//# sourceMappingURL=.*$", "")
    $text = [regex]::Replace($text, "(?m)^\s*/\*# sourceMappingURL=.*?\*/\s*$", "")
    return [System.Text.Encoding]::UTF8.GetBytes($text)
  }
  return [System.IO.File]::ReadAllBytes($Path)
}

function ConvertTo-SafeJson([object]$Value, [int]$Depth = 30) {
  return ($Value | ConvertTo-Json -Compress -Depth $Depth).Replace("<", "\u003c").Replace(">", "\u003e").Replace("&", "\u0026")
}

function Get-RelativeAssetPath([string]$PackageRoot, [string]$ConfiguredPath) {
  if ([string]::IsNullOrWhiteSpace($ConfiguredPath)) { throw "Dependency asset path cannot be empty." }
  $rootFull = [System.IO.Path]::GetFullPath($PackageRoot).TrimEnd([char[]]@([char]92, [char]47))
  $assetFull = [System.IO.Path]::GetFullPath((Join-Path $PackageRoot $ConfiguredPath))
  if (-not $assetFull.StartsWith($rootFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Dependency asset path escapes the package root: $ConfiguredPath"
  }
  return $assetFull
}

if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
  throw "tar.exe was not found. Use a current Windows 10/11 environment, or install bsdtar and expose it as tar.exe."
}

$appConfig = Get-Json $AppConfigPath
$dependencyConfig = Get-Json $DependenciesPath
if (-not $OutputPathWasSpecified) {
  $configuredOutput = [string]$appConfig.build.output
  if ([string]::IsNullOrWhiteSpace($configuredOutput)) { $configuredOutput = "dist/index.html" }
  $OutputPath = if ([System.IO.Path]::IsPathRooted($configuredOutput)) { $configuredOutput } else { Join-Path $Root $configuredOutput }
}
if (-not $dependencyConfig.dependencies) { $dependencies = @() } else { $dependencies = @($dependencyConfig.dependencies) }

$ids = @{}
$assetBundle = [ordered]@{ schemaVersion = 1; dependencies = [ordered]@{} }
$manifestDependencies = @()

foreach ($dependency in $dependencies) {
  $id = Get-SafeId ([string]$dependency.id)
  if ($ids.ContainsKey($id)) { throw "Duplicate dependency id: $id" }
  $ids[$id] = $true

  $package = Get-NpmPackage ([string]$dependency.package) ([string]$dependency.version)
  $dependencyAssets = [ordered]@{}
  $manifestAssets = @()
  $assetKeys = @{}

  foreach ($asset in @($dependency.assets)) {
    $key = Get-SafeId ([string]$asset.key)
    if ($assetKeys.ContainsKey($key)) { throw "Duplicate asset key '$key' in dependency '$id'." }
    $assetKeys[$key] = $true

    $assetPath = Get-RelativeAssetPath $package.Root ([string]$asset.path)
    $strip = $false
    if ($asset.PSObject.Properties.Name -contains "stripSourceMapComment") { $strip = [bool]$asset.stripSourceMapComment }
    $bytes = Get-AssetBytes $assetPath $strip
    $configuredMime = ""
    if ($asset.PSObject.Properties.Name -contains "mime") { $configuredMime = [string]$asset.mime }
    $mime = if ([string]::IsNullOrWhiteSpace($configuredMime)) { Get-MimeType $assetPath } else { $configuredMime }
    $shaAlgorithm = [Security.Cryptography.SHA256]::Create()
    try {
      $hashBytes = $shaAlgorithm.ComputeHash($bytes)
    } finally {
      $shaAlgorithm.Dispose()
    }
    $sha = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""

    $dependencyAssets[$key] = [ordered]@{
      mime = $mime
      base64 = [Convert]::ToBase64String($bytes)
    }
    $manifestAssets += [ordered]@{
      key = $key
      path = [string]$asset.path
      mime = $mime
      bytes = $bytes.Length
      sha256 = $sha
    }
  }

  $assetBundle.dependencies[$id] = [ordered]@{
    package = [string]$dependency.package
    version = [string]$dependency.version
    assets = $dependencyAssets
  }
  $license = ""
  $homepage = ""
  if ($dependency.PSObject.Properties.Name -contains "license") { $license = [string]$dependency.license }
  if ($dependency.PSObject.Properties.Name -contains "homepage") { $homepage = [string]$dependency.homepage }
  $manifestDependencies += [ordered]@{
    id = $id
    package = [string]$dependency.package
    version = [string]$dependency.version
    license = $license
    homepage = $homepage
    tarballSha256 = $package.ArchiveSha256
    assets = $manifestAssets
  }
}

$manifest = [ordered]@{
  schemaVersion = 1
  builder = "single-html-app-template/1.0"
  generatedAtUtc = [DateTime]::UtcNow.ToString("o")
  app = [ordered]@{
    name = [string]$appConfig.name
    slug = [string]$appConfig.slug
    version = [string]$appConfig.version
  }
  dependencies = $manifestDependencies
}

Write-Step "Generating standalone HTML"
$template = [System.IO.File]::ReadAllText($TemplatePath, [System.Text.Encoding]::UTF8)
$assetBundleJson = ConvertTo-SafeJson $assetBundle 50
$replacements = [ordered]@{
  "__APP_CONFIG_JSON__" = ConvertTo-SafeJson $appConfig 20
  "__BUILD_MANIFEST_JSON__" = ConvertTo-SafeJson $manifest 40
  "__EMBEDDED_ASSET_BUNDLE_BASE64__" = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($assetBundleJson))
}

foreach ($entry in $replacements.GetEnumerator()) {
  $count = ([regex]::Matches($template, [regex]::Escape($entry.Key))).Count
  if ($count -ne 1) { throw "Template placeholder $($entry.Key) must occur exactly once; found $count." }
  $template = $template.Replace($entry.Key, [string]$entry.Value)
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
[System.IO.File]::WriteAllText($OutputPath, $template, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $outputDirectory "dependency-manifest.json"), ($manifest | ConvertTo-Json -Depth 40), (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $outputDirectory ".nojekyll"), "", (New-Object System.Text.UTF8Encoding($false)))

& $VerifyPath `
  -Path $OutputPath `
  -RequireNetworkBlock ([bool]$appConfig.build.blockRuntimeNetwork) `
  -ForbiddenPlaceholders @($replacements.Keys)

$selfExtractEnabled = $false
$selfExtractOutputPath = ""
if (-not $SkipSelfExtract -and ($appConfig.build.PSObject.Properties.Name -contains "selfExtract")) {
  $selfExtractConfig = $appConfig.build.selfExtract
  if ($selfExtractConfig -and ($selfExtractConfig.PSObject.Properties.Name -contains "enabled")) {
    $selfExtractEnabled = [bool]$selfExtractConfig.enabled
  }
  if ($selfExtractEnabled) {
    if (-not ($selfExtractConfig.PSObject.Properties.Name -contains "output")) {
      throw "app.config.json: build.selfExtract.output is required when self-extract output is enabled."
    }
    if ($OutputPathWasSpecified) {
      $customDirectory = Split-Path -Parent $OutputPath
      $customBaseName = [System.IO.Path]::GetFileNameWithoutExtension($OutputPath)
      $selfExtractOutputPath = Join-Path $customDirectory ($customBaseName + ".self-extract.html")
    } else {
      $configuredSelfExtractOutput = [string]$selfExtractConfig.output
      if ([string]::IsNullOrWhiteSpace($configuredSelfExtractOutput)) {
        throw "app.config.json: build.selfExtract.output cannot be empty."
      }
      $selfExtractOutputPath = if ([System.IO.Path]::IsPathRooted($configuredSelfExtractOutput)) {
        $configuredSelfExtractOutput
      } else {
        Join-Path $Root $configuredSelfExtractOutput
      }
    }

    Write-Step "Generating self-extracting HTML"
    & $SelfExtractBuilderPath `
      -InputPath $OutputPath `
      -OutputPath $selfExtractOutputPath `
      -AppName ([string]$appConfig.name) `
      -AppNameJa ([string]$appConfig.nameJa)
  }
}

$outputHash = Get-Sha256FileHex $OutputPath
$outputSizeMb = [Math]::Round((Get-Item $OutputPath).Length / 1MB, 2)
Write-Host ""
Write-Host "[OK] Standalone HTML: $OutputPath" -ForegroundColor Green
Write-Host "[OK] Size: $outputSizeMb MB"
Write-Host "[OK] SHA-256: $outputHash"
Write-Host "[OK] Runtime network access is blocked by CSP."
if ($selfExtractEnabled) {
  Write-Host "[OK] Self-extracting HTML: $selfExtractOutputPath" -ForegroundColor Green
}
