import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { chromium } from 'playwright';
import { CaptureSessions } from '../server/sessions.js';
import { browserApi } from '../server/browser-api.js';
import { capture } from '../server/capture.js';
import { closeBrowser } from '../server/browser.js';
import { launchProfile } from '../server/browser.js';

test('authenticated capture sessions (synthetic local data only)', async t => {
  const scratch = path.resolve('scratch');
  await fs.mkdir(scratch, { recursive: true });
  const root = await fs.mkdtemp(path.join(scratch, 'session-test-'));
  let beforeLaunch = async () => {};
  let launches = 0;
  const sessions = new CaptureSessions({ root, launch: async (dir, options) => {
    await beforeLaunch();
    launches++;
    return launchProfile(dir, { ...options, headless: true });
  } });
  const app = express();
  let privateVisits = 0;
  app.use(express.json());
  app.use('/api/browser', browserApi(sessions));
  app.post('/api/capture', async (req, res) => {
    try { res.json(await capture({ ...req.body, wait: 10 })); }
    catch (error) { res.status(500).json({ error: error.message }); }
  });
  app.use('/js', express.static(path.resolve('public/js')));
  app.get('/', (req, res) => res.send('<div id="modal-root"></div><div id="toast-root"></div>'));
  app.get('/login', (req, res) => res.send(`<title>Fixture login</title><button onclick="document.cookie='fixture_session=active; Path=/; SameSite=Lax; Max-Age=3600'; localStorage.setItem('fixture','yes'); sessionStorage.setItem('fixture','live'); location.href='/private'">Đăng nhập giả lập</button>`));
  app.get('/private', (req, res) => {
    if (!req.headers.cookie?.includes('fixture_session=active')) return res.redirect('/login');
    privateVisits++;
    res.send(`<title>Private fixture</title><link rel="stylesheet" href="/visual.css"><h1>Authenticated fixture</h1><input placeholder="Tìm kiếm"><input type="password" value="synthetic-password-marker"><a href="/popup" target="_blank">Mở tab khác</a><script>document.body.dataset.session = sessionStorage.getItem('fixture') || 'none'; document.body.dataset.local = localStorage.getItem('fixture');</script>`);
  });
  app.get('/visual.css', (req, res) => res.type('css').send('h1{color:rgb(12,34,56);background-image:url(/pixel.svg)}'));
  app.get('/pixel.svg', (req, res) => res.type('svg').send('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>'));
  app.get('/popup', (req, res) => res.send('<title>Popup fixture</title><h1>Popup content</h1>'));
  app.get('/session-login', (req, res) => {
    res.cookie('fixture_transient', 'synthetic-session', { httpOnly: true, sameSite: 'lax' });
    res.redirect('/session-private');
  });
  app.get('/session-private', (req, res) => res.send(req.headers.cookie?.includes('fixture_transient=synthetic-session')
    ? '<title>Session restored fixture</title><h1>Still authenticated</h1>'
    : '<title>Logged out fixture</title>'));
  const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let uiBrowser;
  t.after(async () => {
    await uiBrowser?.close();
    await sessions.closeAll();
    await closeBrowser();
    await new Promise(resolve => server.close(resolve));
    // Remove only this test's generated profile, never a Studio/user profile.
    assert.ok(root.startsWith(scratch + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  });

  await t.test('validates names, URLs, widths and local API origin', async () => {
    for (const profile of ['../outside', 'C:\\Users', '', 'a/b']) await assert.rejects(sessions.open({ profile, url: base }), /profile/);
    await assert.rejects(sessions.open({ url: 'file:///fixture' }), /HTTP/);
    await assert.rejects(sessions.open({ url: base.replace('http://', 'http://fixture:fake@') }), /thông tin đăng nhập/);
    await assert.rejects(sessions.open({ url: base, width: 1 }), /Chiều rộng/);
    const forbidden = await fetch(base + '/api/browser/sessions', { method: 'POST', headers: { Origin: 'https://other.invalid', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(forbidden.status, 403);
    assert.equal((await fetch(base + '/api/browser/sessions', { method: 'POST', body: '{}' })).status, 415);
    assert.deepEqual(await (await fetch(base + '/api/browser/profiles')).json(), []);
  });

  await t.test('captures the selected live tab without navigating; retains sessionStorage and visual resources', async t => {
    t.after(() => sessions.closeAll());
    const opened = await sessions.open({ profile: 'fixture', url: base + '/private', width: 3840 });
    assert.equal(opened.tabs[0].url, base + '/login');
    assert.equal((await sessions.open({ profile: 'FIXTURE', url: base + '/private', width: 3840 })).id, opened.id);
    const session = sessions.get(opened.id);
    const page = session.context.pages()[0];
    await page.getByRole('button', { name: 'Đăng nhập giả lập' }).click();
    await page.waitForURL(base + '/private');
    await page.evaluate(() => { document.querySelector('h1').textContent = 'UNSAVED LIVE CONTENT'; });
    const visits = privateVisits;
    assert.equal((await sessions.open({ profile: 'fixture', url: base + '/private', width: 3840 })).id, opened.id);
    assert.equal(privateVisits, visits, 'reopening the same page must preserve the live tab');
    const pending = sessions.capture(opened.id, opened.tabs[0].id);
    await assert.rejects(sessions.capture(opened.id, opened.tabs[0].id), /đang chụp/);
    await assert.rejects(sessions.close(opened.id), /Đang chụp/);
    const result = await pending;
    assert.equal(privateVisits, visits, 'capture must not navigate/reload');
    assert.equal(result.width, 3840);
    assert.match(result.html, /UNSAVED LIVE CONTENT/);
    assert.match(result.html, /data-session="live"/);
    assert.match(result.html, /data-local="yes"/);
    assert.match(result.html, /data:image\/svg\+xml;base64,/);
    assert.ok(!result.html.includes('synthetic-password-marker'), 'password attributes must not be exported');
    assert.ok(!('cookies' in result) && !('storageState' in result));
    assert.equal(page.isClosed(), false);
    const popupPromise = page.waitForEvent('popup');
    await page.getByText('Mở tab khác').click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    const info = sessions.describe(opened.id);
    assert.equal(info.tabs.length, 2);
    const popupTab = info.tabs.find(tab => tab.url.endsWith('/popup'));
    assert.equal((await sessions.capture(opened.id, popupTab.id)).title, 'Popup fixture');
    await popup.close();
    await assert.rejects(sessions.capture(opened.id, popupTab.id), /Tab đã đóng/);
    await sessions.close(opened.id);
    assert.equal(sessions.sessions.size, 0);
    assert.deepEqual(sessions.listProfiles(), ['fixture']);
    const reopened = await sessions.open({ profile: 'fixture', url: base + '/private' });
    assert.equal(reopened.tabs.find(tab => tab.id === reopened.selectedTabId).url, base + '/private', 'profile should retain fixture login');
    await sessions.get(reopened.id).context.close();
    assert.throws(() => sessions.describe(reopened.id), /đã đóng/);
  });

  await t.test('real dialog reuses its project profile after capture, reopen and dismissal', async t => {
    t.after(() => sessions.closeAll());
    uiBrowser = await chromium.launch({ headless: true });
    const page = await uiBrowser.newPage();
    await page.goto(base);
    const openDialog = () => page.evaluate(async () => {
      const { openCaptureDialog } = await import('/js/capture-dialog.js');
      openCaptureDialog(async result => { window.fixtureResult = { title: result.title, html: result.html }; });
    });
    await openDialog();
    const selects = page.locator('.modal select');
    await selects.nth(0).selectOption('session');
    await page.getByRole('textbox', { name: 'Địa chỉ trang web', exact: true }).fill(base + '/private');
    await page.locator('.profile-settings > summary').click();
    await page.locator('input[list="studio-profile-options"]').fill('ui-fixture');
    await page.getByRole('button', { name: 'Mở trình duyệt', exact: true }).click();
    await page.getByRole('button', { name: 'Đóng phiên', exact: true }).waitFor();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Đóng phiên').disabled);
    const session = [...sessions.sessions.values()][0];
    const loginPage = session.context.pages()[0];
    await loginPage.getByRole('button', { name: 'Đăng nhập giả lập' }).click();
    await loginPage.waitForURL(base + '/private');
    await page.getByRole('button', { name: 'Cập nhật tab', exact: true }).click();
    await page.getByRole('button', { name: 'Chụp tab đã chọn', exact: true }).click();
    await page.waitForFunction(() => !!window.fixtureResult);
    assert.equal(await page.evaluate(() => window.fixtureResult.title), 'Private fixture');
    await page.waitForFunction(() => !document.querySelector('.modal'));
    await page.waitForFunction(async () => (await (await fetch('/api/browser/profiles')).json()).includes('ui-fixture'));
    assert.equal(sessions.sessions.size, 1);
    const sessionId = session.id;
    const launchCount = launches;
    await page.reload();
    await openDialog();
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Đóng phiên').disabled);
    assert.equal(await selects.nth(0).inputValue(), 'session');
    assert.equal(await page.locator('input[list="studio-profile-options"]').inputValue(), 'ui-fixture');
    assert.equal(sessions.active('ui-fixture').id, sessionId);
    assert.equal(launches, launchCount);
    assert.equal([...sessions.sessions.values()][0].context.pages()[0].url(), base + '/private');
    await page.getByRole('button', { name: 'Đóng hộp chụp', exact: true }).click();
    assert.equal(sessions.sessions.size, 1);
    assert.equal(await loginPage.evaluate(() => sessionStorage.getItem('fixture')), 'live');
    await openDialog();
    await page.getByRole('button', { name: 'Đóng phiên', exact: true }).click();
    for (let i = 0; sessions.sessions.size && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(sessions.sessions.size, 0);
    await page.getByRole('button', { name: 'Đóng hộp chụp', exact: true }).click();
  });

  await t.test('dismissing while launch is pending keeps the profile available for reconnection', async t => {
    t.after(() => sessions.closeAll());
    const page = await uiBrowser.newPage();
    await page.goto(base);
    let release;
    let started;
    const opening = new Promise(resolve => { started = resolve; });
    beforeLaunch = () => { started(); return new Promise(resolve => { release = resolve; }); };
    try {
      await page.evaluate(async () => {
        const { openCaptureDialog } = await import('/js/capture-dialog.js');
        openCaptureDialog(async () => { throw new Error('Cancelled dialog must not save a snapshot'); });
      });
      await page.locator('.modal select').nth(0).selectOption('session');
      await page.getByRole('textbox', { name: 'Địa chỉ trang web', exact: true }).fill(base + '/login');
      await page.locator('.profile-settings > summary').click();
      await page.locator('input[list="studio-profile-options"]').fill('late-fixture');
      await page.getByRole('button', { name: 'Mở trình duyệt', exact: true }).click();
      await opening;
      await page.getByRole('button', { name: 'Đóng hộp chụp', exact: true }).click();
      release();
      for (let i = 0; sessions.opening.size && i < 200; i++) await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(sessions.sessions.size, 1);
      assert.ok(sessions.active('late-fixture'));
      assert.equal(await page.locator('.modal').count(), 0);
    } finally { release?.(); beforeLaunch = async () => {}; await page.close(); }
  });

  await t.test('concurrent default opens share the fixed studio profile and preserve existing tabs', async t => {
    t.after(() => sessions.closeAll());
    const launchCount = launches;
    const opened = await Promise.all([sessions.open({ url: base + '/login' }), sessions.open({ url: base + '/login' })]);
    assert.equal(opened[0].id, opened[1].id);
    assert.equal(launches, launchCount + 1);
    assert.equal(opened[0].profile, 'studio');
    assert.equal(sessions.get(opened[0].id).context.pages().length, 1);
    assert.equal((await (await fetch(base + '/api/browser/sessions')).json()).session.id, opened[0].id);
    const another = await sessions.open({ url: base + '/popup' });
    assert.equal(another.id, opened[0].id);
    assert.equal(another.tabs.length, 2);
    assert.equal(another.tabs.find(tab => tab.id === another.selectedTabId).url, base + '/popup');
    assert.equal(launches, launchCount + 1);
  });

  await t.test('Chromium restores synthetic session cookies after restarting the profile manager', async t => {
    const restarted = new CaptureSessions({ root, launch: sessions.launch });
    t.after(() => restarted.closeAll());
    const opened = await sessions.open({ profile: 'session-cookie-fixture', url: base + '/session-login' });
    assert.equal(await sessions.get(opened.id).context.pages()[0].title(), 'Session restored fixture');
    await sessions.close(opened.id);
    const restored = await restarted.open({ profile: 'session-cookie-fixture', url: base + '/session-private' });
    const selected = restarted.get(restored.id).pages.get(restored.selectedTabId).page;
    assert.equal(await selected.title(), 'Session restored fixture');
  });

  await t.test('direct capture remains isolated', async () => {
    const result = await capture({ url: base + '/private', wait: 10, width: 390 });
    assert.equal(result.title, 'Fixture login');
    assert.equal(result.width, 390);
  });
});
