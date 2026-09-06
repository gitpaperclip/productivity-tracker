
const { execFile } = require('child_process');

const TIMEOUT_MS = 4000;

/**
 * PowerShell that reads the foreground window via user32.
 * IMPORTANT: never use $pid — it is a readonly automatic variable.
 */
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FocusFlowWin {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@

  $hwnd = [FocusFlowWin]::GetForegroundWindow()
  if ($hwnd -eq [IntPtr]::Zero) {
    Write-Output '{"window":null,"error":null}'
    exit 0
  }

  $sb = New-Object System.Text.StringBuilder 1024
  [void][FocusFlowWin]::GetWindowText($hwnd, $sb, $sb.Capacity)
  $title = $sb.ToString()

  $procId = [uint32]0
  [void][FocusFlowWin]::GetWindowThreadProcessId($hwnd, [ref]$procId)

  $name = ''
  $path = ''
  $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($proc) {
    $name = [string]$proc.ProcessName
    try {
      if ($proc.Path) { $path = [string]$proc.Path }
    } catch { }
  }

  $payload = [ordered]@{
    window = [ordered]@{
      title = $title
      owner = [ordered]@{
        name = $name
        path = $path
        processId = [int]$procId
      }
      platform = 'windows'
    }
    error = $null
  }
  $payload | ConvertTo-Json -Compress -Depth 6
} catch {
  $msg = $_.Exception.Message
  if (-not $msg) { $msg = 'powershell foreground window failed' }
  $errObj = [ordered]@{ window = $null; error = $msg }
  $errObj | ConvertTo-Json -Compress -Depth 4
  exit 0
}
`.trim();

function createWindowsBackend() {
  function getActiveWindow() {
    return new Promise((resolve) => {
      const child = execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          PS_SCRIPT
        ],
        {
          timeout: TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
          encoding: 'utf8'
        },
        (err, stdout, stderr) => {
          if (err && !stdout) {
            const msg =
              err.killed || err.signal === 'SIGTERM'
                ? 'windows-backend timed out'
                : err.message || String(err);
            resolve({ window: null, error: msg });
            return;
          }

          const text = String(stdout || '').trim();
          if (!text) {
            resolve({
              window: null,
              error: (stderr && String(stderr).trim()) || 'empty powershell output'
            });
            return;
          }

          // PowerShell may emit warnings before JSON — find the last JSON object
          let jsonText = text;
          const brace = text.lastIndexOf('{');
          if (brace > 0) jsonText = text.slice(brace);

          try {
            const parsed = JSON.parse(jsonText);
            if (parsed && typeof parsed === 'object') {
              resolve({
                window: parsed.window || null,
                error: parsed.error || null
              });
              return;
            }
            resolve({ window: null, error: 'invalid windows-backend payload' });
          } catch (parseErr) {
            resolve({
              window: null,
              error: 'windows-backend JSON parse failed: ' + (parseErr.message || String(parseErr))
            });
          }
        }
      );

      child.on('error', (spawnErr) => {
        resolve({
          window: null,
          error: spawnErr.message || String(spawnErr)
        });
      });
    });
  }

  return { getActiveWindow };
}

module.exports = { createWindowsBackend };
