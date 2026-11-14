param(
    [string]$OutputPath = ".env.prod",
    [string]$BackendImage = "navitas-assist-backend:ci",
    [string]$FrontendImage = "navitas-assist-frontend:ci",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if ((Test-Path $OutputPath) -and -not $Force) {
    throw "Arquivo $OutputPath ja existe. Use -Force para recriar."
}

function New-HexSecret {
    param([int]$ByteCount = 32)

    $bytes = New-Object byte[] $ByteCount
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        return -join ($bytes | ForEach-Object { $_.ToString("x2") })
    }
    finally {
        $rng.Dispose()
    }
}

$postgresPassword = New-HexSecret 24

$content = @"
# Production Compose
FRONTEND_PORT=80
POSTGRES_DB=navitas_assist
POSTGRES_USER=navitas_app
POSTGRES_PASSWORD=$postgresPassword

# Images published by CD
BACKEND_IMAGE=$BackendImage
FRONTEND_IMAGE=$FrontendImage
"@

Set-Content -LiteralPath $OutputPath -Value $content -Encoding UTF8

Write-Host "Arquivo $OutputPath criado com segredos fortes."
Write-Host "As contas da aplicacao sao gerenciadas no banco e nao sao criadas pelo deploy."
