$root = 'C:\Users\sarlo\OneDrive\Escritorio\Proyectos\Test-Netdecker'
Set-Location -Path $root

Write-Output "== Shutting down WSL (if running) =="
try {
    wsl --shutdown
    Write-Output "WSL shutdown invoked"
} catch {
    Write-Output ("wsl --shutdown failed: " + $_.ToString())
}

Start-Sleep -Seconds 5

Write-Output "== Restarting Docker service =="
try {
    Stop-Service -Name com.docker.service -ErrorAction SilentlyContinue
} catch { }
try {
    Start-Service -Name com.docker.service -ErrorAction Stop
    Write-Output "Started com.docker.service"
} catch {
    Write-Output ('Start-Service failed: ' + $_.Exception.Message)
    exit 2
}
Start-Sleep -Seconds 8

Write-Output "== docker info =="
try {
    docker info
} catch {
    Write-Output ('docker info failed: ' + $_.ToString())
    exit 3
}
