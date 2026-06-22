param(
    [string]$ComposeFile = "compose.prod.yaml",
    [string]$EnvFile = ".env.prod"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ComposeFile)) {
    throw "Arquivo $ComposeFile nao encontrado."
}

if (-not (Test-Path $EnvFile)) {
    throw "Arquivo $EnvFile nao encontrado."
}

docker compose --env-file $EnvFile -f $ComposeFile pull
docker compose --env-file $EnvFile -f $ComposeFile up -d
docker compose --env-file $EnvFile -f $ComposeFile ps
