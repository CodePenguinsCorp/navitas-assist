param(
    [string]$MysqlExe = "C:\xampp\mysql\bin\mysql.exe",
    [string]$RootUser = "root",
    [string]$RootPassword = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $MysqlExe)) {
    throw "Nao encontrei o cliente MariaDB/MySQL do XAMPP em '$MysqlExe'."
}

$sql = @"
CREATE DATABASE IF NOT EXISTS navitas_assist;
CREATE USER IF NOT EXISTS 'navitas_app'@'127.0.0.1' IDENTIFIED BY 'navitas123';
GRANT ALL PRIVILEGES ON *.* TO 'navitas_app'@'127.0.0.1';
"@

$args = @(
    "-u", $RootUser,
    "--protocol=TCP",
    "-h", "127.0.0.1",
    "--password=$RootPassword",
    "-e", $sql
)

& $MysqlExe @args

Write-Host "Banco local configurado com sucesso." -ForegroundColor Green
Write-Host "Banco:   navitas_assist"
Write-Host "Usuario: navitas_app"
Write-Host "Senha:   navitas123"
