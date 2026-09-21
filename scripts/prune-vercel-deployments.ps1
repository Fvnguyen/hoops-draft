<#
.SYNOPSIS
  Prune old Vercel deployments so the team stays under the Deployment Storage quota.

.DESCRIPTION
  DRY RUN by default: lists what would be kept and deleted, deletes nothing.
  Pass -Execute to delete. Deleting a deployment is PERMANENT (its URL stops working and it
  can no longer be a rollback target).

  Per project it KEEPS: the deployment production currently points at, the newest
  -KeepProduction READY production deployments (rollback targets), and everything younger
  than -KeepHours. Everything else is deleted, previews included.

  Auth: a Vercel access token in $env:VERCEL_TOKEN (vercel.com -> Account Settings ->
  Tokens; scope it to the team, give it a short expiry, delete it afterwards). The token is
  read from the environment only - never pass it as an argument or commit it.

.EXAMPLE
  $env:VERCEL_TOKEN = Read-Host -MaskInput 'Vercel token'
  ./scripts/prune-vercel-deployments.ps1                 # dry run
  ./scripts/prune-vercel-deployments.ps1 -Execute        # delete
#>
[CmdletBinding()]
param(
  [string]   $TeamId         = 'team_4xiYVVMvXuYMU83AxUsu6dM5',          # fvnguyen1
  [string[]] $Projects       = @('hoops-draft', 'tg-training'),
  [int]      $KeepProduction = 4,
  [int]      $KeepHours      = 48,
  [switch]   $Execute
)

$ErrorActionPreference = 'Stop'
if (-not $env:VERCEL_TOKEN) { throw 'Set $env:VERCEL_TOKEN first (see the help text: Get-Help ./prune-vercel-deployments.ps1).' }
$headers = @{ Authorization = "Bearer $($env:VERCEL_TOKEN)" }
$api     = 'https://api.vercel.com'
$cutoff  = [DateTimeOffset]::UtcNow.AddHours(-$KeepHours).ToUnixTimeMilliseconds()

function Get-AllDeployments([string] $projectId) {
  $all = @(); $until = $null
  do {
    $url = "$api/v6/deployments?teamId=$TeamId&projectId=$projectId&limit=100"
    if ($until) { $url += "&until=$until" }
    $page  = Invoke-RestMethod -Uri $url -Headers $headers
    $all  += $page.deployments
    $until = $page.pagination.next
  } while ($until)
  return $all
}

$grandDelete = 0
foreach ($name in $Projects) {
  $project = Invoke-RestMethod -Uri "$api/v9/projects/$($name)?teamId=$TeamId" -Headers $headers
  $liveId  = $project.targets.production.id
  $deps    = Get-AllDeployments $project.id | Sort-Object created -Descending

  $keep = [System.Collections.Generic.HashSet[string]]::new()
  if ($liveId) { [void] $keep.Add($liveId) }
  $deps | Where-Object { $_.target -eq 'production' -and $_.state -eq 'READY' } |
    Select-Object -First $KeepProduction | ForEach-Object { [void] $keep.Add($_.uid) }
  $deps | Where-Object { $_.created -ge $cutoff } | ForEach-Object { [void] $keep.Add($_.uid) }

  $delete = @($deps | Where-Object { -not $keep.Contains($_.uid) })
  $grandDelete += $delete.Count
  Write-Host "`n== $name : $($deps.Count) deployments, keep $($deps.Count - $delete.Count), delete $($delete.Count) (live: $liveId)"

  $deps | ForEach-Object {
    [pscustomobject]@{
      Action  = if ($keep.Contains($_.uid)) { 'keep' } else { 'DELETE' }
      Created = [DateTimeOffset]::FromUnixTimeMilliseconds($_.created).ToString('yyyy-MM-dd HH:mm')
      Target  = if ($_.target) { $_.target } else { 'preview' }
      State   = $_.state
      Branch  = $_.meta.githubCommitRef
      Id      = $_.uid
    }
  } | Format-Table -AutoSize | Out-String -Width 200 | Write-Host

  if ($Execute) {
    foreach ($d in $delete) {
      try {
        Invoke-RestMethod -Method Delete -Uri "$api/v13/deployments/$($d.uid)?teamId=$TeamId" -Headers $headers | Out-Null
        Write-Host "deleted $($d.uid)"
      } catch {
        Write-Warning "could not delete $($d.uid): $($_.Exception.Message)"
      }
    }
  }
}

if ($Execute) { Write-Host "`nDone. Storage figures in the dashboard can lag behind deletions." }
else { Write-Host "`nDRY RUN: nothing deleted. $grandDelete deployment(s) would be removed. Re-run with -Execute to delete (permanent)." }
