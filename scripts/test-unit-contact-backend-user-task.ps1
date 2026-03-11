param(
  [string]$TaskName = 'ISMSUnitContactBackendUser'
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
[pscustomobject]@{
  TaskName = $task.TaskName
  State = $task.State
  TriggerCount = @($task.Triggers).Count
  ActionCount = @($task.Actions).Count
} | Format-List
