$ErrorActionPreference = 'Stop'
$repoPath = Split-Path $PSScriptRoot -Parent
$outputDirectory = Join-Path $repoPath 'output'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$outputPath = Join-Path $outputDirectory ('env-permission-test-' + [guid]::NewGuid().ToString('N'))
try {
    & (Join-Path $PSScriptRoot 'init-prod-env.ps1') -OutputPath $outputPath
    $acl = Get-Acl -LiteralPath $outputPath
    if (-not $acl.AreAccessRulesProtected) { throw 'O arquivo herda permissoes do diretorio.' }
    $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($rules.Count -ne 1 -or $rules[0].IdentityReference -ne $currentSid -or
        $rules[0].AccessControlType -ne 'Allow' -or $rules[0].FileSystemRights -ne 'FullControl') {
        throw 'O arquivo permite acesso alem do usuario atual.'
    }
    & (Join-Path $PSScriptRoot 'init-prod-env.ps1') -OutputPath $outputPath -Force
    $forcedAcl = Get-Acl -LiteralPath $outputPath
    if (-not $forcedAcl.AreAccessRulesProtected -or $forcedAcl.Access.Count -ne 1) {
        throw 'A recriacao nao preserva o acesso restrito.'
    }
    Write-Host 'ACL de criacao e recriacao restrita ao usuario atual.'
}
finally {
    if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath }
}
