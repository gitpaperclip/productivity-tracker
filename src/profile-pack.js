'use strict';

const path = require('path');

/**
 * Focus profile pack — tag lists only (productive / unproductive / ignore).
 * Separate from .sydtrack backups (format: sydtrack-backup).
 *
 * Format choice: single JSON file with extension .sydtrack-profile.
 * Zip was considered but skipped — Node builtins provide zlib (gzip) but not
 * a zip archive writer without extra deps; a single JSON pack stays simple
 * and readable for v1 profile infra.
 */

const FORMAT_ID = 'sydtrack-profile';
const SCHEMA_VERSION = 1;

function appVersion() {
  try {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    return pkg.version || '1.0.0';
  } catch (_) {
    return '1.0.0';
  }
}

function asStringList(value, fieldName) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Invalid profile pack: ${fieldName} must be an array of strings`);
  }
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new Error(`Invalid profile pack: ${fieldName} entries must be strings`);
    }
    const trimmed = item.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

/**
 * Build a portable Focus profile pack from tag lists.
 * @param {{ name?: string, productive?: string[], unproductive?: string[], ignore?: string[] }} opts
 */
function buildProfilePack(opts) {
  const options = opts || {};
  const name =
    typeof options.name === 'string' && options.name.trim()
      ? options.name.trim()
      : undefined;

  const pack = {
    format: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: appVersion(),
    productive: asStringList(options.productive, 'productive'),
    unproductive: asStringList(options.unproductive, 'unproductive'),
    ignore: asStringList(options.ignore, 'ignore')
  };

  if (name !== undefined) {
    pack.name = name;
  }

  return pack;
}

/**
 * Parse and validate a Focus profile pack (object or JSON string).
 * @returns {{ format, schemaVersion, exportedAt?, appVersion?, name?, productive, unproductive, ignore }}
 */
function parseProfilePack(objOrString) {
  let obj = objOrString;
  if (typeof objOrString === 'string') {
    try {
      obj = JSON.parse(objOrString);
    } catch (err) {
      throw new Error('Invalid profile pack: not valid JSON');
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Invalid profile pack: expected an object');
  }
  if (obj.format !== FORMAT_ID) {
    throw new Error(
      `Invalid profile pack: expected format ${FORMAT_ID}, got ${obj.format || '(missing)'}`
    );
  }
  if (Number(obj.schemaVersion) !== SCHEMA_VERSION) {
    throw new Error(`Unsupported profile schemaVersion: ${obj.schemaVersion}`);
  }

  const name =
    obj.name == null
      ? undefined
      : typeof obj.name === 'string'
        ? obj.name.trim() || undefined
        : (() => {
            throw new Error('Invalid profile pack: name must be a string');
          })();

  const pack = {
    format: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : undefined,
    appVersion: typeof obj.appVersion === 'string' ? obj.appVersion : undefined,
    productive: asStringList(obj.productive, 'productive'),
    unproductive: asStringList(obj.unproductive, 'unproductive'),
    ignore: asStringList(obj.ignore, 'ignore')
  };
  if (name !== undefined) pack.name = name;
  return pack;
}

function writeProfilePackFile(filePath, pack) {
  const fs = require('fs');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  require('./json-file').writeJson(filePath, pack);
}

function readProfilePackFile(filePath) {
  const fs = require('fs');
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseProfilePack(raw);
}

module.exports = {
  FORMAT_ID,
  SCHEMA_VERSION,
  buildProfilePack,
  parseProfilePack,
  writeProfilePackFile,
  readProfilePackFile,
  appVersion
};
