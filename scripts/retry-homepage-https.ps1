$ErrorActionPreference = 'Stop'

Write-Host 'Step 1: enable firewall rules for 80/443'
& (Join-Path $PSScriptRoot 'enable-https-firewall.ps1')

Write-Host 'Step 2: restart HTTPS proxy'
& (Join-Path $PSScriptRoot 'stop-https-campus-proxy.ps1')
Start-Sleep -Seconds 2
& (Join-Path $PSScriptRoot 'start-https-campus-proxy.ps1')

Write-Host 'Step 3: wait for certificate issuance'
Start-Sleep -Seconds 20

Write-Host 'Step 4: show latest Caddy HTTPS log'
Get-Content (Join-Path (Join-Path $PSScriptRoot '..') '.runtime\https-proxy.err.log') -Tail 120
