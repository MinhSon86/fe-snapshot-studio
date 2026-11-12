// Main controller: coordinates Home screen, Editor workspace, URL/Folder snapshot
// modals, multi-page projects, autosaving, preview, and portable .fesnap export/import.

import { h, icon, hydrateIcons, modal, prompt, confirmBox, toast, debounce, download, timeAgo, formatBytes } from './ui.js';
import { api } from './api.js';
import { openCaptureDialog } from './capture-dialog.js';
import { Canvas } from './canvas.js';
import { Inspector } from './inspector.js';
import { LeftPanels } from './panels.js';
import { BLANK_PAGE_HTML } from './blocks.js';
import { VIEWPORT_PRESETS, validateViewportWidth } from './viewport.js';
import { setupWorkspace } from './workspace-ui.js';

class App {
  constructor() {
    this.project = null;
    this.pageIndex = 0;

    this.homeEl = document.getElementById('home');
    this.editorEl = document.getElementById('editor');
    this.projectListEl = document.getElementById('project-list');
    this.nameInput = document.getElementById('project-name');
    this.saveStateEl = document.getElementById('save-state');
    this.vpInput = document.getElementById('vp-width');
    this.zoomSelect = document.getElementById('zoom');
    this.undoBtn = document.getElementById('btn-undo');
    this.redoBtn = document.getElementById('btn-redo');

    this.canvas = new Canvas({
      area: document.getElementById('canvas-area'),
      stage: document.getElementById('stage'),
      wrap: document.getElementById('frame-wrap'),
      frame: document.getElementById('frame'),
      overlay: document.getElementById('overlay'),
      hoverBox: document.getElementById('ov-hover'),
      selectBox: document.getElementById('ov-select'),
      label: document.getElementById('ov-label'),
      dropBox: document.getElementById('ov-drop'),
      toolbar: document.getElementById('ov-toolbar'),
      shield: document.getElementById('shield'),
      ctxMenu: document.getElementById('ctx-menu'),
    });

    this.inspector = new Inspector(document.getElementById('inspector'), this.canvas);
    this.panels = new LeftPanels({
      tabsNav: document.getElementById('left-tabs'),
      pagesEl: document.getElementById('tab-pages'),
      layersEl: document.getElementById('tab-layers'),
      insertEl: document.getElementById('tab-insert'),
      themeEl: document.getElementById('tab-theme'),
      canvas: this.canvas,
      app: this,
    });

    this.scheduleSave = debounce(() => this.saveCurrentProject(), 900);
    this.bindEvents();
    setupWorkspace(this.canvas);
    hydrateIcons();
    this.refreshHome();
  }

  bindEvents() {
    document.querySelectorAll('[data-start]').forEach((btn) => {
      btn.addEventListener('click', () => this.handleStart(btn.dataset.start));
    });

    document.getElementById('btn-home').onclick = async () => {
      await this.saveCurrentProject();
      this.showHome();
    };

    this.nameInput.onchange = () => {
      if (!this.project) return;
      this.project.name = this.nameInput.value.trim() || 'Không tên';
      this.scheduleSave();
    };

    this.undoBtn.onclick = () => this.canvas.undo();
    this.redoBtn.onclick = () => this.canvas.redo();

    document.querySelectorAll('#viewport-group button[data-vp]').forEach((b) => {
      b.onclick = () => this.canvas.setViewport(Number(b.dataset.vp));
    });
    this.vpInput.onchange = () => this.canvas.setViewport(Number(this.vpInput.value) || 1440);
    document.getElementById('vp-preset').onchange = (event) => {
      if (event.target.value === 'custom') { this.vpInput.focus(); this.vpInput.select(); }
      else this.canvas.setViewport(Number(event.target.value));
    };
    document.getElementById('btn-capture-url').onclick = () => this.openCaptureUrlModal({ createNewProject: false });
    this.zoomSelect.onchange = () => this.canvas.setZoom(this.zoomSelect.value);

    const expBtn = document.getElementById('btn-export');
    const expMenu = document.getElementById('export-menu');
    const closeExport = () => { expMenu.classList.remove('open'); expBtn.setAttribute('aria-expanded', 'false'); };
    expBtn.onclick = (e) => {
      e.stopPropagation();
      expMenu.classList.toggle('open');
      expBtn.setAttribute('aria-expanded', String(expMenu.classList.contains('open')));
      if (expMenu.classList.contains('open')) {
        const rect = expBtn.getBoundingClientRect();
        Object.assign(expMenu.style, {
          position: 'fixed', right: 'auto',
          left: Math.max(8, Math.min(innerWidth - expMenu.offsetWidth - 8, rect.right - expMenu.offsetWidth)) + 'px',
          top: rect.bottom + 6 + 'px', maxHeight: Math.max(80, innerHeight - rect.bottom - 14) + 'px', overflowY: 'auto',
        });
      }
    };
    window.addEventListener('click', closeExport);
    window.addEventListener('resize', closeExport);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && expMenu.classList.contains('open')) { closeExport(); expBtn.focus(); event.stopImmediatePropagation(); }
    }, true);
    expMenu.querySelectorAll('[data-export]').forEach((b) => {
      b.onclick = () => this.handleExport(b.dataset.export);
    });

    document.getElementById('btn-preview').onclick = () => this.openPreview();

    const fileImp = document.getElementById('file-import');
    fileImp.onchange = async () => {
      const f = fileImp.files[0];
      fileImp.value = '';
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const meta = await api.importProject(data);
        toast('Đã nhập project: ' + meta.name, 'ok');
        await this.openProject(meta.id);
      } catch (e) {
        toast('Lỗi mở file: ' + e.message, 'error');
      }
    };

    this.canvas.on('change', () => {
      if (!this.project) return;
      const page = this.project.pages[this.pageIndex];
      if (page) page.html = this.canvas.serialize();
      this.saveStateEl.textContent = 'Đang lưu...';
      this.scheduleSave();
    });

    this.canvas.on('history', () => {
      this.undoBtn.disabled = !this.canvas.canUndo();
      this.redoBtn.disabled = !this.canvas.canRedo();
    });

    this.canvas.on('viewport', (w) => {
      this.vpInput.value = w;
      document.getElementById('vp-preset').value = VIEWPORT_PRESETS.includes(w) ? String(w) : 'custom';
      if (this.project?.pages[this.pageIndex]) {
        this.project.pages[this.pageIndex].width = w;
        this.scheduleSave();
      }
      document.querySelectorAll('#viewport-group button[data-vp]').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.vp) === w);
      });
    });

    this.canvas.on('toast', (msg) => toast(msg));
    this.canvas.on('save-request', () => { this.scheduleSave.flush(); toast('Đã lưu project', 'ok'); });
    this.canvas.on('save-component', async (el) => {
      const name = await prompt('Lưu thành khối mẫu', el.tagName.toLowerCase(), 'Tên khối (để dùng lại trong mục Chèn):');
      if (!name) return;
      this.project.components = this.project.components || [];
      this.project.components.push({ name: name.trim(), html: el.outerHTML, icon: 'star' });
      this.scheduleSave();
      this.panels.switchTab('insert');
      toast('Đã lưu vào mục Chèn', 'ok');
    });

    window.addEventListener('keydown', (e) => this.canvas.handleKey(e));
  }

  /* ---------------- screens ---------------- */
  async showHome() {
    this.editorEl.classList.add('hidden');
    this.homeEl.classList.remove('hidden');
    await this.refreshHome();
  }

  showEditor() {
    this.homeEl.classList.add('hidden');
    this.editorEl.classList.remove('hidden');
  }

  async refreshHome() {
    const list = await api.projects().catch(() => []);
    this.projectListEl.innerHTML = '';
    if (!list.length) {
      this.projectListEl.append(h('div', { class: 'empty-note' }, 'Chưa có project nào. Hãy chọn một trong 4 cách ở trên để bắt đầu!'));
      return;
    }
    for (const p of list) {
      const card = h('div', { class: 'project-card', onclick: () => this.openProject(p.id) },
        p.thumbnail
          ? h('div', { class: 'thumb', style: { backgroundImage: `url("${p.thumbnail}")` } })
          : h('div', { class: 'thumb empty' }, 'Không có ảnh xem trước'),
        h('div', { class: 'meta' },
          h('div', { class: 't' },
            h('b', {}, p.name),
            h('small', {}, `${p.pageCount} trang · ${timeAgo(p.updatedAt)} · ${formatBytes(p.sizeBytes || 0)}`)),
          h('button', {
            class: 'icon-btn',
            title: 'Tải file .fesnap mang sang máy khác',
            html: icon('download'),
            onclick: (e) => { e.stopPropagation(); window.location.href = `/api/projects/${p.id}/download`; },
          }),
          h('button', {
            class: 'icon-btn',
            title: 'Xoá project',
            html: icon('trash'),
            onclick: async (e) => {
              e.stopPropagation();
              if (await confirmBox('Xoá project', `Bạn có chắc muốn xoá "${p.name}"?`, 'Xoá')) {
                await api.deleteProject(p.id);
                this.refreshHome();
              }
            },
          })));
      this.projectListEl.append(card);
    }
  }

  handleStart(mode) {
    if (mode === 'url') return this.openCaptureUrlModal({ createNewProject: true });
    if (mode === 'folder') return this.openFolderModal({ createNewProject: true });
    if (mode === 'blank') return this.createBlankProject();
    if (mode === 'import') document.getElementById('file-import').click();
  }

  /* ---------------- project lifecycle ---------------- */
  async createBlankProject() {
    const proj = {
      name: 'Thiết kế Demo mới',
      pages: [{ name: 'Trang chủ', width: 1440, html: BLANK_PAGE_HTML }],
      components: [],
    };
    const meta = await api.saveProject(proj);
    await this.openProject(meta.id);
  }

  async openProject(id) {
    const proj = await api.project(id);
    this.project = proj;
    this.nameInput.value = proj.name || 'Không tên';
    this.showEditor();
    await this.selectPage(0, { savePrevious: false });
    this.panels.renderPages();
  }

  async selectPage(idx, { savePrevious = true } = {}) {
    if (!this.project || !this.project.pages[idx]) return;
    if (savePrevious && this.canvas.doc && this.project.pages[this.pageIndex]) {
      this.project.pages[this.pageIndex].html = this.canvas.serialize();
    }
    this.pageIndex = idx;
    const page = this.project.pages[idx];
    const width = page.width || 1440;
    this.vpInput.value = width;
    const preset = document.getElementById('vp-preset');
    if (preset) preset.value = VIEWPORT_PRESETS.includes(width) ? String(width) : 'custom';
    await this.canvas.load(page.html, { width });
    this.panels.renderPages();
  }

  async addPageToCurrent(page) {
    this.project.pages.push(page);
    await this.selectPage(this.project.pages.length - 1);
    await this.saveCurrentProject();
  }

  async addBlankPage() {
    await this.addPageToCurrent({
      name: 'Trang ' + (this.project.pages.length + 1),
      width: 1440,
      html: BLANK_PAGE_HTML,
    });
  }

  async duplicatePage(idx) {
    if (idx === this.pageIndex && this.canvas.doc) {
      this.project.pages[idx].html = this.canvas.serialize();
    }
    const src = this.project.pages[idx];
    const copy = JSON.parse(JSON.stringify(src));
    copy.name = (src.name || 'Trang') + ' (Bản sao)';
    this.project.pages.splice(idx + 1, 0, copy);
    await this.selectPage(idx + 1);
    await this.saveCurrentProject();
    toast('Đã nhân bản trang', 'ok');
  }

  async deletePage(idx) {
    if (this.project.pages.length <= 1) return;
    this.project.pages.splice(idx, 1);
    const next = Math.min(this.pageIndex, this.project.pages.length - 1);
    this.pageIndex = next;
    await this. canvas.load(this.project.pages[next].html, { width: this.project.pages[next].width || 1440 });
    this.panels.renderPages();
    await this.saveCurrentProject();
  }

  async saveCurrentProject() {
    if (!this.project) return;
    if (this.canvas.doc && this.project.pages[this.pageIndex]) {
      this.project.pages[this.pageIndex].html = this.canvas.serialize();
      this.project.pages[this.pageIndex].width = this.canvas.width;
    }
    try {
      await api.saveProject(this.project);
      this.saveStateEl.textContent = 'Đã lưu tự động';
    } catch (e) {
      this.saveStateEl.textContent = 'Lỗi lưu';
    }
  }

  openAddPageModal(mode) {
    if (mode === 'url') this.openCaptureUrlModal({ createNewProject: false });
    else this.openFolderModal({ createNewProject: false });
  }

  /* ---------------- URL Snapshot Modal ---------------- */
  openCaptureUrlModal({ createNewProject }) {
    return openCaptureDialog(async (res) => {
      const page = { name: res.title || res.url, url: res.url, width: res.width, html: res.html, thumbnail: res.thumbnail };
      if (createNewProject) {
        const meta = await api.saveProject({ name: page.name, pages: [page], components: [] });
        await this.openProject(meta.id);
      } else {
        await this.addPageToCurrent(page);
      }
    });
  }

  /* ---------------- Source Folder Runner & Snapshot Modal ---------------- */
  openFolderModal({ createNewProject }) {
    const dirIn = h('input', { class: 'txt', placeholder: 'C:\\du-an-cua-ban hoặc chọn thư mục bên dưới...' });
    const detectBadge = h('div', { class: 'detect-badge' });
    const dirList = h('div', { class: 'dir-list' });
    const logBox = h('div', { class: 'log-box hidden' });
    const routeIn = h('input', { class: 'txt', value: '/', placeholder: '/ hoặc /dashboard' });
    const captureWidthIn = h('input', { class: 'txt', type: 'number', min: 240, max: 7680, step: 1, value: 1920, 'aria-label': 'Chiều rộng chụp mã nguồn' });
    const statusLine = h('div', { style: { marginBottom: '8px' } });
    let activeJobId = null;
    let pollTimer = null;

    const loadDir = async (p) => {
      try {
        const d = await api.listDir(p);
        if (d.path) dirIn.value = d.path;
        detectBadge.textContent = d.detected ? `✓ Nhận diện: ${d.detected.label}` : 'Chọn một thư mục chứa mã nguồn (React, Vue, Next, Vite, Angular, HTML, Django, Flask, PHP...)';
        detectBadge.style.color = d.detected ? 'var(--ok)' : 'var(--muted)';
        dirList.innerHTML = '';
        if (d.parent !== null) {
          dirList.append(h('div', { class: 'dir-item', onclick: () => loadDir(d.parent) }, h('span', { html: icon('arrowUpLeft') }), '.. (Thư mục cha)'));
        }
        for (const sub of d.dirs) {
          dirList.append(h('div', { class: 'dir-item', onclick: () => loadDir(sub.path) }, h('span', { html: icon('folder') }), sub.name));
        }
        hydrateIcons(dirList);
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    dirIn.onchange = () => loadDir(dirIn.value);

    const stopRunner = () => {
      clearInterval(pollTimer);
      if (activeJobId) { api.stopJob(activeJobId).catch(() => {}); activeJobId = null; }
    };

    const runAndCapture = async (close) => {
      const dir = dirIn.value.trim();
      if (!dir) return toast('Hãy chọn thư mục mã nguồn', 'error');
      logBox.classList.remove('hidden');
      logBox.textContent = 'Đang khởi chạy...';
      try {
        const captureWidth = validateViewportWidth(captureWidthIn.value);
        const job = await api.run(dir);
        activeJobId = job.id;
        pollTimer = setInterval(async () => {
          try {
            const j = await api.job(activeJobId);
            logBox.textContent = (j.logs || []).join('\n');
            logBox.scrollTop = logBox.scrollHeight;
            statusLine.innerHTML = `<span class="status-pill ${j.status}">${j.status === 'ready' ? '✓ Đã chạy tại ' + j.url : 'Đang ' + j.status + '...'}</span>`;
            if (j.status === 'error') {
              clearInterval(pollTimer);
              toast(j.error || 'Chạy dự án thất bại', 'error');
            } else if (j.status === 'ready' && j.url) {
              clearInterval(pollTimer);
              statusLine.innerHTML = `<span class="status-pill ready">Đang chụp giao diện từ ${j.url}...</span>`;
              const targetUrl = new URL(routeIn.value.trim() || '/', j.url).href;
              const snap = await api.capture({ url: targetUrl, width: captureWidth });
              stopRunner();
              const folderName = dir.split(/[\\/]/).filter(Boolean).pop() || 'Source Project';
              const page = { name: snap.title || folderName, url: targetUrl, width: snap.width, html: snap.html, thumbnail: snap.thumbnail };
              close();
              if (createNewProject) {
                const meta = await api.saveProject({ name: folderName, pages: [page], components: [] });
                await this.openProject(meta.id);
              } else {
                await this.addPageToCurrent(page);
              }
              toast('Đã chạy mã nguồn & chụp giao diện thành công!', 'ok');
            }
          } catch (err) {
            clearInterval(pollTimer);
            toast(err.message, 'error');
          }
        }, 1200);
      } catch (e) {
        toast(e.message, 'error');
      }
    };

    modal({
      title: 'Mở thư mục mã nguồn → Tự cài công cụ, chạy & chụp giao diện',
      width: '680px',
      body: h('div', {},
        h('div', { class: 'form-row' },
          h('label', {}, 'Đường dẫn thư mục dự án'),
          dirIn,
          detectBadge),
        h('div', { class: 'form-row' }, h('label', {}, 'Duyệt thư mục trên máy'), dirList),
        h('div', { class: 'form-row' }, h('label', {}, 'Đường dẫn trang cần chụp (Route)'), routeIn),
        h('div', { class: 'form-row' }, h('label', {}, 'Chiều rộng khi chụp (240–7680px)'), captureWidthIn),
        statusLine,
        logBox),
      actions: [
        { label: 'Đóng', onClick: (close) => { stopRunner(); close(); } },
        { label: 'Chạy dự án & Chụp giao diện', primary: true, onClick: runAndCapture },
      ],
      onClose: stopRunner,
    });

    loadDir('');
  }

  /* ---------------- Preview & Export ---------------- */
  openPreview() {
    const html = this.canvas.serialize();
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  async handleExport(kind) {
    if (!this.project) return;
    await this.saveCurrentProject();
    const page = this.project.pages[this.pageIndex];
    const safeName = (this.project.name || 'demo').replace(/[^\p{L}\p{N}_ -]/gu, '_');

    if (kind === 'html') {
      download(`${safeName}-${page.name || 'page'}.html`, this.canvas.serialize(), 'text/html;charset=utf-8');
      toast('Đã xuất file HTML độc lập', 'ok');
    } else if (kind === 'png') {
      toast('Đang kết xuất ảnh PNG...');
      try {
        const png = await api.exportPng({ html: this.canvas.serialize(), width: this.canvas.width, fullPage: true });
        download(`${safeName}-${page.name || 'page'}.png`, png, 'image/png');
        toast('Đã xuất ảnh PNG', 'ok');
      } catch (e) {
        toast('Lỗi xuất PNG: ' + e.message, 'error');
      }
    } else if (kind === 'fesnap') {
      window.location.href = `/api/projects/${this.project.id}/download`;
      toast('Đang tải file .fesnap (có thể mang sang máy khác)', 'ok');
    }
  }
}

new App();
