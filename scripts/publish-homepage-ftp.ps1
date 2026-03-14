param(
  [string]$Username,
  [string]$Password,
  [string]$LocalDir = 'dist/homepage-ntu',
  [string]$RemoteDir = 'public_html/isms',
  [string]$FtpHost = 'homepage.ntu.edu.tw'
)

$ErrorActionPreference = 'Stop'

if (-not $Username -or -not $Password) {
  throw 'Username and Password are required.'
}

$localRoot = (Resolve-Path $LocalDir).Path
$files = Get-ChildItem -Path $localRoot -Recurse -File | Sort-Object FullName

foreach ($file in $files) {
  $relative = $file.FullName.Substring($localRoot.Length).TrimStart('\\') -replace '\\','/'
  $remoteUrl = "ftp://$FtpHost/$RemoteDir/$relative"
  Write-Host "Uploading $relative"
  & curl.exe --ssl-reqd --disable-epsv --ftp-create-dirs --user "$Username`:$Password" -T "$($file.FullName)" "$remoteUrl" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Upload failed for $relative"
  }
}

Write-Host 'Homepage FTP publish complete.'
