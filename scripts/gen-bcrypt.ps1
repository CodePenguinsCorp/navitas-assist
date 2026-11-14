param([string]$Password)
$ErrorActionPreference = 'Stop'
# Prefira o prompt: argumentos ficam no histórico e na lista de processos.
$secretPointer = [IntPtr]::Zero
try {
    if (-not $PSBoundParameters.ContainsKey('Password')) {
        $secret = Read-Host 'Senha do administrador' -AsSecureString
        $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    }
    $bytes = [Text.Encoding]::UTF8.GetByteCount($Password)
    if ($bytes -lt 6 -or $bytes -gt 72 -or $Password.Contains("`n") -or $Password.Contains("`r")) {
        throw 'A senha deve ter de 6 a 72 bytes UTF-8, sem quebras de linha.'
    }
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = 'docker'
    $info.Arguments = 'run --rm -i httpd:2.4-alpine htpasswd -niBC 10 x'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $process = [Diagnostics.Process]::Start($info)
    $inputBytes = [Text.Encoding]::UTF8.GetBytes($Password + "`n")
    $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
    $process.StandardInput.BaseStream.Flush()
    $process.StandardInput.Close()
    $result = $process.StandardOutput.ReadToEnd().Trim()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0 -or $result -cnotmatch '^x:\$2y\$10\$[./A-Za-z0-9]{53}$') {
        throw 'Não foi possível gerar um hash BCrypt válido com Docker.'
    }
    $result.Substring(2).Replace('$2y$', '$2a$')
} finally {
    $Password = $null
    if ($secretPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    }
    if ($process) { $process.Dispose() }
}
