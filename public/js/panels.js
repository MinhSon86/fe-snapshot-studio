// Left-hand panels: Pages, Layers (DOM tree), Insert (draggable blocks + custom
// components), and Theme (global color palette, font swaps, text find/replace).

import { h, icon, hydrateIcons, prompt, confirmBox, toast, parseRgb, rgbToHex, rgbKey } from './ui.js';
import { BUILTIN_BLOCKS } from './blocks.js';
import { collapseSections } from './workspace-ui.js';

const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'template', 'noscript', 'title', 'head', 'base', 'br', 'path', 'g', 'defs', 'clippath', 'lineargradient', 'stop']);

const THEME_PRESETS = [
  { name: 'Indigo (Mặc định)', primary: '#4f46e5', bg: '#ffffff', text: '#0f172a' },
  { name: 'Emerald Tươi', primary: '#059669', bg: '#f8fafc', text: '#064e3b' },
  { name: 'Rose Hiện đại', primary: '#e11d48', bg: '#fff1f2', text: '#1f2937' },
  { name: 'Amber Ấm', primary: '#d97706', bg: '#fffbeb', text: '#1c1917' },
  { name: 'Dark Slate', primary: '#6366f1', bg: '#0f172a', text: '#f1f5f9' },
];

export class LeftPanels {
  constructor({ tabsNav, pagesEl, layersEl, insertEl, themeEl, canvas, app }) {
    this.tabsNav = tabsNav;
    this.pagesEl = pagesEl;
    this.layersEl = layersEl;
    this.insertEl = insertEl;
    this.themeEl = themeEl;
    this.canvas = canvas;
    this.app = app;
    this.activeTab = 'pages';
    this.collapsed = new WeakSet();
    this.sectionState = new Map();

    tabsNav.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (btn) this.switchTab(btn.dataset.tab);
    });

    canvas.on('load', () => { this.renderLayers(); if (this.activeTab === 'theme') this.renderTheme(); });
    canvas.on('change', () => { if (this.activeTab === 'layers') this.renderLayers(); });
    canvas.on('select', (el) => this.highlightLayer(el));
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.tabsNav.querySelectorAll('button[data-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.tab === tab); b.setAttribute('aria-pressed', String(b.dataset.tab === tab)); });
    this.pagesEl.classList.toggle('hidden', tab !== 'pages');
    this.layersEl.classList.toggle('hidden', tab !== 'layers');
    this.insertEl.classList.toggle('hidden', tab !== 'insert');
    this.themeEl.classList.toggle('hidden', tab !== 'theme');
    if (tab === 'pages') this.renderPages();
    if (tab === 'layers') this.renderLayers();
    if (tab === 'insert') this.renderInsert();
    if (tab === 'theme') this.renderTheme();
  }

  /* ================== 1. PAGES TAB ================== */
  renderPages() {
    const proj = this.app.project;
    this.pagesEl.innerHTML = '';
    if (!proj) return;

    const top = h('div', { class: 'panel-section' },
      h('h4', {}, 'Danh sách trang (' + proj.pages.length + ')'),
      h('div', { class: 'page-add-actions', style: { marginBottom: 0 } },
        h('button', { class: 'btn sm primary', onclick: () => this.app.openAddPageModal('url') }, h('span', { html: icon('globe') }), '+ URL'),
        h('button', { class: 'btn sm', onclick: () => this.app.openAddPageModal('folder') }, h('span', { html: icon('folder') }), '+ Mã nguồn'),
        h('button', { class: 'btn sm', onclick: () => this.app.addBlankPage() }, h('span', { html: icon('plus') }), '+ Trắng')));

    const list = h('div', { class: 'page-list' });
    proj.pages.forEach((p, idx) => {
      const item = h('div', {
        class: 'page-item' + (idx === this.app.pageIndex ? ' active' : ''),
        onclick: () => this.app.selectPage(idx),
      },
        h('div', { class: 'pthumb', style: p.thumbnail ? { backgroundImage: `url("${p.thumbnail}")` } : null }),
        h('div', { class: 'pname' },
          h('b', {}, p.name || 'Trang ' + (idx + 1)),
          h('small', {}, p.url || `${p.width || 1440}px`)),
        h('div', { class: 'pact', onclick: (e) => e.stopPropagation() },
          h('button', {
            title: 'Đổi tên', html: icon('edit'),
            onclick: async () => {
              const name = await prompt('Đổi tên trang', p.name);
              if (name != null && name.trim()) { p.name = name.trim(); this.renderPages(); this.app.scheduleSave(); }
            },
          }),
          h('button', {
            title: 'Nhân bản trang (tạo phương án B)', html: icon('copy'),
            onclick: () => this.app.duplicatePage(idx),
          }),
          proj.pages.length > 1 ? h('button', {
            title: 'Xoá trang', html: icon('trash'),
            onclick: async () => {
              if (await confirmBox('Xoá trang', `Xoá "${p.name}"?`, 'Xoá')) this.app.deletePage(idx);
            },
          }) : null));
      list.append(item);
    });

    this.pagesEl.append(top, list);
    hydrateIcons(this.pagesEl);
  }

  /* ================== 2. LAYERS TAB ================== */
  renderLayers() {
    this.layersEl.innerHTML = '';
    this.layerMap = new WeakMap();
    if (!this.canvas.body) return;
    const wrap = h('div', { class: 'layers' });
    this.buildLayerNode(this.canvas.body, 0, wrap);
    this.layersEl.append(wrap);
    this.highlightLayer(this.canvas.selected);
  }

  buildLayerNode(el, depth, container) {
    if (depth > 18) return;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    const children = Array.from(el.children).filter((c) => !SKIP_TAGS.has(c.tagName.toLowerCase()));
    const hasChildren = children.length > 0 && tag !== 'svg';
    const isCollapsed = depth >= 2 && this.collapsed.has(el) ? true : (depth >= 3 && !this.collapsed.has(el) ? (this.collapsed.add(el), true) : this.collapsed.has(el));
    const isHidden = el.hasAttribute('data-fes-hidden');

    const snippet = el.id ? '#' + el.id
      : (children.length === 0 && el.textContent.trim() ? '"' + el.textContent.trim().slice(0, 24) + '"'
      : (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : ''));

    const row = h('div', {
      class: 'layer' + (isHidden ? ' is-hidden' : ''),
      style: { paddingLeft: (8 + depth * 12) + 'px' },
      onmouseenter: () => this.canvas.setHover(el),
      onmouseleave: () => this.canvas.setHover(null),
      onclick: (e) => { e.stopPropagation(); this.canvas.select(el, { scroll: true }); },
    },
      h('span', {
        class: 'caret' + (hasChildren && !isCollapsed ? ' open' : ''),
        html: hasChildren ? icon('chevronRight') : '',
        onclick: (e) => {
          if (!hasChildren) return;
          e.stopPropagation();
          if (this.collapsed.has(el)) this.collapsed.delete(el); else this.collapsed.add(el);
          this.renderLayers();
        },
      }),
      h('span', { class: 'ltag' }, tag),
      h('span', { class: 'lname' }, snippet),
      el !== this.canvas.body ? h('button', {
        class: 'eye',
        html: icon(isHidden ? 'eyeOff' : 'eye'),
        title: 'Ẩn / Hiện',
        onclick: (e) => { e.stopPropagation(); this.canvas.toggleHidden(el); this.renderLayers(); },
      }) : null);

    this.layerMap.set(el, row);
    container.append(row);

    if (hasChildren && !isCollapsed) {
      for (const c of children) this.buildLayerNode(c, depth + 1, container);
    }
  }

  highlightLayer(el) {
    if (!this.layerMap) return;
    this.layersEl.querySelectorAll('.layer.sel').forEach((n) => n.classList.remove('sel'));
    const row = el && this.layerMap.get(el);
    if (row) {
      row.classList.add('sel');
      row.scrollIntoView({ block: 'nearest' });
    }
  }

  /* ================== 3. INSERT TAB ================== */
  renderInsert() {
    this.insertEl.innerHTML = '';
    const custom = (this.app.project && this.app.project.components) || [];

    const makeCard = (b, isCustom, idx) => {
      const card = h('div', {
        class: 'block',
        draggable: 'true',
        title: 'Kéo thả vào trang hoặc nhấp để chèn',
        ondragstart: (e) => {
          e.dataTransfer.setData('text/plain', b.name);
          this.canvas.paletteDrag = b.html;
        },
        ondragend: () => this.canvas.endPaletteDrag(),
        onclick: () => {
          this.canvas.insertHTML(b.html);
          toast('Đã chèn: ' + b.name);
        },
      },
        h('span', { html: icon(b.icon || 'box') }),
        h('span', {}, b.name),
        isCustom ? h('span', {
          class: 'del',
          onclick: (e) => {
            e.stopPropagation();
            custom.splice(idx, 1);
            this.renderInsert();
            this.app.scheduleSave();
          },
        }, 'Xoá') : null);
      return card;
    };

    const grid = h('div', { class: 'block-grid' }, BUILTIN_BLOCKS.map((b) => makeCard(b, false)));
    this.insertEl.append(
      h('div', { class: 'panel-section' },
        h('h4', {}, 'Khối giao diện (Kéo hoặc Nhấp)'),
        grid));

    const customSec = h('div', { class: 'panel-section' },
      h('h4', {}, 'Khối mẫu đã lưu (' + custom.length + ')'),
      custom.length
        ? h('div', { class: 'block-grid' }, custom.map((b, i) => makeCard(b, true, i)))
        : h('div', { class: 'panel-hint', style: { padding: '4px 0' } },
          'Chọn một phần tử bất kỳ trên trang → nhấn biểu tượng ★ để lưu thành khối dùng lại.'));
    this.insertEl.append(customSec);
    collapseSections(this.insertEl, this.sectionState, ['Khối giao diện (Kéo hoặc Nhấp)']);
    hydrateIcons(this.insertEl);
  }

  /* ================== 4. THEME TAB ================== */
  renderTheme() {
    this.themeEl.innerHTML = '';
    const doc = this.canvas.doc;
    if (!doc) return;

    /* 4.1 Color palette extracted from live page */
    const colors = this.scanColors();
    const swatchGrid = h('div', { class: 'swatches' });
    colors.slice(0, 24).forEach((item) => {
      const hex = rgbToHex(item.rgb);
      const sw = h('label', {
        class: 'swatch',
        style: { background: item.key },
        title: `${hex} (${item.count} phần tử) — Nhấp để đổi toàn trang`,
      },
        h('input', {
          type: 'color',
          value: hex,
          oninput: (e) => {
            sw.style.background = e.target.value;
            for (const [el, prop] of item.targets) el.style.setProperty(prop, e.target.value, 'important');
          },
          onchange: () => {
            this.canvas.commit();
            toast('Đã đổi màu trên ' + item.targets.length + ' vị trí');
          },
        }));
      swatchGrid.append(sw);
    });

    this.themeEl.append(
      h('div', { class: 'panel-section' },
        h('h4', {}, 'Bảng màu đang dùng trên trang',
          h('button', { class: 'icon-btn', title: 'Quét lại', html: icon('refresh'), onclick: () => this.renderTheme() })),
        colors.length ? swatchGrid : h('div', { class: 'panel-hint' }, 'Không tìm thấy màu.'),
        h('small', { style: { display: 'block', marginTop: '8px', color: 'var(--muted)' } },
          'Nhấp vào một ô màu để thay thế màu đó trên toàn bộ trang hiện tại.')));

    /* 4.2 Quick Theme Presets & Dark Mode */
    const presetSec = h('div', { class: 'panel-section' },
      h('h4', {}, 'Đổi nhanh phong cách (Presets)'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        THEME_PRESETS.map((p) =>
          h('button', {
            class: 'btn sm',
            style: { justifyContent: 'flex-start' },
            onclick: () => this.applyPreset(p),
          },
            h('span', { style: { width: '14px', height: '14px', borderRadius: '4px', background: p.primary, display: 'inline-block' } }),
            h('span', { style: { width: '14px', height: '14px', borderRadius: '4px', background: p.bg, border: '1px solid #555', display: 'inline-block' } }),
            p.name))));
    this.themeEl.append(presetSec);

    /* 4.3 Global Font Override */
    const fontSec = h('div', { class: 'panel-section' },
      h('h4', {}, 'Đổi phông chữ toàn trang'),
      h('div', { class: 'row', style: { marginBottom: 0 } },
        h('select', {
          onchange: (e) => {
            if (!e.target.value) return;
            this.applyGlobalFont(e.target.value);
          },
        },
          h('option', { value: '' }, '— Chọn phông chữ áp dụng toàn trang —'),
          h('option', { value: 'Inter, system-ui, sans-serif' }, 'Inter / Sans-serif hiện đại'),
          h('option', { value: '"Plus Jakarta Sans", system-ui, sans-serif' }, 'Plus Jakarta Sans'),
          h('option', { value: 'Poppins, system-ui, sans-serif' }, 'Poppins'),
          h('option', { value: 'Georgia, "Times New Roman", serif' }, 'Serif cổ điển (Georgia)'),
          h('option', { value: '"JetBrains Mono", Consolas, monospace' }, 'Monospace kỹ thuật'))));
    this.themeEl.append(fontSec);

    /* 4.4 Bulk Text Find & Replace */
    const findIn = h('input', { class: 'txt', placeholder: 'Từ cần tìm (ví dụ: tên thương hiệu cũ)' });
    const repIn = h('input', { class: 'txt', placeholder: 'Thay bằng (ví dụ: tên mới)' });
    const repSec = h('div', { class: 'panel-section' },
      h('h4', {}, 'Tìm & Thay thế chữ hàng loạt'),
      h('div', { class: 'row' }, findIn),
      h('div', { class: 'row' }, repIn),
      h('button', {
        class: 'btn sm primary',
        onclick: () => {
          const count = this.replaceAllText(findIn.value, repIn.value);
          toast(`Đã thay thế tại ${count} vị trí`, 'ok');
        },
      }, 'Thay thế tất cả'));
    this.themeEl.append(repSec);

    collapseSections(this.themeEl, this.sectionState, ['Bảng màu đang dùng trên trang']);
    hydrateIcons(this.themeEl);
  }

  scanColors() {
    const doc = this.canvas.doc;
    const win = this.canvas.win;
    const map = new Map();
    const props = ['color', 'background-color', 'border-top-color'];
    for (const el of [doc.body, ...doc.body.querySelectorAll('*')]) {
      if (SKIP_TAGS.has(el.tagName.toLowerCase())) continue;
      const cs = win.getComputedStyle(el);
      for (const p of props) {
        const val = cs.getPropertyValue(p);
        const rgb = parseRgb(val);
        if (!rgb || rgb.a === 0) continue;
        if (p === 'border-top-color' && parseFloat(cs.borderTopWidth) === 0) continue;
        const key = rgbKey(rgb);
        let entry = map.get(key);
        if (!entry) { entry = { key, rgb, count: 0, targets: [] }; map.set(key, entry); }
        entry.count++;
        entry.targets.push([el, p === 'border-top-color' ? 'border-color' : p]);
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  applyPreset(p) {
    const doc = this.canvas.doc;
    doc.body.style.setProperty('background-color', p.bg, 'important');
    doc.body.style.setProperty('color', p.text, 'important');
    doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((hEl) => hEl.style.setProperty('color', p.text, 'important'));
    doc.body.querySelectorAll('button, a[class*="btn"], [role="button"]').forEach((b) => {
      const bg = parseRgb(this.canvas.win.getComputedStyle(b).backgroundColor);
      if (bg && bg.a > 0.2) {
        b.style.setProperty('background-color', p.primary, 'important');
        b.style.setProperty('color', '#ffffff', 'important');
      }
    });
    this.canvas.commit();
    this.renderTheme();
    toast('Đã áp dụng phong cách: ' + p.name, 'ok');
  }

  applyGlobalFont(family) {
    const doc = this.canvas.doc;
    let s = doc.getElementById('__fes_theme_font');
    if (!s) {
      s = doc.createElement('style');
      s.id = '__fes_theme_font';
      (doc.head || doc.documentElement).appendChild(s);
    }
    s.textContent = `body, body *:not(svg):not(svg *) { font-family: ${family} !important; }`;
    this.canvas.commit();
    toast('Đã đổi phông chữ toàn trang', 'ok');
  }

  replaceAllText(find, replace) {
    if (!find) return 0;
    const walker = this.canvas.doc.createTreeWalker(this.canvas.body, NodeFilter.SHOW_TEXT);
    let count = 0;
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.includes(find)) {
        n.nodeValue = n.nodeValue.split(find).join(replace);
        count++;
      }
    }
    if (count > 0) this.canvas.commit();
    return count;
  }
}
