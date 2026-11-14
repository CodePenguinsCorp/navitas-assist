param([int]$Port = 18080)
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path $PSScriptRoot -Parent
$containerName = 'navitas-nginx-check-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$distPath = Join-Path $repoPath 'frontend/dist/navitas-assist-frontend/browser'
$configPath = Join-Path $repoPath 'frontend/nginx.conf'
$asset = Get-ChildItem -LiteralPath $distPath -Filter 'main-*.js' | Select-Object -First 1
if (-not $asset) { throw 'Execute o build frontend antes desta verificacao.' }
function Get-Headers([string]$Path, [string[]]$Extra = @()) {
    $result = & curl.exe -sS -D - -o NUL @Extra "http://127.0.0.1:$Port$Path"
    if ($LASTEXITCODE -ne 0) { throw 'Falha na consulta HTTP.' }
    return $result -join "`n"
}
try {
    docker run -d --rm --name $containerName --add-host backend:127.0.0.1 -p "127.0.0.1:${Port}:80" -v "${distPath}:/usr/share/nginx/html:ro" -v "${configPath}:/etc/nginx/conf.d/default.conf:ro" navitas-assist-frontend:latest | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar nginx isolado.' }
    Start-Sleep -Seconds 2
    $indexHeaders = Get-Headers '/index.html'
    if ($indexHeaders -notmatch '(?im)^Cache-Control: no-cache\s*$') { throw 'index.html sem no-cache.' }
    foreach ($header in @('X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy: strict-origin-when-cross-origin', 'Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)')) {
        if ($indexHeaders -notmatch $header) { throw "Cabecalho ausente: $header" }
    }
    if ($indexHeaders -match '(?im)^Server: nginx/') { throw 'Versao do servidor exposta.' }
    $assetHeaders = Get-Headers ('/' + $asset.Name) @('-H', 'Accept-Encoding: gzip')
    if ($assetHeaders -notmatch 'Cache-Control: public, max-age=31536000, immutable') { throw 'Asset com hash sem cache imutavel.' }
    if ($assetHeaders -notmatch 'Content-Encoding: gzip') { throw 'JavaScript sem gzip.' }
    $fallbackHeaders = Get-Headers '/rmas'
    if ($fallbackHeaders -notmatch 'Cache-Control: no-cache' -or $fallbackHeaders -notmatch '200 OK') { throw 'Fallback da SPA incorreto.' }
    $limited = $false
    1..8 | ForEach-Object { if ((Get-Headers '/api/auth/login' @('-X', 'POST')) -match '429 Too Many Requests') { $limited = $true } }
    if (-not $limited) { throw 'Limite de login nao rejeitou excesso de requisicoes.' }
    Write-Host 'Nginx: cache, gzip, cabecalhos, SPA e limite de login verificados.'
}
finally {
    docker stop $containerName 2>$null | Out-Null
}
