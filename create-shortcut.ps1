# Creates a desktop shortcut that launches Pro Listener directly,
# no terminal needed. Run once after `npm install`:
#   powershell -ExecutionPolicy Bypass -File create-shortcut.ps1

$projectDir = $PSScriptRoot
$electron = Join-Path $projectDir "node_modules\electron\dist\electron.exe"

if (-not (Test-Path $electron)) {
    Write-Error "Electron not found — run 'npm install' first."
    exit 1
}

$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop "Pro Listener.lnk"))
$shortcut.TargetPath = $electron
$shortcut.Arguments = "`"$projectDir`""
$shortcut.WorkingDirectory = $projectDir
$shortcut.Description = "Record system audio and transcribe it with WhisperAI"
$shortcut.Save()

Write-Host "Shortcut created on your desktop: Pro Listener"
