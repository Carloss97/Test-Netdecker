# PowerShell script to sync local `main` with `origin/main` safely.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\update-main.ps1

$ErrorActionPreference = 'Stop'

Write-Host "--- Update local 'main' from origin/main ---"

# Ensure working directory is clean
$status = git status --porcelain
if (-not [string]::IsNullOrWhiteSpace($status)) {
    Write-Host "Worktree has uncommitted changes. Please stash or commit before running this script." -ForegroundColor Yellow
    Write-Host $status
    exit 2
}

# Check current branch
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "Current branch: $branch"

if ($branch -ne 'main') {
    Write-Host "Checking out 'main'..."
    git checkout main
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to checkout 'main'"; exit 3 }
}

Write-Host "Fetching origin..."
git fetch origin --prune
if ($LASTEXITCODE -ne 0) { Write-Error "git fetch failed"; exit 4 }

# Safely parse rev-list output using regex to avoid whitespace parsing issues
$rev = git rev-list --left-right --count origin/main...main 2>$null
if ($rev -match '^(?:\s*)(\d+)(?:\s+)(\d+)(?:\s*)$') {
    $behind = [int]$matches[1]
    $ahead = [int]$matches[2]
} else {
    Write-Host "Unexpected output from git rev-list: '$rev'" -ForegroundColor Yellow
    $behind = 0; $ahead = 0
}

Write-Host "BEHIND:$behind AHEAD:$ahead"

if ($behind -gt 0 -and $ahead -eq 0) {
    Write-Host "Fast-forwarding local main from origin/main..."
    git pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) { Write-Error "Fast-forward failed"; exit 5 }
} elseif ($ahead -gt 0 -and $behind -eq 0) {
    Write-Host "Local main is ahead of origin/main; pushing to origin..."
    git push origin main
    if ($LASTEXITCODE -ne 0) { Write-Error "Push failed"; exit 6 }
} elseif ($ahead -gt 0 -and $behind -gt 0) {
    Write-Host "Branches diverged; attempting rebase of local main onto origin/main..."
    git pull --rebase origin main
    if ($LASTEXITCODE -ne 0) { Write-Error "Rebase failed. Manual conflict resolution required."; exit 7 }
    Write-Host "Rebase succeeded; pushing to origin..."
    git push origin main
    if ($LASTEXITCODE -ne 0) { Write-Error "Push after rebase failed"; exit 8 }
} else {
    Write-Host "main is up-to-date with origin/main"
}

Write-Host "--- FINAL STATUS ---"
git rev-parse --abbrev-ref HEAD
git status --porcelain
git log --oneline -n 5

Write-Host "Done."
