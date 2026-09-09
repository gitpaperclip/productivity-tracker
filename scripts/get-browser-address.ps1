param([long]$WindowId)
$ErrorActionPreference = 'Stop'
# This process is separately time-limited by windows-backend.js. Never focus,
# click, send keys, or enumerate Document descendants to obtain an address.
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class SydTrackBrowserWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
'@
  $handle = [IntPtr]$WindowId
  if ([SydTrackBrowserWindow]::GetForegroundWindow() -ne $handle) { exit 0 }
  $title = New-Object System.Text.StringBuilder 1024
  [void][SydTrackBrowserWindow]::GetWindowText($handle, $title, $title.Capacity)
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $queue = New-Object System.Collections.Queue
  $queue.Enqueue(@{ Element = $root; Toolbar = $false; Depth = 0 })
  $visited = 0
  $address = ''
  while ($queue.Count -gt 0 -and $visited -lt 250) {
    $item = $queue.Dequeue()
    $element = $item.Element
    $current = $element.Current
    $visited++
    if ($current.ControlType -eq [System.Windows.Automation.ControlType]::Document) { continue }
    $toolbar = $item.Toolbar -or $current.ControlType -eq [System.Windows.Automation.ControlType]::ToolBar
    $knownAddress = $current.AutomationId -eq 'urlbar-input' -or $current.Name -in @('Address and search bar', 'Search or enter address', 'Search with Google or enter address')
    if ($toolbar -and $knownAddress -and $current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -and -not $current.IsOffscreen -and -not $current.HasKeyboardFocus) {
      $pattern = $null
      if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
        $address = [string]$pattern.Current.Value
        break
      }
    }
    if ($item.Depth -ge 12) { continue }
    $child = $walker.GetFirstChild($element)
    while ($null -ne $child -and $queue.Count -lt 250) {
      $queue.Enqueue(@{ Element = $child; Toolbar = $toolbar; Depth = $item.Depth + 1 })
      $child = $walker.GetNextSibling($child)
    }
  }
  $afterTitle = New-Object System.Text.StringBuilder 1024
  [void][SydTrackBrowserWindow]::GetWindowText($handle, $afterTitle, $afterTitle.Capacity)
  if ([SydTrackBrowserWindow]::GetForegroundWindow() -eq $handle -and $afterTitle.ToString() -eq $title.ToString()) {
    @{ id = [string]$WindowId; title = $title.ToString(); url = $address } | ConvertTo-Json -Compress
  }
} catch {
  # Missing/inaccessible providers are normal: the caller keeps title matching.
}
