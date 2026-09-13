import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve('.output/chrome-mv3');
const manifest = JSON.parse(readFileSync(resolve(output, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'SuspendIt');
assert.equal(manifest.action.default_popup, 'popup.html');
assert.deepEqual([...manifest.permissions].sort(), ['contextMenus', 'favicon', 'tabGroups', 'tabs']);
for (const field of ['host_permissions', 'content_scripts', 'options_page', 'options_ui', 'chrome_url_overrides', 'default_locale', 'web_accessible_resources']) {
  assert.ok(!manifest[field], `Unexpected manifest field: ${field}`);
}
assert.ok(existsSync(resolve(output, manifest.background.service_worker)));
for (const path of Object.values(manifest.icons)) assert.ok(existsSync(resolve(output, path)));

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
const built = files(output);
assert.deepEqual(built.filter((path) => path.endsWith('.html')), [resolve(output, 'popup.html')]);
const scriptBytes = built.filter((path) => path.endsWith('.js')).reduce((sum, path) => sum + statSync(path).size, 0);
assert.ok(scriptBytes <= 32 * 1024, `Shipped JavaScript exceeds 32 KiB: ${scriptBytes}`);
if (process.argv.includes('--package')) {
  const version = manifest.version;
  const zip = resolve(`.output/suspendit-${version}-chrome.zip`);
  const bytes = statSync(zip).size;
  assert.ok(bytes <= 100 * 1024, `Package exceeds 100 KiB: ${bytes}`);
  console.log(`Package verified: ${bytes} bytes`);
}
console.log(`Manifest, popup, icons, and JavaScript budget verified (${scriptBytes} bytes of JS).`);
