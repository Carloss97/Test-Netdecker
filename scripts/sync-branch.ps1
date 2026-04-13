Set-Location -Path 'C:\Users\sarlo\OneDrive\Escritorio\Proyectos\Test-Netdecker'

$branch = git rev-parse --abbrev-ref HEAD 2>$null
Write-Output "Current branch: $branch"

$dirty = git status --porcelain
if ($dirty) {
  Write-Output 'Working tree dirty, stashing changes'
  git stash push -u -m 'autostash: pre-rebase by assistant' | Write-Output
  $stashed = $true
} else {
  $stashed = $false
}

Write-Output 'Fetching origin/main'
git fetch origin main

Write-Output 'Commits on branch not in origin/main:'
$log = git --no-pager log --oneline origin/main..$branch 2>$null
if ($log) { Write-Output $log } else { Write-Output '<none>' }

Write-Output 'Starting rebase onto origin/main'
git rebase origin/main
if ($LASTEXITCODE -ne 0) {
  Write-Output 'Rebase failed. Aborting rebase and restoring stash if any.'
  git rebase --abort 2>$null
  if ($stashed) {
    git stash pop -q 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Output 'stash pop conflict — resolve manually' }
  }
  exit 1
}

Write-Output 'Rebase succeeded. Pushing with --force-with-lease...'
git push --force-with-lease origin $branch
if ($LASTEXITCODE -ne 0) {
  Write-Output 'Push failed. Please push manually or check permissions.'
  if ($stashed) {
    git stash pop -q 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Output 'stash pop conflict — resolve manually' }
  }
  exit 1
}

if ($stashed) {
  git stash pop -q 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Output 'stash pop conflict — resolve manually' }
}

Write-Output 'Sync complete'
