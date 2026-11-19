# Inspect the built executable through Windows UI Automation. No app hooks,
# debugging port or security changes. Spanish is seeded for a read/restart test.
param([Parameter(Mandatory=$true)][string]$Exe, [Parameter(Mandatory=$true)][string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LastbookCapture {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
}
'@
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path
$Data = Join-Path $Out 'LastbookData'
$Lib = Join-Path $Data 'library-data'
$env:APPDATA = Join-Path $Out 'roaming'
$env:LOCALAPPDATA = Join-Path $Out 'local'
Remove-Item Env:LASTBOOK_DATA -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Lib, $env:APPDATA, $env:LOCALAPPDATA | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $Lib 'catalog.json'),'[]',$utf8)
[IO.File]::WriteAllText((Join-Path $Lib 'summary.json'),'{"resources":0}',$utf8)
$Settings = Join-Path $env:APPDATA 'Lastbook'
New-Item -ItemType Directory -Force $Settings | Out-Null
$report = New-Object System.Collections.ArrayList

function Probe([string]$Language, [string]$Expected) {
  $pref = Join-Path $Settings 'ui-language.json'
  if ($Language -eq 'default') { if (Test-Path $pref) { Remove-Item $pref } }
  else { [IO.File]::WriteAllText($pref,'{"language":"es-419"}',$utf8) }
  $p = Start-Process -FilePath $Exe -ArgumentList @('--data', ('"' + $Data + '"')) -PassThru
  $row = [ordered]@{ language=$Language; pid=$p.Id; rendered=$false; expected=$Expected; screenshot=$false }
  [void]$report.Add($row)
  $names = @()
  try {
    $deadline = [DateTime]::UtcNow.AddSeconds(70)
    while ([DateTime]::UtcNow -lt $deadline) {
      $p.Refresh()
      if ($p.HasExited) { $row.exit_code=$p.ExitCode; break }
      if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
        try {
          $root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
          $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
          $names = @($all | ForEach-Object { try { $_.Current.Name } catch {} } | Where-Object { $_ })
          if ($names -contains $Expected) { $row.rendered=$true; break }
        } catch { $row.last_error=$_.Exception.Message }
      }
      Start-Sleep -Milliseconds 500
    }
    [IO.File]::WriteAllLines((Join-Path $Out ($Language + '-uia.txt')),[string[]]$names,$utf8)
    $p.Refresh()
    $row.alive = -not $p.HasExited
    if ($row.alive -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
      try {
        $r = New-Object LastbookCapture+RECT
        if ([LastbookCapture]::GetWindowRect($p.MainWindowHandle,[ref]$r) -and ($r.R -gt $r.L) -and ($r.B -gt $r.T)) {
          $bmp = New-Object System.Drawing.Bitmap ($r.R-$r.L),($r.B-$r.T)
          $gfx = [System.Drawing.Graphics]::FromImage($bmp)
          $dc = $gfx.GetHdc()
          $ok = [LastbookCapture]::PrintWindow($p.MainWindowHandle,$dc,2)
          $gfx.ReleaseHdc($dc); $gfx.Dispose()
          if ($ok) { $bmp.Save((Join-Path $Out ($Language + '-window.png')),[System.Drawing.Imaging.ImageFormat]::Png); $row.screenshot=$true }
          $bmp.Dispose()
        }
      } catch { $row.screenshot_error=$_.Exception.Message }
    }
    $row | ConvertTo-Json -Depth 5 | Write-Output
  } finally {
    $p.Refresh()
    if (-not $p.HasExited) {
      [void]$p.CloseMainWindow()
      if (-not $p.WaitForExit(10000)) { $p.Kill(); $p.WaitForExit() }
    }
  }
}
try {
  Probe 'default' 'Guides'
  Probe 'es-419' ('Gu' + [char]0x00ED + 'as')
} finally {
  [IO.File]::WriteAllText((Join-Path $Out 'packaged-report.json'),($report | ConvertTo-Json -Depth 6),$utf8)
}
if (@($report | Where-Object { -not $_.alive -or -not $_.rendered }).Count -gt 0) {
  throw 'Packaged app did not expose the expected UI Automation labels.'
}
Write-Output 'PASS: packaged executable rendered English and a seeded Spanish preference in separate launches.'
