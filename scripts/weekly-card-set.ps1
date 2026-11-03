# Weekly card-set refresh on the owner's machine (season_2026_27 D11).
#
# stats.nba.com (rosters, data/fetch_bio.py) times out from GitHub's runners, so the
# weekly card set runs here instead: up-to-date main -> `npm run refresh:season` ->
# `npm test` -> branch card-set/<version> -> push -> PR with the summary as its body.
# The owner reviews and merges the PR; nothing lands on main from this script.
#
#   pwsh -NoProfile -File scripts/weekly-card-set.ps1            # the real run
#   pwsh -NoProfile -File scripts/weekly-card-set.ps1 -DryRun    # rebuild from snapshots, no git
#
# Needs: a clean working tree on main, `gh` signed in, Python + Node as for the pipeline.
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$log = Join-Path $repo "data/weekly-card-set.log"
Start-Transcript -Path $log -Force | Out-Null

try {
    if ($DryRun) {
        npm run refresh:season -- --skip-scrape
        if ($LASTEXITCODE -ne 0) { throw "refresh:season failed" }
        npm test
        if ($LASTEXITCODE -ne 0) { throw "npm test failed" }
        # SQLite rewrites game.db's bytes even when its data is identical.
        git checkout -- frontend/game.db
        Write-Host "Dry run OK (nothing committed)."
        return
    }

    if (git status --porcelain) { throw "Working tree is not clean; commit or stash first." }
    git checkout main
    git pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

    $summary = Join-Path $env:TEMP "card-set-summary.md"
    npm run refresh:season -- --summary $summary
    if ($LASTEXITCODE -ne 0) { throw "refresh:season failed" }
    npm test
    if ($LASTEXITCODE -ne 0) { throw "npm test failed: not opening a PR" }

    $version = (Select-String -Path frontend/src/engine/cardSetVersion.ts -Pattern "CARD_SET_VERSION = '([^']+)'").Matches[0].Groups[1].Value
    $branch = "card-set/$version"
    git checkout -b $branch
    git add data frontend/src frontend/public frontend/game.db
    git commit -m "chore: card set $version"
    git push -u origin $branch
    gh pr create --base main --head $branch --title "chore: card set $version" --body-file $summary
    git checkout main
} finally {
    Stop-Transcript | Out-Null
}
