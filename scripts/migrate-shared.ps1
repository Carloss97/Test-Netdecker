param(
  [string]$From1 = 'legacy/functions/_shared',
  [string]$From2 = 'legacy/functions_disabled/_shared',
  [string]$To = 'backend/src/functions/_shared'
)

if (-not (Test-Path $To)) { New-Item -ItemType Directory -Path $To -Force | Out-Null }

# Copy from primary legacy functions folder
if (Test-Path $From1) {
  Get-ChildItem -Path $From1 -Filter '*.js' -File | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $To $_.Name) -Force
  }
}

# Copy from functions_disabled for any files not present
if (Test-Path $From2) {
  Get-ChildItem -Path $From2 -Filter '*.js' -File | ForEach-Object {
    $dest = Join-Path $To $_.Name
    if (-not (Test-Path $dest)) {
      Copy-Item -Path $_.FullName -Destination $dest -Force
    }
  }
}

# Stage and commit the copied files
git add $To 2>$null
try { git commit -m "chore(migrate): copy legacy _shared implementations into backend/src/functions/_shared" -q } catch { }

Write-Output "migration complete"
