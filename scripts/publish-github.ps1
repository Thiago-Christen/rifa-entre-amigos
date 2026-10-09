param([string]$CommitMessage = 'Atualiza rifa entre amigos')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Falha em $Executable (código $LASTEXITCODE)." }
}

# Publica somente neste repositório, criado para esta rifa.
$expectedRemote = 'https://github.com/Thiago-Christen/rifa-entre-amigos.git'
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.git'))) {
    Invoke-Checked git @('init', '--initial-branch=main')
    Invoke-Checked git @('config', 'user.name', 'Thiago-Christen')
    Invoke-Checked git @('config', 'user.email', '196941692+Thiago-Christen@users.noreply.github.com')
    Invoke-Checked git @('remote', 'add', 'origin', $expectedRemote)
}
$currentRemote = & git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $currentRemote -ne $expectedRemote) { throw 'O destino Git não é o repositório esperado.' }
Invoke-Checked git @('add', 'public', 'supabase', 'scripts', '.github', '.gitignore', 'package.json', 'README.md')
& git diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
    Invoke-Checked git @('commit', '-m', $CommitMessage)
} elseif ($LASTEXITCODE -ne 0) { throw 'Não foi possível verificar os arquivos preparados.' }
Invoke-Checked git @('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', '-u', 'origin', 'main')
