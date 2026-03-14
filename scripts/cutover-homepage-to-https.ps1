param(
  [string]$Username = 'easonwu',
  [string]$Password,
  [string]$BackendBase = 'https://140-112-3-65.sslip.io',
  [string]$PublicUser = 'easonwu',
  [string]$PublicSubdir = 'isms',
  [string]$FtpHost = 'homepage.ntu.edu.tw',
  [string]$RemoteDir = 'public_html/isms',
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = 'Stop'

if (-not $Password) {
  throw 'Password is required.'
}

$root = Split-Path -Parent $PSScriptRoot
$healthUrl = "$($BackendBase.TrimEnd('/'))/api/auth/health"

if (-not $SkipHealthCheck) {
  Write-Host "Checking backend health: $healthUrl"
  $health = & curl.exe -ksSf $healthUrl
  if ($LASTEXITCODE -ne 0) {
    throw "Backend health check failed: $healthUrl"
  }
  Write-Host $health
}

Push-Location $root
try {
  & node .\scripts\build-homepage-ntu-package.cjs --mode=full --backend-base=$BackendBase --public-user=$PublicUser --public-subdir=$PublicSubdir
  if ($LASTEXITCODE -ne 0) {
    throw 'build-homepage-ntu-package.cjs failed.'
  }

  & powershell -ExecutionPolicy Bypass -File .\scripts\publish-homepage-ftp.ps1 -Username $Username -Password $Password -LocalDir 'dist/homepage-ntu' -RemoteDir $RemoteDir -FtpHost $FtpHost
  if ($LASTEXITCODE -ne 0) {
    throw 'publish-homepage-ftp.ps1 failed.'
  }
}
finally {
  Pop-Location
}

Write-Host "Homepage HTTPS cutover complete: https://homepage.ntu.edu.tw/~$PublicUser/$PublicSubdir/"
