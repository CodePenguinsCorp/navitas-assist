$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
# Somente senha fictícia. Contêineres descartáveis, sem portas e sem volumes.
$hashes = @(
    (& ./scripts/gen-bcrypt.ps1 -Password 'SenhaFicticiaTeste123!'),
    (& 'C:/Program Files/Git/bin/bash.exe' scripts/gen-bcrypt.sh 'SenhaFicticiaTeste123!')
)
foreach ($hash in $hashes) {
    if ($hash -cnotmatch '^\$2a\$10\$[./A-Za-z0-9]{53}$') { throw 'Hash inválido.' }
    "x:$hash" | docker run --rm -i httpd:2.4-alpine sh -c 'cat > /tmp/passwords; htpasswd -vb /tmp/passwords x SenhaFicticiaTeste123!'
    if ($LASTEXITCODE -ne 0) { throw 'O hash não corresponde à senha fictícia.' }
}
try {
    & ./scripts/gen-bcrypt.ps1 -Password 'curta'
    throw 'Uma senha curta foi aceita.'
} catch {
    if ($_.Exception.Message -notlike 'A senha deve ter*') { throw }
}
& 'C:/Program Files/Git/bin/bash.exe' -c 'bash scripts/gen-bcrypt.sh curta 2>/dev/null'
if ($LASTEXITCODE -eq 0) { throw 'Bash aceitou senha curta.' }
Write-Output 'BCrypt: senha fictícia validada nos dois scripts; senha curta recusada.'
exit 0
