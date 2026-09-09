$ErrorActionPreference = "Stop"
if (-not ("SydTrackWin" -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class SydTrackWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [DllImport("kernel32.dll")] public static extern uint GetTickCount();
  public static uint ElapsedTicks(uint current, uint last) { return unchecked(current - last); }
}
"@
}
$lastInput = New-Object SydTrackWin+LASTINPUTINFO
$lastInput.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($lastInput)
$idleSec = 0
if ([SydTrackWin]::GetLastInputInfo([ref]$lastInput)) {
  # Both values are unsigned 32-bit ticks. Windows PowerShell 5.1 has no
  # Environment.TickCount64; unchecked subtraction also handles tick rollover.
  $idleMs = [SydTrackWin]::ElapsedTicks([SydTrackWin]::GetTickCount(), $lastInput.dwTime)
  $idleSec = [Math]::Floor($idleMs / 1000)
}
$hwnd = [SydTrackWin]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) {
  Write-Output ("{`"window`":null,`"idleSec`":$idleSec,`"error`":null}")
  exit 0
}
$sb = New-Object System.Text.StringBuilder 1024
[void][SydTrackWin]::GetWindowText($hwnd, $sb, $sb.Capacity)
$procId = [uint32]0
[void][SydTrackWin]::GetWindowThreadProcessId($hwnd, [ref]$procId)
$name = ""
$path = ""
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
if ($proc) {
  $name = [string]$proc.ProcessName
  try { if ($proc.Path) { $path = [string]$proc.Path } } catch {}
}
# Escape for JSON manually to avoid ConvertTo-Json quirks
function Esc([string]$s) {
  if ($null -eq $s) { return "" }
  $s = $s.Replace("\", "\\").Replace('"', '\"').Replace("`r", "\r").Replace("`n", "\n").Replace("`t", "\t")
  return $s
}
$title = Esc $sb.ToString()
$name = Esc $name
$path = Esc $path
Write-Output ("{`"window`":{`"title`":`"$title`",`"owner`":{`"name`":`"$name`",`"path`":`"$path`",`"processId`":$procId},`"platform`":`"windows`",`"id`":`"$($hwnd.ToInt64())`"},`"idleSec`":$idleSec,`"error`":null}")
