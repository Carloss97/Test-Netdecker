param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$Email,

  [Parameter(Mandatory = $true)]
  [string]$Password,

  [string]$ScopedStore,
  [string]$HeaderStore,
  [string]$ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Normalize-BaseUrl {
  param([string]$BaseUrl)
  $trimmed = $BaseUrl.TrimEnd('/')
  if ($trimmed.ToLower().EndsWith('/api')) {
    return $trimmed
  }
  return "$trimmed/api"
}

function Invoke-ApiJson {
  param(
    [string]$Method,
    [string]$Url,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
    [hashtable]$Headers,
    [object]$Body
  )

  $invokeParams = @{
    Method = $Method
    Uri = $Url
    WebSession = $Session
    Headers = $Headers
    ContentType = 'application/json'
  }

  if ($null -ne $Body) {
    $invokeParams.Body = ($Body | ConvertTo-Json -Depth 8)
  }

  try {
    $response = Invoke-RestMethod @invokeParams
    return @{ ok = $true; status = 200; body = $response }
  }
  catch {
    $status = 0
    $rawBody = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }

    try {
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $rawBody = $reader.ReadToEnd()
      }
    }
    catch {
      $rawBody = $null
    }

    $parsedBody = $null
    if ($rawBody) {
      try {
        $parsedBody = $rawBody | ConvertFrom-Json
      }
      catch {
        $parsedBody = $rawBody
      }
    }

    return @{ ok = $false; status = $status; body = $parsedBody }
  }
}

function New-SessionToken {
  param(
    [string]$Api,
    [string]$LoginEmail,
    [string]$LoginPassword,
    [string]$StoreScope
  )

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $body = @{
    email = $LoginEmail
    password = $LoginPassword
  }

  if ($StoreScope) {
    $body.storeId = $StoreScope
  }

  $login = Invoke-ApiJson -Method 'POST' -Url "$Api/admin/auth/login" -Session $session -Headers @{} -Body $body
  if (-not $login.ok) {
    throw "Login failed (status $($login.status)) for scope '$StoreScope'."
  }

  $token = $login.body.data.token
  if (-not $token) {
    throw "Login response missing token for scope '$StoreScope'."
  }

  return @{ session = $session; token = [string]$token; login = $login.body }
}

function Invoke-ScopeScenario {
  param(
    [string]$Name,
    [string]$Api,
    [string]$Token,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
    [string]$StoreHeader
  )

  $headers = @{ Authorization = "Bearer $Token" }
  if ($StoreHeader) {
    $headers['x-store-id'] = $StoreHeader
  }

  $me = Invoke-ApiJson -Method 'GET' -Url "$Api/admin/auth/me" -Session $Session -Headers $headers -Body $null
  $diag = Invoke-ApiJson -Method 'GET' -Url "$Api/admin/tenant/visibility-diagnostics?threshold=5" -Session $Session -Headers $headers -Body $null
  $inventory = Invoke-ApiJson -Method 'GET' -Url "$Api/listings?take=200" -Session $Session -Headers $headers -Body $null
  $available = Invoke-ApiJson -Method 'GET' -Url "$Api/listings/available" -Session $Session -Headers $headers -Body $null
  $lowStock = Invoke-ApiJson -Method 'GET' -Url "$Api/listings/low-stock?threshold=5" -Session $Session -Headers $headers -Body $null

  $inventoryCount = if ($inventory.ok -and $inventory.body -is [System.Array]) { $inventory.body.Count } else { -1 }
  $availableCount = if ($available.ok -and $available.body -is [System.Array]) { $available.body.Count } else { -1 }
  $lowStockCount = if ($lowStock.ok -and $lowStock.body -is [System.Array]) { $lowStock.body.Count } else { -1 }

  $diagCounts = $null
  if ($diag.ok -and $diag.body -and $diag.body.diagnostics -and $diag.body.diagnostics.counts) {
    $diagCounts = $diag.body.diagnostics.counts
  }

  $checks = @()
  $checks += [pscustomobject]@{
    id = 'me-success'
    pass = $me.ok
    detail = "GET /admin/auth/me status=$($me.status)"
  }

  if ($diagCounts) {
    $checks += [pscustomobject]@{
      id = 'pricing-parity'
      pass = ($availableCount -ge 0 -and [int]$diagCounts.pricingListings -eq $availableCount)
      detail = "diag.pricingListings=$($diagCounts.pricingListings), available=$availableCount"
    }
    $checks += [pscustomobject]@{
      id = 'lowstock-parity'
      pass = ($lowStockCount -ge 0 -and [int]$diagCounts.lowStockListings -eq $lowStockCount)
      detail = "diag.lowStockListings=$($diagCounts.lowStockListings), low-stock=$lowStockCount"
    }

    $inventoryVsPricingOk = $true
    if ([int]$diagCounts.inventoryListings -gt 0 -and [int]$diagCounts.pricingListings -eq 0) {
      $inventoryVsPricingOk = $false
    }

    $checks += [pscustomobject]@{
      id = 'inventory-pricing-sanity'
      pass = $inventoryVsPricingOk
      detail = "diag.inventoryListings=$($diagCounts.inventoryListings), diag.pricingListings=$($diagCounts.pricingListings)"
    }
  }

  return [pscustomobject]@{
    scenario = $Name
    storeHeader = $StoreHeader
    me = @{ ok = $me.ok; status = $me.status; data = $me.body.data }
    diagnostics = @{ ok = $diag.ok; status = $diag.status; data = $diag.body.diagnostics }
    endpointCounts = @{
      inventory = $inventoryCount
      available = $availableCount
      lowStock = $lowStockCount
    }
    checks = $checks
  }
}

$api = Normalize-BaseUrl -BaseUrl $ApiBaseUrl
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $ReportPath) {
  $reportDir = Join-Path (Get-Location) 'scripts/reports'
  if (-not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir | Out-Null
  }
  $ReportPath = Join-Path $reportDir "scope-matrix-$timestamp.json"
}

$globalSession = New-SessionToken -Api $api -LoginEmail $Email -LoginPassword $Password -StoreScope $null

$scenarios = @()
$scenarios += Invoke-ScopeScenario -Name 'global-no-store' -Api $api -Token $globalSession.token -Session $globalSession.session -StoreHeader $null

if ($HeaderStore) {
  $scenarios += Invoke-ScopeScenario -Name 'global-with-header-store' -Api $api -Token $globalSession.token -Session $globalSession.session -StoreHeader $HeaderStore
}

if ($ScopedStore) {
  $scopedSession = New-SessionToken -Api $api -LoginEmail $Email -LoginPassword $Password -StoreScope $ScopedStore
  $scenarios += Invoke-ScopeScenario -Name 'scoped-session-store' -Api $api -Token $scopedSession.token -Session $scopedSession.session -StoreHeader $null
}

$allChecks = @($scenarios | ForEach-Object { $_.checks } | ForEach-Object { $_ })
$passed = @($allChecks | Where-Object { $_.pass }).Count
$total = $allChecks.Count

$report = [pscustomobject]@{
  generatedAt = (Get-Date).ToString('o')
  apiBaseUrl = $api
  scenarios = $scenarios
  summary = @{
    checksPassed = $passed
    checksTotal = $total
    status = if ($total -gt 0 -and $passed -eq $total) { 'pass' } else { 'fail' }
  }
}

$report | ConvertTo-Json -Depth 12 | Set-Content -Path $ReportPath -Encoding UTF8
Write-Output "Scope matrix report saved: $ReportPath"
if ($report.summary.status -ne 'pass') {
  exit 1
}
