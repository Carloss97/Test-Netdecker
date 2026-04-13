$run=24325809851
$repo='Carloss97/Test-Netdecker'
Set-Location -Path 'C:\Users\sarlo\OneDrive\Escritorio\Proyectos\Test-Netdecker'
$i=0
while ($i -lt 36) {
  $obj = gh run view $run --repo $repo --json status,conclusion | ConvertFrom-Json
  Write-Output ("poll:{0} status={1} conclusion={2}" -f $i, $obj.status, $obj.conclusion)
  if ($obj.status -eq 'completed') { break }
  Start-Sleep -Seconds 5
  $i = $i + 1
}
gh run view $run --repo $repo --json status,conclusion,url,html_url
