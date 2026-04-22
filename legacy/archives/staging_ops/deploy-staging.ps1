$root = 'C:\Users\sarlo\OneDrive\Escritorio\Proyectos\Test-Netdecker'
Set-Location -Path $root

Write-Output "== Check Docker service =="
$s = Get-Service -Name com.docker.service -ErrorAction SilentlyContinue
if (-not $s) {
    Write-Output "Service com.docker.service not found"
} else {
    Write-Output ("Service status: " + $s.Status)
    if ($s.Status -ne 'Running') {
        Write-Output "Starting Docker Desktop..."
        if (Test-Path 'C:\Program Files\Docker\Docker\Docker Desktop.exe') {
            Start-Process -FilePath 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -WindowStyle Normal
            Start-Sleep -Seconds 12
        } else {
            Write-Output 'Docker Desktop executable not found'
        }
        try {
            Start-Service -Name com.docker.service -ErrorAction Stop
            Start-Sleep -Seconds 5
            Write-Output 'Started com.docker.service'
        } catch {
            Write-Output ('Start-Service failed: ' + $_.Exception.Message)
        }
    }
}

Write-Output "== Docker info =="
try {
    docker info
} catch {
    Write-Output ('docker info failed: ' + $_.ToString())
}

Write-Output "== Pull GHCR image =="
try {
    docker pull ghcr.io/carloss97/test-netdecker-backend:staging-latest
} catch {
    Write-Output ('docker pull failed: ' + $_.ToString())
    exit 3
}

Write-Output "== Compose pull =="
try {
    docker compose -f docker-compose.staging.yml pull
} catch {
    Write-Output ('compose pull failed: ' + $_.ToString())
}

Write-Output "== Compose up =="
try {
    docker compose -f docker-compose.staging.yml up -d --remove-orphans
} catch {
    Write-Output ('compose up failed: ' + $_.ToString())
    exit 4
}

Write-Output "== Containers =="
docker compose -f docker-compose.staging.yml ps
try {
    docker ps --filter ancestor=ghcr.io/carloss97/test-netdecker-backend:staging-latest --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}"
} catch {
    Write-Output ('docker ps filter failed: ' + $_.ToString())
}

Write-Output "== Waiting 6s for service to start =="
Start-Sleep -Seconds 6

Write-Output "== Run smoke checks =="
$env:API_URL='http://localhost:3333'
try {
    npx tsx scripts/smoke/staging-smoke.ts
    $exit = $LASTEXITCODE
    Write-Output ('Smoke exit code: ' + $exit)
    exit $exit
} catch {
    Write-Output ('Smoke checks failed: ' + $_.ToString())
    exit 5
}
