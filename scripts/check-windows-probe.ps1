$ErrorActionPreference = 'Stop'
# Compile the actual foreground probe's native helper, without reading the desktop.
$source = Get-Content (Join-Path $PSScriptRoot 'get-foreground.ps1') -Raw
$match = [regex]::Match($source, '(?s)Add-Type @"\r?\n(.*?)\r?\n"@')
if (-not $match.Success) { throw 'Native helper not found' }
Add-Type $match.Groups[1].Value
if ([SydTrackWin]::ElapsedTicks(5000, 1000) -ne 4000) { throw 'Idle duration incorrect' }
if ([SydTrackWin]::ElapsedTicks(2000, [uint32]4294966296) -ne 3000) { throw 'Idle tick rollover incorrect' }
if ([SydTrackWin]::ElapsedTicks(0, 0) -ne 0) { throw 'Idle zero incorrect' }
foreach ($file in @('get-foreground.ps1', 'get-browser-address.ps1')) {
  $parseErrors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $file), [ref]$null, [ref]$parseErrors)
  if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$addressSource = Get-Content (Join-Path $PSScriptRoot 'get-browser-address.ps1') -Raw
$addressMatch = [regex]::Match($addressSource, "(?s)Add-Type @'\r?\n(.*?)\r?\n'@")
if (-not $addressMatch.Success) { throw 'Browser native helper not found' }
Add-Type $addressMatch.Groups[1].Value
