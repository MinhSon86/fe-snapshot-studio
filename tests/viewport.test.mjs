import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright';
import { capture } from '../server/capture.js';
import { closeBrowser } from '../server/browser.js';

test('large captures and editor viewport persistence with local fixtures', async t => {
  const app = express();
  let stored;
  app.use(express.json({ limit: '10mb' }));
  app.get('/api/projects', (req, res) => res.json(stored ? [stored] : []));
  app.post('/api/projects', (req, res) => {
    stored = structuredClone({ ...req.body, id: 'viewport-fixture' });
    res.json(stored);
  });
  app.get('/api/projects/:id', (req, res) => res.json(stored));
  app.get('/api/browser/profiles', (req, res) => res.json([]));
  app.get('/api/browser/sessions', (req, res) => res.json({ session: null }));
  app.post('/api/capture', async (req, res) => {
    try { res.json(await capture({ ...req.body, wait: 10 })); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.get('/fixture', (req, res) => res.send('<title>Wide fixture</title><h1>Viewport fixture</h1><div style="width:100%;height:20px;background:blue"></div>'));
  app.use(express.static(path.resolve('public')));
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await closeBrowser();
    await new Promise(resolve => server.close(resolve));
  });

  await t.test('captures at 1920, 2560, 3840 and 7680px; rejects out of range', async () => {
    for (const width of [1920, 2560, 3840, 7680]) {
      const result = await capture({ url: base + '/fixture', width, wait: 10 });
      assert.equal(result.width, width);
      assert.equal(result.title, 'Wide fixture');
      assert.ok(result.thumbnail.startsWith('data:image/jpeg;base64,'));
    }
    for (const width of [0, -1, 7681, 1920.5, NaN]) {
      await assert.rejects(capture({ url: base + '/fixture', width }), /Chiều rộng/);
    }
  });

  await t.test('editor saves a 4K viewport and accepts a custom width', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('[data-start=blank]').click();
    await page.locator('#editor').waitFor({ state: 'visible' });
    await page.locator('#vp-preset').selectOption('3840');
    await page.waitForFunction(() => document.querySelector('#frame').style.width === '3840px');
    for (let i = 0; stored.pages[0].width !== 3840 && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(stored.pages[0].width, 3840);
    await page.locator('#btn-home').click();
    await page.locator('.project-card').click();
    assert.equal(await page.locator('#vp-width').inputValue(), '3840');
    await page.locator('#vp-width').fill('6000');
    await page.locator('#vp-width').press('Tab');
    await page.waitForFunction(() => document.querySelector('#frame').style.width === '6000px');
    assert.equal(await page.locator('#vp-preset').inputValue(), 'custom');
    await page.locator('#btn-capture-url').click();
    await page.locator('.modal select').first().selectOption('public');
    await page.getByRole('textbox', { name: 'Địa chỉ trang web', exact: true }).fill(base + '/fixture');
    await page.getByRole('button', { name: '3840px', exact: true }).click();
    await page.getByRole('button', { name: 'Chụp giao diện', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.modal'));
    assert.equal(stored.pages.length, 2);
    assert.equal(stored.pages[1].width, 3840);
    assert.equal(stored.pages[0].width, 6000);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
