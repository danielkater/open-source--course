param([int]$ApiPort = 8000, [int]$WebPort = 5173)
$ErrorActionPreference = 'Stop'
if ($ApiPort -ne 8000 -or $WebPort -ne 5173) { throw 'Demo uses ports 8000 / 5173. Update vite.config.ts before changing ports.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimePath = Join-Path $projectRoot '.runtime.json'
if (Test-Path -LiteralPath $runtimePath) {
    $runtime = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
    $alive = @($runtime.apiPid, $runtime.webPid) | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }
    if ($alive.Count) { throw 'Project processes are still running. Use scripts/stop.ps1 first.' }
}
foreach ($port in @($ApiPort,$WebPort)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Port $port is occupied. Other projects will not be stopped." }
}
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Install Python dependencies as described in README.' }
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'frontend\node_modules'))) { throw 'Run npm install in frontend first.' }
$logRoot = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$apiProcess = Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','app.main:app','--app-dir','backend','--host','127.0.0.1','--port',"$ApiPort") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'api.out.log') -RedirectStandardError (Join-Path $logRoot 'api.err.log') -PassThru
try {
    $node = (Get-Command node.exe).Source
    $webProcess = Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',"$WebPort") -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'web.out.log') -RedirectStandardError (Join-Path $logRoot 'web.err.log') -PassThru
    @{apiPid=$apiProcess.Id;webPid=$webProcess.Id;apiStart=$apiProcess.StartTime.ToUniversalTime().ToString('o');webStart=$webProcess.StartTime.ToUniversalTime().ToString('o');root=$projectRoot} | ConvertTo-Json | Set-Content -LiteralPath $runtimePath -Encoding UTF8
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:$ApiPort/api/health" -TimeoutSec 2
            $web = Invoke-WebRequest "http://127.0.0.1:$WebPort" -UseBasicParsing -TimeoutSec 2
            if ($health.status -eq 'ok' -and $web.StatusCode -eq 200) { $ready=$true; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (!$ready) { throw 'Services failed readiness checks. Inspect logs directory.' }
    Write-Output "Web: http://127.0.0.1:$WebPort"
    Write-Output "API: http://127.0.0.1:$ApiPort/docs"
    Write-Output "Mode: $($health.mode) | SQLite ready"
} catch {
    if ($webProcess -and !$webProcess.HasExited) { Stop-Process -Id $webProcess.Id -ErrorAction SilentlyContinue }
    if (!$apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue }
    throw
}
