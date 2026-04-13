$run=24325809851
$repo='Carloss97/Test-Netdecker'
Set-Location -Path 'C:\Users\sarlo\OneDrive\Escritorio\Proyectos\Test-Netdecker'
$logs = gh run view $run --repo $repo --log
$matches = $logs | Select-String -Pattern 'pushed','pushing','digest','ghcr.io' -SimpleMatch -AllMatches
if ($matches) { $matches | Select-Object -Unique | ForEach-Object { $_.ToString() } } else { Write-Output 'No push-related log lines found.' }
