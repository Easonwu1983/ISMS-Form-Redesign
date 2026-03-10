param(
  [Parameter(Position = 0)]
  [ValidateSet('help', 'doctor', 'login', 'list', 'create-project-notebook', 'preview-context', 'seed-dev-context', 'capture-file', 'project-query', 'research-start', 'research-import')]
  [string]$Action = 'help',
  [string]$Notebook,
  [string]$Title,
  [string]$Alias = 'isms-form-redesign-dev',
  [string]$Question,
  [string]$Query,
  [string]$FilePath,
  [ValidateSet('fast', 'deep')]
  [string]$Mode = 'fast',
  [ValidateSet('web', 'drive')]
  [string]$Source = 'web',
  [string]$TaskId,
  [string]$Profile
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workflowDoc = Join-Path $projectRoot 'docs\notebooklm-dev-workflow.md'
$briefPath = Join-Path $projectRoot 'docs\notebooklm-dev-brief.md'
$cliScript = Join-Path $PSScriptRoot 'notebooklm-cli.ps1'

function Invoke-Nlm {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  & $cliScript @Args
  return $LASTEXITCODE
}

function Invoke-NlmCapture {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  $output = & $cliScript @Args 2>&1
  $exitCode = $LASTEXITCODE
  return @{
    Output = @($output)
    ExitCode = $exitCode
  }
}

function Get-ProfileArgs {
  if ([string]::IsNullOrWhiteSpace($Profile)) {
    return @()
  }

  return @('--profile', $Profile)
}

function Resolve-NotebookValue {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw 'Notebook is required. Pass -Notebook <alias-or-id>.'
  }

  return $Value.Trim()
}

function Get-ProjectBriefText {
  if (-not (Test-Path $briefPath -PathType Leaf)) {
    throw "Project brief not found: $briefPath"
  }

  return [System.IO.File]::ReadAllText($briefPath)
}

function Resolve-ProjectFile {
  param([string]$Candidate)

  if ([string]::IsNullOrWhiteSpace($Candidate)) {
    throw 'FilePath is required.'
  }

  if ([System.IO.Path]::IsPathRooted($Candidate)) {
    $resolved = $Candidate
  } else {
    $resolved = Join-Path $projectRoot $Candidate
  }

  $resolved = [System.IO.Path]::GetFullPath($resolved)

  if (-not (Test-Path $resolved -PathType Leaf)) {
    throw "File not found: $resolved"
  }

  return $resolved
}

function Get-RelativeProjectPath {
  param([string]$ResolvedPath)

  $uriRoot = [Uri]($projectRoot.TrimEnd('\') + '\')
  $uriFile = [Uri]$ResolvedPath
  return [Uri]::UnescapeDataString($uriRoot.MakeRelativeUri($uriFile).ToString()).Replace('/', '\')
}

function Get-FileAsNotebookText {
  param([string]$ResolvedPath)

  $text = [System.IO.File]::ReadAllText($ResolvedPath)
  if ($text.Length -gt 18000) {
    $text = @(
      'NOTE: This file was truncated to fit a single NotebookLM text source.'
      ''
      $text.Substring(0, 18000)
    ) -join "`n"
  }

  return $text
}

function Add-NotebookTextSource {
  param(
    [string]$NotebookValue,
    [string]$TitleValue,
    [string]$TextValue
  )

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'isms-notebooklm'
  if (-not (Test-Path $tempRoot -PathType Container)) {
    [System.IO.Directory]::CreateDirectory($tempRoot) | Out-Null
  }

  $safeName = ($TitleValue -replace '[<>:"/\\|?*]', '-').Trim()
  if ([string]::IsNullOrWhiteSpace($safeName)) {
    $safeName = [System.Guid]::NewGuid().ToString()
  }

  if ($safeName.Length -gt 80) {
    $safeName = $safeName.Substring(0, 80).Trim()
  }

  $tempFile = Join-Path $tempRoot ($safeName + '.txt')

  try {
    [System.IO.File]::WriteAllText($tempFile, $TextValue, [System.Text.Encoding]::UTF8)
    $cmd = @('source', 'add', $NotebookValue, '--file', $tempFile, '--title', $TitleValue) + (Get-ProfileArgs)
    return (Invoke-Nlm @cmd)
  } finally {
    if (Test-Path $tempFile -PathType Leaf) {
      Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }
  }
}

switch ($Action) {
  'help' {
    @"
NotebookLM dev workflow for this project

Usage:
  .\notebooklm-workflow.cmd doctor
  .\notebooklm-workflow.cmd login
  .\notebooklm-workflow.cmd create-project-notebook
  .\notebooklm-workflow.cmd seed-dev-context -Notebook $Alias
  .\notebooklm-workflow.cmd capture-file -Notebook $Alias -FilePath app.js
  .\notebooklm-workflow.cmd project-query -Notebook $Alias -Question "Summarize the training module flow"
  .\notebooklm-workflow.cmd research-start -Notebook $Alias -Query "NTU information security training signoff workflow"

See: $workflowDoc
"@ | Write-Host
    exit 0
  }
  'doctor' {
    $result = Invoke-NlmCapture 'doctor' '--verbose'
    $result.Output | Write-Host
    exit $result.ExitCode
  }
  'login' {
    $cmd = @('login') + (Get-ProfileArgs)
    $exitCode = Invoke-Nlm @cmd
    exit $exitCode
  }
  'list' {
    $cmd = @('notebook', 'list') + (Get-ProfileArgs)
    $exitCode = Invoke-Nlm @cmd
    exit $exitCode
  }
  'create-project-notebook' {
    if ([string]::IsNullOrWhiteSpace($Title)) {
      $Title = 'ISMS Form Redesign Dev Workflow'
    }

    $cmd = @('notebook', 'create', $Title) + (Get-ProfileArgs)
    $result = Invoke-NlmCapture @cmd
    $result.Output | Write-Host
    if ($result.ExitCode -ne 0) {
      exit $result.ExitCode
    }

    $joined = ($result.Output -join "`n")
    $match = [regex]::Match($joined, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
    if ($match.Success) {
      $aliasCmd = @('alias', 'set', $Alias, $match.Value, '--type', 'notebook') + (Get-ProfileArgs)
      $aliasResult = Invoke-NlmCapture @aliasCmd
      $aliasResult.Output | Write-Host
      if ($aliasResult.ExitCode -eq 0) {
        Write-Host "Project alias ready: $Alias"
      }
    } else {
      Write-Warning 'Notebook created, but no notebook id was detected in the output. Set the alias manually if needed.'
    }

    exit 0
  }
  'preview-context' {
    Get-ProjectBriefText | Write-Host
    exit 0
  }
  'seed-dev-context' {
    $notebookValue = Resolve-NotebookValue $Notebook
    $briefText = Get-ProjectBriefText
    $exitCode = Add-NotebookTextSource -NotebookValue $notebookValue -TitleValue 'Project brief: ISMS Form Redesign' -TextValue $briefText
    exit $exitCode
  }
  'capture-file' {
    $notebookValue = Resolve-NotebookValue $Notebook
    $resolvedFile = Resolve-ProjectFile $FilePath
    $relativePath = Get-RelativeProjectPath $resolvedFile
    $fileText = Get-FileAsNotebookText $resolvedFile
    $sourceTitle = "Project file: $relativePath"
    $exitCode = Add-NotebookTextSource -NotebookValue $notebookValue -TitleValue $sourceTitle -TextValue $fileText
    exit $exitCode
  }
  'project-query' {
    $notebookValue = Resolve-NotebookValue $Notebook
    if ([string]::IsNullOrWhiteSpace($Question)) {
      throw 'Question is required. Pass -Question "..."'
    }

    $cmd = @('notebook', 'query', $notebookValue, $Question) + (Get-ProfileArgs)
    $exitCode = Invoke-Nlm @cmd
    exit $exitCode
  }
  'research-start' {
    $notebookValue = Resolve-NotebookValue $Notebook
    if ([string]::IsNullOrWhiteSpace($Query)) {
      throw 'Query is required. Pass -Query "..."'
    }

    $cmd = @('research', 'start', $Query, '--source', $Source, '--mode', $Mode, '--notebook-id', $notebookValue) + (Get-ProfileArgs)
    $exitCode = Invoke-Nlm @cmd
    exit $exitCode
  }
  'research-import' {
    $notebookValue = Resolve-NotebookValue $Notebook
    $cmd = @('research', 'import', $notebookValue)
    if (-not [string]::IsNullOrWhiteSpace($TaskId)) {
      $cmd += $TaskId
    }

    $cmd += Get-ProfileArgs
    $exitCode = Invoke-Nlm @cmd
    exit $exitCode
  }
}
