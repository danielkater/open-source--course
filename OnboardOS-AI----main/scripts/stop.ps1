$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimePath = Join-Path $projectRoot '.runtime.json'
if (!(Test-Path -LiteralPath $runtimePath)) { Write-Output 'No project runtime record found.'; exit }
$runtime = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
if ($runtime.root -ne $projectRoot) { throw 'Runtime root mismatch. Refusing to stop processes.' }
foreach ($entry in @(@{id=$runtime.apiPid;start=$runtime.apiStart;kind='api'},@{id=$runtime.webPid;start=$runtime.webStart;kind='web'})) {
    $processId = $entry.id
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
    if ($processInfo) {
        $timeMatches = [Math]::Abs(($processInfo.CreationDate.ToUniversalTime() - [datetime]::Parse($entry.start).ToUniversalTime()).TotalSeconds) -lt 2
        $pathMatches = ($entry.kind -eq 'api' -and $processInfo.ExecutablePath -eq (Join-Path $projectRoot '.venv\Scripts\python.exe')) -or
            ($entry.kind -eq 'web' -and $processInfo.CommandLine -match 'node_modules[/\\]vite[/\\]bin[/\\]vite.js')
        if (!$pathMatches -or !$timeMatches) { throw "PID $processId identity mismatch. Refusing to stop." }
        $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$processId" -ErrorAction SilentlyContinue
        foreach ($child in $children) {
            if ($entry.kind -eq 'api' -and $child.CommandLine -match 'uvicorn app.main:app --app-dir backend') { Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue }
        }
        Stop-Process -Id $processId
    }
}
Remove-Item -LiteralPath $runtimePath
Write-Output 'OnboardOS AI stopped. SQLite data preserved.'
