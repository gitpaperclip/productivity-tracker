'use strict';
const fs = require('fs');
const path = require('path');

function createErrorLog(dataDir, { maxBytes = 256 * 1024 } = {}) {
  const directory = path.join(dataDir, 'logs');
  const filePath = path.join(directory, 'errors.log');
  const previous = path.join(directory, 'errors.previous.log');
  function write(kind, detail) {
    try {
      fs.mkdirSync(directory, { recursive: true });
      const message = String(detail instanceof Error ? detail.stack || detail.message : detail).slice(0, 4000);
      const line = JSON.stringify({ at: new Date().toISOString(), kind, message }) + '\n';
      if (fs.existsSync(filePath) && fs.statSync(filePath).size + Buffer.byteLength(line) > maxBytes) {
        if (fs.existsSync(previous)) fs.unlinkSync(previous);
        fs.renameSync(filePath, previous);
      }
      fs.appendFileSync(filePath, line, 'utf8');
      return true;
    } catch (_) { return false; } // Diagnostics must never crash or recurse on disk failure.
  }
  return { write, directory, filePath };
}

function installErrorLogging(log) {
  for (const level of ['warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      log.write(level, args.map(arg => arg instanceof Error ? arg.stack : typeof arg === 'string' ? arg : '[details omitted]').join(' '));
      original(...args);
    };
  }
  // Observe fatal errors without suppressing Node/Electron's normal failure handling.
  process.on('uncaughtExceptionMonitor', (err, origin) => log.write(origin, err));
}

module.exports = { createErrorLog, installErrorLogging };
