import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('opening a captured project keeps its snapshot; page switches save the current canvas', async () => {
  const source = (await fs.readFile(new URL('../public/js/app.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/new App\(\);\s*$/, 'globalThis.AppForTest = App;');
  const captured = { id: 'captured', name: 'Snapshot', pages: [{ html: 'CAPTURED_HTML' }, { html: 'SECOND_PAGE' }] };
  const scope = { api: { project: async () => captured }, document: { getElementById: () => null } };
  vm.createContext(scope);
  vm.runInContext(source, scope);
  const app = Object.create(scope.AppForTest.prototype);
  Object.assign(app, {
    project: { id: 'old', pages: [{ html: 'OLD_PROJECT' }] }, pageIndex: 0,
    nameInput: {}, vpInput: {}, showEditor() {}, panels: { renderPages() {} },
    canvas: { doc: {}, serialize: () => 'OLD_CANVAS', async load(html) { this.loaded = html; } },
  });
  await app.openProject('captured');
  assert.equal(captured.pages[0].html, 'CAPTURED_HTML');
  assert.equal(app.canvas.loaded, 'CAPTURED_HTML');
  app.canvas.serialize = () => 'EDITED_CAPTURE';
  await app.selectPage(1);
  assert.equal(captured.pages[0].html, 'EDITED_CAPTURE');
  assert.equal(app.canvas.loaded, 'SECOND_PAGE');
});
