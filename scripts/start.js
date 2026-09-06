'use strict';

const { spawn } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
const bin = require('electron');
const extra = process.argv.slice(2);
const args = [root, '--no-sandbox', '--disable-gpu'].concat(extra);
const env = Object.assign({}, process.env);
const headless = process.platform === 'linux' && !process.env.DISPLAY;
if (headless && env.FOCUSFLOW_DEMO == null) env.FOCUSFLOW_DEMO = '1';
if (headless && env.FOCUSFLOW_THRESHOLD_SEC == null) env.FOCUSFLOW_THRESHOLD_SEC = '30';
function go(cmd, argv) {
  const child = spawn(cmd, argv, { stdio: 'inherit', env: env });
  child.on('exit', function (code, signal) {
    if (signal) process.kill(process.pid, signal);
    process.exit(code == null ? 1 : code);
  });
  child.on('error', function (err) {
    console.error('Failed to launch:', err.message);
    process.exit(1);
  });
}
if (headless) {
  console.log('[focusflow] No DISPLAY — starting under xvfb (demo mode, 30s reminder).');
  go('xvfb-run', ['-a', '--auto-servernum', '--server-args=-screen 0 1280x800x24', bin].concat(args));
} else {
  go(bin, args);
}
