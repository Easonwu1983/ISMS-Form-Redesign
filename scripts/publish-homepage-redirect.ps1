param(
  [string]$Username = 'easonwu',
  [string]$Password,
  [string]$RedirectTarget = 'http://140.112.3.65:8088/',
  [string]$PublicUser = 'easonwu',
  [string]$PublicSubdir = 'isms',
  [string]$FtpHost = 'homepage.ntu.edu.tw',
  [string]$RemoteDir = 'public_html/isms'
)

$ErrorActionPreference = 'Stop'

if (-not $Password) {
  throw 'Password is required.'
}

$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
  & node .\scripts\build-homepage-ntu-package.cjs --mode=redirect --redirect-target=$RedirectTarget --public-user=$PublicUser --public-subdir=$PublicSubdir
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

Write-Host "Homepage redirect publish complete: http://homepage.ntu.edu.tw/~$PublicUser/$PublicSubdir/"
