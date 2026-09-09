'use strict';

const path = require('path');
const { execFile } = require('child_process');
const { isBrowserProcess } = require('./classifier');
const { hostname } = require('./browser-rules');

const PS1 = __dirname.includes('app.asar')
  ? path.join(process.resourcesPath, 'get-foreground.ps1')
  : path.join(__dirname, '..', 'scripts', 'get-foreground.ps1');
const TIMEOUT_MS = 5000;
const ADDRESS_PS1 = path.join(path.dirname(PS1), 'get-browser-address.ps1');

function readBrowserAddress(win, run = execFile) {
  if (!isBrowserProcess(win) || !/^\d+$/.test(String(win.id || ''))) return Promise.resolve('');
  return new Promise((resolve) => {
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', ADDRESS_PS1, '-WindowId', String(win.id)],
    { windowsHide: true, timeout: 3000, encoding: 'utf8', maxBuffer: 16384 }, (err, stdout) => {
      if (err) return resolve('');
      try {
        const result = JSON.parse(stdout);
        const host = result.id === String(win.id) && result.title === win.title ? hostname(result.url) : '';
        // Only the host is needed. Never retain paths, queries, or typed searches.
        resolve(host ? `https://${host}` : '');
      } catch (_) { resolve(''); }
    });
  });
}

// Address capture is experimental: known editing/focus gaps must not affect
// ordinary tracking. Production callers use foreground titles only.
function createWindowsBackend({ experimentalAddressCapture = false, run = execFile } = {}) {
  function getActiveWindow() {
    return new Promise((resolve) => {
      run(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1],
        { windowsHide: true, timeout: TIMEOUT_MS, encoding: 'utf8', maxBuffer: 1024 * 1024 },
        async (err, stdout, stderr) => {
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
            if (parsed.window) parsed.window.url = experimentalAddressCapture ? await readBrowserAddress(parsed.window, run) : '';
            resolve({ window: parsed.window || null, idleSec: Number(parsed.idleSec) || 0, error: parsed.error || null });
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

module.exports = { createWindowsBackend, readBrowserAddress };
