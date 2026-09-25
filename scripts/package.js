'use strict';
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const git = args => execFileSync('git', args, { cwd:root, encoding:'utf8', windowsHide:true });
try {
  // Only committed, tracked source belongs in a public source archive.
  git(['diff','--exit-code','HEAD','--']);
  const version = JSON.parse(git(['show','HEAD:package.json'])).version;
  const name = `house-guard-${version}`, output = path.join(root,'artifacts',`${name}-public.zip`);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  git(['archive','--format=zip',`--prefix=${name}/`,`--output=${output}`,'HEAD']);
  console.log(output);
} catch (error) {
  console.error('Kildepakken krever et Git-repository med committede kodeendringer. Private, ignorerte filer tas ikke med.');
  process.exitCode = 1;
}
