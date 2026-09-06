'use strict';

const { createWindowsBackend } = require('../src/windows-backend');
createWindowsBackend().getActiveWindow().then((r) => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.window ? 0 : 2);
});
