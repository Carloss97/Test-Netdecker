Set-Location -Path 'C:\Users\sarlo\OneDrive\Escritorio\Proyectos\Test-Netdecker'

$id = (docker ps -a --filter name=db -q) -join ""
if ($id -ne "") { docker rm -f $id }

$id2 = (docker ps -a --filter name=redis -q) -join ""
if ($id2 -ne "") { docker rm -f $id2 }

Write-Output "Starting postgres (db) container on network test-netdecker_default"
docker run -d --network test-netdecker_default --name db -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=tcg_singles_db_new postgres:15

Write-Output "Starting redis container on network test-netdecker_default"
docker run -d --network test-netdecker_default --name redis redis:7

Write-Output "Listing db and redis containers"
docker ps --filter name=db --filter name=redis --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

Start-Sleep -Seconds 6

Write-Output "Restart backend to pick up DB availability"
docker compose -f docker-compose.staging.yml restart backend
Start-Sleep -Seconds 4

Write-Output "Backend logs after restart"
docker compose -f docker-compose.staging.yml logs backend --no-color --tail 200
