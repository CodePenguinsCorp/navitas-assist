param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$DatabaseOnly,
    [switch]$RemoveVolumes
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSCommandPath
$composeFile = Join-Path $repoRoot "compose.yaml"

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

    return @($selectedServices)
}

function Invoke-DockerCompose {
    param([string[]]$ComposeArgs)

    $dockerArgs = @("compose") + $ComposeArgs
    & docker @dockerArgs

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao executar 'docker $($dockerArgs -join ' ')'."
    }
}

function Get-ComposeContainerIds {
    param(
        [string[]]$Services,
        [switch]$IncludeStopped
    )

    $dockerArgs = @("compose", "ps")
    if ($IncludeStopped) {
        $dockerArgs += "--all"
    }

    $dockerArgs += "-q"
    $dockerArgs += $Services

    $output = & docker @dockerArgs

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao consultar containers com 'docker $($dockerArgs -join ' ')'."
    }

    return @($output | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() })
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

Require-Path -Path $composeFile -FriendlyName "Arquivo compose"
Require-Command -CommandName "docker" -FriendlyName "Docker"

$services = Resolve-ServiceSelection

if ($RemoveVolumes -and $services.Count -gt 0) {
    throw "Use -RemoveVolumes apenas ao derrubar a stack completa."
}

if ($services.Count -eq 0) {
    $composeArgs = @("down")
    if ($RemoveVolumes) {
        $composeArgs += "-v"
    }

    Write-Host "Encerrando stack Docker completa..." -ForegroundColor Yellow
    Invoke-DockerCompose -ComposeArgs $composeArgs
    Write-Host "Stack encerrada." -ForegroundColor Green
    Write-Host "Para subir novamente: $repoRoot\run-local.ps1" -ForegroundColor DarkGray
    return
}

if ($DatabaseOnly) {
    Write-Host "Parando o MySQL Docker selecionado..." -ForegroundColor Yellow
}
else {
    Write-Host "Parando servicos Docker selecionados..." -ForegroundColor Yellow
}
Invoke-DockerCompose -ComposeArgs (@("stop") + $services)

$existingStoppedContainers = Get-ComposeContainerIds -Services $services -IncludeStopped
if ($existingStoppedContainers.Count -gt 0) {
    Invoke-DockerCompose -ComposeArgs (@("rm", "-f") + $services)
}

Write-Host ""
Show-RunningServices
Write-Host ""
Write-Host "Para subir novamente: $repoRoot\run-local.ps1" -ForegroundColor DarkGray
