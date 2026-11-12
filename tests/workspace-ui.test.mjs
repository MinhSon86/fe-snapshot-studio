import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright';

test('workspace usability with synthetic projects', async t => {
  const app = express();
  let stored;
  app.use(express.json({ limit: '10mb' }));
  app.get('/api/projects', (req, res) => res.json(stored ? [stored] : []));
  app.post('/api/projects', (req, res) => { stored = structuredClone({ ...req.body, id: 'ui-fixture' }); res.json(stored); });
  app.get('/api/projects/:id', (req, res) => res.json(stored));
  app.get('/api/browser/profiles', (req, res) => res.json([]));
  app.get('/api/browser/sessions', (req, res) => res.json({ session: null }));
  app.use(express.static(path.resolve('public')));
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const browser = await chromium.launch({ headless: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  const artifacts = path.resolve('scratch/workspace-ui');
  await fs.mkdir(artifacts, { recursive: true });
  t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('[data-start=blank]').click();
  await page.locator('#editor').waitFor({ state: 'visible' });
  const frame = page.frameLocator('#frame');

  await t.test('panels collapse, focus restores layout, and preferences survive reload', async () => {
    const original = await page.locator('#canvas-area').boundingBox();
    await page.locator('#btn-toggle-left').click();
    await page.locator('#navigation-panel').waitFor({ state: 'hidden' });
    assert.ok((await page.locator('#canvas-area').boundingBox()).width > original.width + 200);
    await page.locator('#btn-toggle-left').click();
    await page.locator('#btn-focus-mode').click();
    assert.equal(await page.locator('#navigation-panel').isVisible(), false);
    assert.equal(await page.locator('#properties-panel').isVisible(), false);
    await page.locator('#btn-focus-mode').click();
    assert.equal(await page.locator('#navigation-panel').isVisible(), true);
    assert.equal(await page.locator('#properties-panel').isVisible(), true);
    await page.locator('#btn-toggle-right').click();
    await page.reload();
    await page.locator('.project-card').click();
    assert.equal(await page.locator('#properties-panel').isVisible(), false);
    await page.locator('#btn-toggle-right').click();
  });

  await t.test('property groups reduce clutter and keep edits and expansion across selection', async () => {
    await frame.locator('h1').first().click();
    const inspector = page.locator('#inspector');
    const layout = inspector.locator('details').filter({ has: page.locator(':scope > summary', { hasText: 'Bố cục' }) }).first();
    assert.equal(await inspector.locator(':scope > details[open]').count(), 2);
    await inspector.locator('summary').filter({ hasText: 'Bố cục' }).click();
    assert.equal(await layout.getAttribute('open'), '');
    const text = inspector.locator('textarea').first();
    await text.fill('Nội dung đã sửa qua Inspector');
    await text.press('Tab');
    assert.equal(await frame.locator('h1').first().textContent(), 'Nội dung đã sửa qua Inspector');
    await frame.locator('p').first().click();
    await frame.locator('h1').first().click();
    assert.equal(await layout.getAttribute('open'), '');
    assert.equal(await text.inputValue(), 'Nội dung đã sửa qua Inspector');
    await page.locator('[data-tab=theme]').click();
    assert.equal(await page.locator('#tab-theme > details[open]').count(), 1);
    await page.locator('[data-tab=insert]').click();
    assert.equal(await page.locator('#tab-insert > details[open]').count(), 1);
    assert.ok(await page.locator('#tab-insert .block:visible').count() > 0);
    await page.locator('#tab-insert > details > summary').first().click();
    assert.equal(await page.locator('#tab-insert .block:visible').count(), 0);
    await page.locator('[data-tab=pages]').click();
  });

  await t.test('tooltips explain controls on hover and keyboard focus', async () => {
    await page.locator('#btn-focus-mode').hover();
    await page.locator('#studio-tooltip').waitFor({ state: 'visible' });
    assert.match(await page.locator('#studio-tooltip').textContent(), /Ẩn cả hai panel/);
    await page.keyboard.press('Escape');
    await page.locator('#studio-tooltip').waitFor({ state: 'hidden' });
    await page.locator('#vp-preset').focus();
    await page.locator('#studio-tooltip').waitFor({ state: 'visible' });
    assert.match(await page.locator('#studio-tooltip').textContent(), /chiều rộng/);
    assert.match(await page.locator('#vp-preset').getAttribute('aria-describedby'), /studio-tooltip/);
    await page.locator('#btn-export').click();
    await page.locator('[data-export=html]').focus();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#export-menu').isVisible(), false);
  });

  await t.test('controls and export menu fit desktop, tablet and small screens', async () => {
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('#btn-export').click();
      const menu = await page.locator('#export-menu').boundingBox();
      assert.ok(menu.x >= 0 && menu.x + menu.width <= width + 1, `export menu fits ${width}`);
      await page.keyboard.press('Escape');
      await page.locator('#btn-toggle-right').click();
      if (!await page.locator('#properties-panel').isVisible()) await page.locator('#btn-toggle-right').click();
      await frame.locator('h1').first().click();
      const overflow = await page.evaluate(() => [...document.querySelectorAll('.topbar button, .panel-section button, .tabs button')]
        .filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 2)
        .map(el => el.textContent.trim()));
      assert.deepEqual(overflow, [], `button text fits ${width}`);
      assert.ok((await page.locator('#canvas-area').boundingBox()).width > 60);
      const rootOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(rootOverflow, false, `no horizontal page overflow at ${width}`);
      await page.screenshot({ path: path.join(artifacts, `editor-${width}.png`) });
    }
    await page.locator('#btn-capture-url').click();
    await page.screenshot({ path: path.join(artifacts, 'capture-390.png') });
    const modal = await page.locator('.modal').boundingBox();
    assert.ok(modal.x >= 0 && modal.x + modal.width <= 391);
    const footerOverflow = await page.locator('.modal footer').evaluate(el => el.scrollWidth > el.clientWidth);
    assert.equal(footerOverflow, false);
    assert.match(await page.locator('.modal footer .primary').getAttribute('data-tooltip'), /giữ nguyên phiên đăng nhập/);
    await page.locator('.modal select').first().selectOption('public');
    assert.match(await page.locator('.modal footer .primary').getAttribute('data-tooltip'), /phiên mới/);
    assert.deepEqual(errors, []);
  });
});
