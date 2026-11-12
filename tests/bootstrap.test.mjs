import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { bootstrap, parseArgs } from '../scripts/bootstrap.mjs';

function fixture(overrides = {}) {
  const calls = [];
  return {
    calls, platform: 'win32', arch: 'x64', nodeVersion: '24.0.0',
    log: () => {}, writable: () => calls.push('writable'),
    npm: async () => true, dependencies: async () => true,
    browser: async () => { calls.push('browser'); },
    installDependencies: async () => calls.push('npm-install'),
    installBrowser: async flag => calls.push(['browser-install', flag]),
    prepareData: () => calls.push('data'), start: async noOpen => calls.push(['start', noOpen]),
    ...overrides,
  };
}

test('check probes prerequisites without installing or preparing data', async () => {
  const system = fixture();
  await bootstrap({ mode: 'check' }, system);
  assert.deepEqual(system.calls, ['writable', 'browser']);
});

test('healthy setup is repeatable and never reinstalls dependencies or browser', async () => {
  const system = fixture();
  await bootstrap({ mode: 'setup' }, system);
  await bootstrap({ mode: 'setup' }, system);
  assert.deepEqual(system.calls, ['writable', 'browser', 'data', 'writable', 'browser', 'data']);
});

test('first setup installs missing dependencies and Chromium, then verifies readiness before start', async () => {
  let depsReady = false;
  let browserReady = false;
  const system = fixture({
    dependencies: async () => depsReady,
    installDependencies: async () => { system.calls.push('npm-install'); depsReady = true; },
    browser: async () => { system.calls.push('browser'); if (!browserReady) throw new Error('missing executable'); },
    installBrowser: async flag => { system.calls.push(['browser-install', flag]); browserReady = true; },
  });
  await bootstrap({ mode: 'start', noOpen: true, withDeps: true }, system);
  assert.deepEqual(system.calls, ['writable', 'npm-install', 'browser', ['browser-install', true], 'browser', 'data', ['start', true]]);
});

test('missing dependencies in check do not trigger installation', async () => {
  const system = fixture({ dependencies: async () => false });
  await assert.rejects(bootstrap({ mode: 'check' }, system), /package-lock/);
  assert.deepEqual(system.calls, ['writable']);
});

test('missing Chromium in check does not install or start anything', async () => {
  const system = fixture({ browser: async () => { throw new Error('not installed'); } });
  await assert.rejects(bootstrap({ mode: 'check' }, system), /Chromium/);
  assert.deepEqual(system.calls, ['writable']);
});

test('failed npm install stops setup before preparing data or starting server', async () => {
  const system = fixture({ dependencies: async () => false, installDependencies: async () => { throw new Error('offline fixture'); } });
  await assert.rejects(bootstrap({ mode: 'start' }, system), /offline fixture/);
  assert.deepEqual(system.calls, ['writable']);
});

test('missing Linux system libraries report the explicit with-deps recovery', async () => {
  const system = fixture({ platform: 'linux', browser: async () => { throw new Error('missing libraries'); } });
  await assert.rejects(bootstrap({ mode: 'start' }, system), /setup.sh --with-deps/);
  assert.deepEqual(system.calls, ['writable', ['browser-install', false]]);
});

test('unsupported runtime and architecture stop without installation', async () => {
  for (const values of [{ nodeVersion: '18.20.0' }, { platform: 'freebsd' }, { arch: 'ia32' }]) {
    const system = fixture(values);
    await assert.rejects(bootstrap({ mode: 'setup' }, system));
    assert.deepEqual(system.calls, []);
  }
});

test('invalid flags and install flags in check are rejected', () => {
  assert.deepEqual(parseArgs(['start', '--no-open']), { mode: 'start', noOpen: true, withDeps: false });
  for (const args of [['check', '--with-deps'], ['reset'], ['setup', '--unknown']]) assert.throws(() => parseArgs(args));
  const result = spawnSync(process.execPath, ['scripts/bootstrap.mjs', 'check', '--unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cú pháp/);
});

test('branded Windows ICO contains all intended PNG resolutions', () => {
  const icon = fs.readFileSync(new URL('../public/assets/app.ico', import.meta.url));
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  assert.equal(icon.readUInt16LE(4), 4);
  for (const [index, size] of [16, 32, 48, 256].entries()) {
    const pos = 6 + index * 16;
    const offset = icon.readUInt32LE(pos + 12);
    const length = icon.readUInt32LE(pos + 8);
    assert.equal(icon[pos] || 256, size);
    assert.ok(offset + length <= icon.length);
    assert.equal(icon.subarray(offset + 1, offset + 4).toString(), 'PNG');
    assert.equal(icon.readUInt32BE(offset + 16), size);
  }
});
