import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

for (const folder of ['extension', 'scripts', 'tests']) {
  for (const file of await readdir(folder)) {
    if (!/\.m?js$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', `${folder}/${file}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
}
const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version);
assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'bookmarks', 'scripting', 'search', 'tabs']);
for (const forbidden of ['host_permissions', 'externally_connectable', 'web_accessible_resources', 'chrome_url_overrides']) assert.equal(manifest[forbidden], undefined);
for (const file of [manifest.background.service_worker, 'core.js', 'palette.js', 'fallback.html', 'fallback.css']) await readFile(`extension/${file}`);
console.log('Syntaxe, manifeste et ressources : OK.');
