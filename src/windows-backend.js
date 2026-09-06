'use strict';

const path = require('path');
const { execFile } = require('child_process');

const PS1 = path.join(__dirname, '..', 'scripts', 'get-foreground.ps1');
const TIMEOUT_MS = 5000;

function createWindowsBackend() {
  function getActiveWindow() {
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1],
        { windowsHide: true, timeout: TIMEOUT_MS, encoding: 'utf8', maxBuffer: 1024 * 1024 },
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
          let jsonText = text;
          const brace = text.indexOf('{');
          if (brace >= 0) jsonText = text.slice(brace);
          try {
            const parsed = JSON.parse(jsonText);
            resolve({ window: parsed.window || null, error: parsed.error || null });
          } catch (parseErr) {
            resolve({
              window: null,
              error: 'windows-backend JSON parse failed: ' + (parseErr.message || String(parseErr))
            });
          }
        }
      );
    });
  }

  return { getActiveWindow };
}

module.exports = { createWindowsBackend };