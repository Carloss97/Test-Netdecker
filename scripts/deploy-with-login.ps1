$root = 'C:\Users\sarlo\OneDrive\Escritorio\Proyectos\Test-Netdecker'
Set-Location -Path $root

Write-Output "== GHCR Login step =="
try {
    docker logout ghcr.io | Out-Null
} catch { }

if (-not $env:GHCR_TOKEN) {
    Write-Output 'GHCR_TOKEN not found in environment; aborting login.'
    exit 2
}

Write-Output 'Logging into ghcr.io using GHCR_TOKEN from environment'
try {
    echo $env:GHCR_TOKEN | docker login ghcr.io -u Carloss97 --password-stdin
} catch {
    Write-Output ('docker login failed: ' + $_.ToString())
    exit 3
}

Write-Output 'Login attempt finished; invoking deploy-staging.ps1'
& "$root\scripts\deploy-staging.ps1"
