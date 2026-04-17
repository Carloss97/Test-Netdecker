param(
  [string]$Url = $env:PAGES_URL,
  [switch]$Apply
)

if (-not $Url) {
  Write-Error "PAGES_URL not provided. Set env var PAGES_URL or pass -Url 'https://your-pages.pages.dev'"
  exit 2
}

$endpoint = "$Url/api/admin/normalize-ids"
Write-Output "Running dry-run against $endpoint"
$dry = Invoke-RestMethod -Method Post -Uri $endpoint -ContentType 'application/json' -Body '{}' -ErrorAction Stop
Write-Output "Dry run result:"; $dry | ConvertTo-Json -Depth 5

if ($Apply.IsPresent) {
  Write-Output "Applying changes (confirm=true)"
  $applyResp = Invoke-RestMethod -Method Post -Uri $endpoint -ContentType 'application/json' -Body '{"confirm":true}' -ErrorAction Stop
  Write-Output "Apply result:"; $applyResp | ConvertTo-Json -Depth 5
} else {
  Write-Output "To apply changes re-run with -Apply"
}
