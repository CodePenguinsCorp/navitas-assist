param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$DatabaseOnly,
    [switch]$Build
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSCommandPath
$composeFile = Join-Path $repoRoot "compose.yaml"
$envFile = Join-Path $repoRoot ".env"
$envExampleFile = Join-Path $repoRoot ".env.example"

function Require-Path {
    param(
        [string]$Path,
        [string]$FriendlyName
    )

    if (-not (Test-Path $Path)) {
        throw "$FriendlyName nao foi encontrado em '$Path'."
    }
}

function Require-Command {
    param(
        [string]$CommandName,
        [string]$FriendlyName
    )

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "$FriendlyName nao foi encontrado no PATH."
    }
}

function Resolve-ServiceSelection {
    $selectedServices = @()

    if ($BackendOnly) {
        $selectedServices += "backend"
    }

    if ($FrontendOnly) {
        $selectedServices += "frontend"
    }

    if ($DatabaseOnly) {
        $selectedServices += "mysql"
    }

    if ($selectedServices.Count -gt 1) {
        throw "Use apenas um dos parametros: -BackendOnly, -FrontendOnly ou -DatabaseOnly."
    }

    if ($selectedServices.Count -eq 0) {
        return @("mysql", "backend", "frontend")
    }

    return @($selectedServices)
}

function Get-EnvironmentSettings {
    $settings = @{}
    $sourceFile = $null

    if (Test-Path $envFile) {
        $sourceFile = $envFile
    }
    elseif (Test-Path $envExampleFile) {
        $sourceFile = $envExampleFile
    }

    if (-not $sourceFile) {
        return $settings
    }

    foreach ($line in Get-Content $sourceFile) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $key = $trimmed.Substring(0, $separatorIndex).Trim()
        $value = $trimmed.Substring($separatorIndex + 1).Trim()
        $settings[$key] = $value
    }

    return $settings
}

function Get-ConfiguredValue {
    param(
        [hashtable]$Settings,
        [string]$Key,
        [string]$DefaultValue
    )

    if ($Settings.ContainsKey($Key) -and $Settings[$Key]) {
        return $Settings[$Key]
    }

    return $DefaultValue
}

function Invoke-DockerCompose {
    param([string[]]$ComposeArgs)

    $dockerArgs = @("compose") + $ComposeArgs
    & docker @dockerArgs

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao executar 'docker $($dockerArgs -join ' ')'."
    }
}

function Get-RunningComposeServices {
    $dockerArgs = @("compose", "ps", "--services", "--filter", "status=running")
    $output = & docker @dockerArgs

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao consultar servicos em execucao com 'docker $($dockerArgs -join ' ')'."
    }

    return @($output | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() })
}

function Show-RunningServices {
    $runningServices = Get-RunningComposeServices

    Write-Host "Servicos em execucao:" -ForegroundColor Cyan
    if ($runningServices.Count -eq 0) {
        Write-Host "Nenhum servico Docker em execucao."
        return
    }

    Write-Host ($runningServices -join ", ")
}

function Get-ComposeContainerIds {
    param([string[]]$Services)

    $dockerArgs = @("compose", "ps", "-q") + $Services
    $output = & docker @dockerArgs

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao consultar containers com 'docker $($dockerArgs -join ' ')'."
    }

    return @($output | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() })
}

function Restart-ExistingServices {
    param(
        [string[]]$Services,
        [bool]$RestartWholeStack
    )

    $containerIds = Get-ComposeContainerIds -Services $Services
    if ($containerIds.Count -eq 0) {
        return
    }

    if ($RestartWholeStack) {
        Write-Host "Stack Docker ja encontrada. Reiniciando antes de subir novamente..." -ForegroundColor Yellow
        Invoke-DockerCompose -ComposeArgs @("down")
        return
    }

    Write-Host "Servicos Docker ja existentes encontrados. Reiniciando os alvos..." -ForegroundColor Yellow
    Invoke-DockerCompose -ComposeArgs (@("stop") + $Services)
    Invoke-DockerCompose -ComposeArgs (@("rm", "-f") + $Services)
}

Require-Path -Path $composeFile -FriendlyName "Arquivo compose"
Require-Command -CommandName "docker" -FriendlyName "Docker"

$services = Resolve-ServiceSelection
$settings = Get-EnvironmentSettings
$restartWholeStack = -not ($BackendOnly -or $FrontendOnly -or $DatabaseOnly)

$frontendPort = Get-ConfiguredValue -Settings $settings -Key "FRONTEND_PORT" -DefaultValue "4200"
$backendPort = Get-ConfiguredValue -Settings $settings -Key "BACKEND_PORT" -DefaultValue "8080"
$mysqlPort = Get-ConfiguredValue -Settings $settings -Key "MYSQL_PORT" -DefaultValue "3306"
$mysqlDatabase = Get-ConfiguredValue -Settings $settings -Key "MYSQL_DATABASE" -DefaultValue "navitas_assist"
$mysqlUser = Get-ConfiguredValue -Settings $settings -Key "MYSQL_USER" -DefaultValue "navitas_app"
$healthUrl = "http://localhost:$backendPort/health"

Restart-ExistingServices -Services $services -RestartWholeStack $restartWholeStack

$composeArgs = @("up", "-d")
if ($Build) {
    $composeArgs += "--build"
}

$composeArgs += $services

Write-Host "Subindo servicos Docker..." -ForegroundColor Green
Invoke-DockerCompose -ComposeArgs $composeArgs

Write-Host ""
Show-RunningServices

Write-Host ""

if ($DatabaseOnly) {
    Write-Host "Banco Docker em execucao:" -ForegroundColor Cyan
    Write-Host "Host:     127.0.0.1"
    Write-Host "Porta:    $mysqlPort"
    Write-Host "Banco:    $mysqlDatabase"
    Write-Host "Usuario:  $mysqlUser"
    Write-Host ""
    Write-Host "Proximo passo: rode o backend manualmente ou use .\run-local.ps1 para subir a stack completa." -ForegroundColor DarkGray
    Write-Host "Parar banco: .\stop-local.ps1 -DatabaseOnly" -ForegroundColor DarkGray
    return
}

if ($BackendOnly) {
    Write-Host "Backend Docker em execucao:" -ForegroundColor Cyan
    Write-Host "Backend:  http://localhost:$backendPort"
    Write-Host "API:      http://localhost:$backendPort/api"
    Write-Host "Health:   $healthUrl"
    Write-Host "Banco:    127.0.0.1:$mysqlPort ($mysqlDatabase)"
    Write-Host ""
    Write-Host "Parar backend: .\stop-local.ps1 -BackendOnly" -ForegroundColor DarkGray
    return
}

Write-Host "URLs do projeto:" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:$frontendPort"
Write-Host "Backend:  http://localhost:$backendPort"
Write-Host "API:      http://localhost:$backendPort/api"
Write-Host "Health:   $healthUrl"
Write-Host ""
Write-Host "Banco Docker:" -ForegroundColor Cyan
Write-Host "Host:     127.0.0.1"
Write-Host "Porta:    $mysqlPort"
Write-Host "Banco:    $mysqlDatabase"
Write-Host "Usuario:  $mysqlUser"
Write-Host ""
Write-Host "Se voce alterou codigo do backend/frontend, rode com rebuild: .\run-local.ps1 -Build" -ForegroundColor DarkGray
if ($FrontendOnly) {
    Write-Host "Observacao: ao subir apenas o frontend, o Docker Compose tambem sobe backend e banco como dependencias." -ForegroundColor DarkGray
}
Write-Host "Parar tudo: .\stop-local.ps1" -ForegroundColor DarkGray
