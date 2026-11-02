# Load local .env files and run Playwright from apps/admin.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File apps/admin/e2e/run-e2e.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File apps/admin/e2e/run-e2e.ps1 e2e/customers.spec.ts --project=desktop

$ErrorActionPreference = 'Stop'

$adminRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repoRoot = (Resolve-Path (Join-Path $adminRoot '..\..')).Path

function Import-DotEnv {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($raw in Get-Content -LiteralPath $Path) {
    $line = $raw.Trim()
    if (-not $line) { continue }
    if ($line.StartsWith('#')) { continue }

    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { continue }

    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()

    if ($value.Length -ge 2) {
      $q = $value[0]
      if (($q -eq '"' -or $q -eq "'") -and $value[-1] -eq $q) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    $existing = [Environment]::GetEnvironmentVariable($name, 'Process')
    if ([string]::IsNullOrEmpty($existing)) {
      [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
  }
}

Import-DotEnv -Path (Join-Path $repoRoot '.env')
Import-DotEnv -Path (Join-Path $adminRoot '.env')
Import-DotEnv -Path (Join-Path $repoRoot 'apps\web\.env')

if (-not $env:SUPABASE_URL) {
  $env:SUPABASE_URL = 'http://127.0.0.1:54321'
}
if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
}
if (-not $env:ADMIN_TO_WEB_SIGNING_SECRET) {
  $env:ADMIN_TO_WEB_SIGNING_SECRET = 'admin-web-signing-secret-for-local-dev-only-32'
}

if (-not $env:SUPABASE_ANON_KEY -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
  Push-Location $repoRoot
  try {
    $status = & npx supabase status -o env 2>$null | Out-String
  }
  finally {
    Pop-Location
  }

  if ($status -match 'ANON_KEY="([^"]+)"') {
    if (-not $env:SUPABASE_ANON_KEY) {
      $env:SUPABASE_ANON_KEY = $Matches[1]
    }
  }
  if ($status -match 'SERVICE_ROLE_KEY="([^"]+)"') {
    if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
      $env:SUPABASE_SERVICE_ROLE_KEY = $Matches[1]
    }
  }
}

$passThrough = @($args)
Push-Location $adminRoot
try {
  if ($passThrough.Count -gt 0) {
    & pnpm exec playwright test @passThrough
  }
  else {
    & pnpm exec playwright test
  }
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
