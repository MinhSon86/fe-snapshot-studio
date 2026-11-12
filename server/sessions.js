// Profiles belong exclusively to Studio. Never import a personal browser profile.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './paths.js';
import { launchProfile } from './browser.js';
import { capture, trackResources } from './capture.js';
import { validateViewportWidth } from '../public/js/viewport.js';

export class CaptureSessions {
  constructor({ root = path.join(DATA_DIR, 'browser-profiles'), launch = launchProfile } = {}) {
    this.root = root;
    this.launch = launch;
    this.sessions = new Map();
    this.profilesInUse = new Set();
    this.opening = new Map();
  }

  profileName(name) {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(name)) {
      throw new Error('Tên profile gồm 1–48 ký tự: chữ không dấu, số, dấu - hoặc _.');
    }
    return name.toLowerCase();
  }

  listProfiles() {
    if (!fs.existsSync(this.root)) return [];
    return fs.readdirSync(this.root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^[a-z0-9][a-z0-9_-]{0,47}$/.test(entry.name))
      .map(entry => entry.name).sort();
  }

  async open({ profile = 'studio', url, width = 1440 }) {
    profile = this.profileName(profile);
    if (typeof url !== 'string' || !url.trim() || (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^https?:\/\//i.test(url))) throw new Error('Chỉ hỗ trợ URL HTTP/HTTPS.');
    url = url.trim();
    let target;
    try { target = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`); } catch { throw new Error('URL không hợp lệ.'); }
    if (!url || !['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Chỉ hỗ trợ URL HTTP/HTTPS không chứa thông tin đăng nhập.');
    width = validateViewportWidth(width);
    // Serialize opens for a profile: repeated clicks must not launch another browser.
    while (this.opening.has(profile)) await this.opening.get(profile).catch(() => {});
    const pending = this.openProfile(profile, target, width);
    this.opening.set(profile, pending);
    try { return await pending; }
    finally { if (this.opening.get(profile) === pending) this.opening.delete(profile); }
  }

  active(profile = 'studio') {
    profile = this.profileName(profile);
    const session = [...this.sessions.values()].find(item => item.profile === profile && !item.closing);
    return session ? this.describe(session.id) : null;
  }

  async focusTarget(session, target, width) {
    let tab = [...session.pages.values()].find(tab => !tab.page.isClosed() && (tab.page.url() === target.href || tab.requestedUrl === target.href));
    if (!tab) {
      const page = session.context.pages().find(page => page.url() === 'about:blank') || await session.context.newPage();
      tab = [...session.pages.values()].find(tab => tab.page === page);
      tab.requestedUrl = target.href;
      try { await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 60000 }); }
      catch (error) { await page.close().catch(() => {}); throw error; }
    }
    if (tab.page.viewportSize()?.width !== width) await tab.page.setViewportSize({ width, height: 900 });
    await tab.page.bringToFront();
    session.selectedTabId = [...session.pages].find(([, item]) => item === tab)?.[0];
    return this.describe(session.id);
  }

  async openProfile(profile, target, width) {
    const existing = [...this.sessions.values()].find(item => item.profile === profile);
    if (existing) {
      if (existing.busy || existing.closing) throw new Error('Profile đang bận. Vui lòng chờ thao tác hiện tại hoàn tất.');
      existing.busy = true;
      try { return await this.focusTarget(existing, target, width); }
      finally { existing.busy = false; }
    }
    this.profilesInUse.add(profile);
    let context;
    let session;
    try {
      fs.mkdirSync(this.root, { recursive: true });
      const profileDir = path.join(this.root, profile);
      if (fs.existsSync(profileDir) && (fs.lstatSync(profileDir).isSymbolicLink() || !fs.statSync(profileDir).isDirectory())) throw new Error('Thư mục profile không hợp lệ.');
      context = await this.launch(profileDir, { viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      session = { id: randomUUID(), profile, context, pages: new Map(), busy: true };
      this.sessions.set(session.id, session);
      const track = page => {
        const id = randomUUID();
        const tracker = trackResources(page);
        session.pages.set(id, { page, tracker });
        page.once('close', () => { tracker.stop(); session.pages.delete(id); });
      };
      context.on('page', track);
      context.once('close', () => this.forget(session));
      context.pages().forEach(track);
      const result = await this.focusTarget(session, target, width);
      session.busy = false;
      return result;
    } catch (error) {
      if (context) await context.close().catch(() => {});
      if (session) this.forget(session);
      this.profilesInUse.delete(profile);
      throw error;
    }
  }

  get(id) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Phiên đã đóng hoặc hết hiệu lực. Hãy mở lại trình duyệt.');
    return session;
  }

  describe(id) {
    const session = this.get(id);
    return { id, profile: session.profile, selectedTabId: session.selectedTabId, tabs: [...session.pages].map(([id, { page }]) => ({ id, url: page.url() })) };
  }

  async capture(id, tabId) {
    const session = this.get(id);
    if (session.busy || session.closing) throw new Error('Phiên đang chụp hoặc xử lý thao tác khác. Vui lòng chờ.');
    const tab = session.pages.get(tabId);
    if (!tab || tab.page.isClosed()) throw new Error('Tab đã đóng. Hãy cập nhật danh sách tab.');
    if (!/^https?:\/\//i.test(tab.page.url())) throw new Error('Hãy chọn tab trang web HTTP/HTTPS.');
    session.busy = true;
    session.selectedTabId = tabId;
    try {
      return await capture({ page: tab.page, resourceCache: tab.tracker.cache });
    } finally { session.busy = false; }
  }

  forget(session) {
    if (this.sessions.get(session.id) !== session) return;
    for (const { tracker } of session.pages.values()) tracker.stop();
    session.pages.clear();
    this.sessions.delete(session.id);
    this.profilesInUse.delete(session.profile);
  }

  async close(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.busy) throw new Error('Đang chụp, hãy chờ hoàn tất trước khi đóng phiên.');
    session.closing = true;
    try { await session.context.close(); this.forget(session); }
    catch (error) { session.closing = false; throw error; }
  }

  async closeAll() {
    await Promise.allSettled([...this.opening.values()]);
    await Promise.all([...this.sessions.values()].map(session => session.context.close().catch(() => {})));
  }
}
