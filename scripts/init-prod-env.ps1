param(
    [string]$OutputPath = ".env.prod",
    [string]$BackendImage = "navitas-assist-backend:ci",
    [string]$FrontendImage = "navitas-assist-frontend:ci",
    [string]$AdminUsername = "admin",
    [string]$AdminFullName = "Administrador",
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

$mysqlPassword = New-HexSecret 24
$mysqlRootPassword = New-HexSecret 24
$adminPassword = New-HexSecret 18

$content = @"
# Production Compose
FRONTEND_PORT=80
MYSQL_DATABASE=navitas_assist
MYSQL_USER=navitas_app
MYSQL_PASSWORD=$mysqlPassword
MYSQL_ROOT_PASSWORD=$mysqlRootPassword

# Images published by CD
BACKEND_IMAGE=$BackendImage
FRONTEND_IMAGE=$FrontendImage

# Backend / Spring Boot
APP_ADMIN_USERNAME=$AdminUsername
APP_ADMIN_PASSWORD=$adminPassword
APP_ADMIN_FULL_NAME=$AdminFullName
"@

Set-Content -LiteralPath $OutputPath -Value $content -Encoding UTF8

Write-Host "Arquivo $OutputPath criado com segredos fortes."
Write-Host "Guarde a senha inicial do admin em um cofre antes do primeiro deploy."
