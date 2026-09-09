'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// Only malformed content is recoverable. IO failures must never look like missing data.
function readRecoverableJson(filePath, validate, onRecovery = () => {}) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  let value;
  try { value = JSON.parse(text); } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
  }
  if (value !== undefined && validate(value)) return value;
  const recoveryPath = `${filePath}.recovery-${randomUUID()}`;
  // Exclusive copy preserves the exact bytes; failure leaves the source untouched.
  fs.copyFileSync(filePath, recoveryPath, fs.constants.COPYFILE_EXCL);
  fs.unlinkSync(filePath);
  onRecovery({ filePath, recoveryPath });
  return null;
}

// Replace complete files atomically: a failed write must not truncate user history.
function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.renameSync(temporary, filePath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

module.exports = { writeJson, validDateKey, readRecoverableJson };
