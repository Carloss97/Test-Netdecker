# Script to delete remote branches on origin that are already merged into origin/main
# Review the list below before running. This script prompts before deleting.

$branches = @(
    "backup/local-before-cleanup-",
    "backup/local-main-before-force-",
    "backup/main-before-cleanup-",
    "backup/main-before-force-"
)

Write-Host "Remote branches candidate for deletion on 'origin':"
foreach ($b in $branches) { Write-Host " - $b" }

$confirm = Read-Host "Type 'yes' to delete these branches from origin"
if ($confirm -eq 'yes') {
    foreach ($b in $branches) {
        Write-Host "Deleting origin/$b..."
        git push origin --delete $b
    }
    Write-Host "Done."
} else {
    Write-Host "Aborted. No remote branches were deleted."
}