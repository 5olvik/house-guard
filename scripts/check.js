'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
function jsFiles(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? jsFiles(path.join(dir, entry.name)) : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : []); }
const files = ['app.js', 'api.js', ...['lib', 'settings', 'scripts', 'test', 'drivers'].flatMap(jsFiles)];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }); if (result.status) { console.error(result.stderr); process.exit(1); }
  const resolve = require('node:module').createRequire(path.resolve(file)).resolve;
  for (const match of fs.readFileSync(file,'utf8').matchAll(/require\((['"])(\.{1,2}\/[^'"]+)\1\)/g)) resolve(match[2]);
}
const { defaults, validate } = require('../lib/config'); validate(defaults());
const manifest = JSON.parse(fs.readFileSync('app.json')), api = require('../api');
for (const method of Object.keys(manifest.api)) if (typeof api[method] !== 'function') throw new Error(`Mangler API-handler: ${method}`);
if (manifest.id === 'no.powerguard' || manifest.drivers?.some(driver => driver.id !== 'guest-mode') || manifest.widgets) throw new Error('Gammel app-identitet eller aktive energikomponenter');
if (manifest.version !== require('../package.json').version) throw new Error('App- og pakkeversjon er ulike');
console.log(`${files.length} JavaScript-filer, standardoppsett og API-koblinger kontrollert.`);
