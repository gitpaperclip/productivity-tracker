'use strict';
const { readProfilePackFile } = require('../src/profile-pack');
const { validateProfiles } = require('../src/focus-profiles');
const file = process.argv[2];
if (!file || file === '--help') {
  console.log('Usage: node scripts/validate-profile.js <file.sydtrack-profile>');
  process.exitCode = file ? 0 : 1;
} else {
  try {
    const pack = readProfilePackFile(file);
    const result = validateProfiles({ schemaVersion: 1, activeId: 'default', profiles: [{ ...pack, id: 'default' }] });
    const profile = result.profiles[0];
    console.log(`Valid profile: ${profile.name} (${profile.productive.length} productive, ${profile.unproductive.length} unproductive, ${profile.ignore.length} ignore tags)`);
    if ([...profile.productive, ...profile.unproductive].some(tag => tag.startsWith('site:'))) console.log('Note: site: rules do not match normal Windows title-only capture.');
    if (profile.productive.some(tag => profile.unproductive.includes(tag))) console.log('Note: overlapping tags use Unproductive precedence.');
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
