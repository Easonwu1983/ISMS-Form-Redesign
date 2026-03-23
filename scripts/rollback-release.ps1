param(
    [Parameter(Mandatory = $true)]
    [string]$TargetRef,
    [string]$Remote = 'origin',
    [string]$Branch = 'main',
    [switch]$Push
)

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location $repoRoot

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$Args)
    $output = git @Args
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Args -join ' ') failed."
    }
    return $output
}

$resolvedTarget = (Invoke-Git @('rev-parse', '--verify', "$TargetRef^{commit}")).Trim()
$head = (Invoke-Git @('rev-parse', 'HEAD')).Trim()

& git merge-base --is-ancestor $resolvedTarget $head
if ($LASTEXITCODE -ne 0) {
    throw "TargetRef $resolvedTarget is not an ancestor of HEAD $head."
}

$commitsText = Invoke-Git @('rev-list', '--no-merges', "$resolvedTarget..HEAD")
$commits = @()
if (-not [string]::IsNullOrWhiteSpace($commitsText)) {
    $commits = $commitsText -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}
if (-not $commits -or $commits.Count -eq 0) {
    Write-Host "No commits to rollback. HEAD already matches $resolvedTarget."
    exit 0
}

foreach ($commit in $commits) {
    if ([string]::IsNullOrWhiteSpace($commit)) {
        continue
    }
    Invoke-Git @('revert', '--no-edit', '--no-commit', $commit) | Out-Null
}

$rollbackMessage = "revert: rollback to $resolvedTarget"
Invoke-Git @('commit', '-m', $rollbackMessage) | Out-Null
$newHead = (Invoke-Git @('rev-parse', '--short=12', 'HEAD')).Trim()
Write-Host "Rollback commit created: $newHead"

if ($Push) {
    Invoke-Git @('push', $Remote, $Branch) | Out-Null
    Write-Host "Rollback pushed to $Remote/$Branch"
}
