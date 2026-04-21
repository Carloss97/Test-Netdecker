param(
  [string]$Branch = 'repo-cleanup/remove-artifacts'
)

Write-Output "Creating branch: $Branch"
git checkout -b $Branch

Write-Output "Removing tracked frontend/dist and backend/dist and node_modules from the index (if present)"
git rm -r --cached frontend/dist backend/dist node_modules -f -q 2>$null

Write-Output "Removing files from disk (local)"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue frontend/dist, backend/dist, node_modules

Write-Output "Ensuring .gitignore has entries"
if (-not (Select-String -Path .gitignore -Pattern 'frontend/dist' -Quiet)) { 'frontend/dist' | Out-File -FilePath .gitignore -Append }
if (-not (Select-String -Path .gitignore -Pattern 'backend/dist' -Quiet)) { 'backend/dist' | Out-File -FilePath .gitignore -Append }
if (-not (Select-String -Path .gitignore -Pattern 'node_modules' -Quiet)) { 'node_modules' | Out-File -FilePath .gitignore -Append }

git add .gitignore
git commit -m "chore(cleanup): remove committed build artifacts and ignore them" -q

Write-Output "Cleanup committed. Push the branch when ready: git push -u origin $Branch"
