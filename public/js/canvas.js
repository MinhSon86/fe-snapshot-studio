// Canvas: hosts the snapshot inside an iframe and turns it into an editable,
// drag-and-drop design surface (selection, hover, inline text editing, resizing,
// reordering, inserting, undo/redo).
import { MIN_VIEWPORT_WIDTH, MAX_VIEWPORT_WIDTH } from './viewport.js';

const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr',
  'svg', 'video', 'audio', 'iframe', 'canvas', 'textarea', 'select', 'picture', 'object', 'progress', 'meter']);
const INLINE_TEXT = /^(p|h[1-6]|span|a|button|label|strong|em|b|i|u|small|code|pre|sup|sub|mark|abbr|cite|q|time|s|del|ins)$/;
const NON_VISUAL = new Set(['script', 'style', 'link', 'meta', 'template', 'noscript', 'title', 'head', 'base', 'br']);
const EDITOR_STYLE_ID = '__fes_editor';
const EDITOR_CSS = `iframe,embed,object,video{pointer-events:none!important}
[contenteditable="true"]{outline:none!important;cursor:text!important;-webkit-user-modify:read-write}
html{scroll-behavior:auto!important}`;

export const STYLE_COPY_PROPS = ['color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-transform', 'text-align', 'text-decoration-line', 'padding-top', 'padding-right', 'padding-bottom',
  'padding-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style',
  'border-right-style', 'border-bottom-style', 'border-left-style', 'border-top-color', 'border-right-color', 'border-bottom-color',
  'border-left-color', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'box-shadow', 'opacity'];

function sanitize(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  const clean = (root) => {
    root.querySelectorAll('script, base, meta[http-equiv]').forEach((n) => n.remove());
    root.querySelectorAll('set, animate').forEach((n) => { if (/href/i.test(n.getAttribute('attributeName') || '')) n.remove(); });
    root.querySelectorAll('iframe').forEach((f) => {
      f.removeAttribute('srcdoc');
      if (!/^https?:/i.test(f.getAttribute('src') || '')) f.remove();
    });
    root.querySelectorAll('*').forEach((el) => {
      for (const a of Array.from(el.attributes)) {
        if (/^on/i.test(a.name)) el.removeAttribute(a.name);
        else if (/^(href|src|xlink:href|action|formaction|data)$/i.test(a.name) && /^\s*javascript:/i.test(a.value)) el.setAttribute(a.name, '#');
      }
    });
    root.querySelectorAll('template').forEach((t) => clean(t.content));
  };
  clean(d);
  return '<!DOCTYPE html>\n' + d.documentElement.outerHTML;
}

const escAttr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export class Canvas {
  constructor(els) {
    this.els = els; // { area, stage, wrap, frame, overlay, hoverBox, selectBox, label, dropBox, toolbar, shield, ctxMenu }
    this.handlers = {};
    this.selected = null;
    this.hovered = null;
    this.editing = null;
    this.drag = null;
    this.pending = null;
    this.resizing = null;
    this.zoomMode = 'fit';
    this.zoom = 1;
    this.width = 1440;
    this.history = [];
    this.hIndex = -1;
    this.clipboard = null;
    this.styleClipboard = null;
    this.paletteDrag = null;
    this.doc = null;

    this.bindChrome();
    const tick = () => { requestAnimationFrame(tick); this.renderOverlay(); };
    requestAnimationFrame(tick);
    new ResizeObserver(() => this.layout()).observe(els.area);
  }

  /* ---------------- events ---------------- */
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); }
  emit(evt, ...args) { (this.handlers[evt] || []).forEach((fn) => fn(...args)); }

  /* ---------------- loading / serialising ---------------- */
  async load(html, { width } = {}) {
    this.selected = this.hovered = this.editing = this.drag = null;
    if (width) this.width = width;
    const frame = this.els.frame;
    await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = sanitize(html); });
    this.doc = frame.contentDocument;
    this.win = frame.contentWindow;
    this.attachDocEvents();
    this.history = [this.snapshot()];
    this.hIndex = 0;
    this.layout();
    this.emit('load');
    this.emit('select', null);
    this.emit('history');
  }

  get body() { return this.doc && this.doc.body; }

  innerHTMLOf(el) {
    return el.getHTML ? el.getHTML({ serializableShadowRoots: true }) : el.innerHTML;
  }

  snapshot() {
    const de = this.doc.documentElement;
    return { attrs: Array.from(de.attributes).map((a) => [a.name, a.value]), inner: this.innerHTMLOf(de) };
  }

  restore(s) {
    const de = this.doc.documentElement;
    for (const a of Array.from(de.attributes)) de.removeAttribute(a.name);
    for (const [k, v] of s.attrs) de.setAttribute(k, v);
    if (de.setHTMLUnsafe) de.setHTMLUnsafe(s.inner); else de.innerHTML = s.inner;
  }

  /** Clean, standalone HTML of the current page (editor artefacts removed). */
  serialize() {
    if (!this.doc) return '';
    if (this.editing) this.stopEditing();
    const s = this.snapshot();
    const inner = s.inner.replace(new RegExp(`<style id="${EDITOR_STYLE_ID}">[\\s\\S]*?</style>`), '');
    const attrs = s.attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
    return `<!DOCTYPE html>\n<html${attrs}>${inner}</html>`;
  }

  /* ---------------- history ---------------- */
  commit() {
    if (!this.doc) return;
    const s = this.snapshot();
    const cur = this.history[this.hIndex];
    if (cur && cur.inner === s.inner && JSON.stringify(cur.attrs) === JSON.stringify(s.attrs)) return;
    this.history.splice(this.hIndex + 1);
    this.history.push(s);
    this.hIndex = this.history.length - 1;
    // Keep memory bounded (snapshots can be several MB each).
    let total = this.history.reduce((n, x) => n + x.inner.length, 0);
    while (this.history.length > 2 && (this.history.length > 60 || total > 250e6)) {
      total -= this.history.shift().inner.length;
      this.hIndex--;
    }
    this.emit('change');
    this.emit('history');
  }

  canUndo() { return this.hIndex > 0; }
  canRedo() { return this.hIndex < this.history.length - 1; }
  undo() { if (this.canUndo()) this.travel(this.hIndex - 1); }
  redo() { if (this.canRedo()) this.travel(this.hIndex + 1); }
  travel(i) {
    if (this.editing) this.stopEditing(false);
    const path = this.selected ? this.pathOf(this.selected) : null;
    this.hIndex = i;
    this.restore(this.history[i]);
    this.ensureEditorStyle();
    this.hovered = null;
    this.select(path ? this.fromPath(path) : null);
    this.emit('change');
    this.emit('history');
  }

  pathOf(el) {
    const p = [];
    while (el && el !== this.doc.documentElement) {
      const parent = el.parentElement;
      if (!parent) return null;
      p.unshift(Array.prototype.indexOf.call(parent.children, el));
      el = parent;
    }
    return p;
  }
  fromPath(p) {
    let el = this.doc.documentElement;
    for (const i of p) { el = el && el.children[i]; }
    return el || null;
  }

  /* ---------------- layout / zoom ---------------- */
  setViewport(width) {
    if (!Number.isFinite(width)) return;
    this.width = Math.max(MIN_VIEWPORT_WIDTH, Math.min(MAX_VIEWPORT_WIDTH, Math.round(width)));
    this.layout();
    this.emit('viewport', this.width);
  }
  setZoom(mode) { this.zoomMode = mode; this.layout(); }
  layout() {
    const { area, stage, wrap, frame } = this.els;
    const aw = area.clientWidth - 40;
    const ah = area.clientHeight - 40;
    const z = this.zoomMode === 'fit' ? Math.min(1, aw / this.width) : Number(this.zoomMode);
    this.zoom = z;
    const H = Math.max(300, Math.round(ah / z));
    frame.style.width = this.width + 'px';
    frame.style.height = H + 'px';
    wrap.style.transform = `scale(${z})`;
    stage.style.width = this.width * z + 'px';
    stage.style.height = H * z + 'px';
    this.frameH = H;
  }

  /* ---------------- selection ---------------- */
  select(el, { scroll = false } = {}) {
    if (el && this.doc && el === this.doc.documentElement) el = this.body;
    if (this.editing && el !== this.editing) this.stopEditing();
    this.selected = el || null;
    if (el && scroll) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > this.frameH) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
    this.emit('select', this.selected);
  }
  setHover(el) { this.hovered = el; }

  labelFor(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '';
    return tag + (id || cls);
  }

  /* ---------------- overlay rendering ---------------- */
  placeBox(box, el) {
    if (!el || !el.isConnected) { box.style.display = 'none'; return null; }
    const r = el.getBoundingClientRect();
    const z = this.zoom;
    Object.assign(box.style, { display: 'block', left: r.left * z + 'px', top: r.top * z + 'px', width: r.width * z + 'px', height: r.height * z + 'px' });
    return r;
  }

  renderOverlay() {
    const { hoverBox, selectBox, label, toolbar } = this.els;
    if (!this.doc) { hoverBox.style.display = selectBox.style.display = toolbar.style.display = 'none'; return; }
    this.placeBox(hoverBox, !this.drag && !this.resizing && this.hovered !== this.selected ? this.hovered : null);
    const r = this.placeBox(selectBox, this.selected);
    if (!r) { toolbar.style.display = 'none'; return; }
    const z = this.zoom;
    const txt = `${this.labelFor(this.selected)}  ${Math.round(r.width)}×${Math.round(r.height)}`;
    if (label.textContent !== txt) label.textContent = txt;
    label.classList.toggle('below', r.top * z < 24);
    const editing = !!this.editing || !!this.drag;
    toolbar.style.display = editing ? 'none' : 'flex';
    selectBox.querySelectorAll('.ov-handle').forEach((hd) => { hd.style.display = editing || this.selected === this.body ? 'none' : 'block'; });
    if (!editing) {
      const tw = toolbar.offsetWidth || 200;
      const sw = this.width * z;
      const sh = this.frameH * z;
      let left = Math.min(r.right * z - tw, sw - tw - 4);
      left = Math.max(4, left);
      let top = r.bottom * z + 8;
      if (top + 36 > sh) top = r.top * z - 40;
      top = Math.max(4, Math.min(top, sh - 40));
      toolbar.style.left = left + 'px';
      toolbar.style.top = top + 'px';
    }
  }

  showDrop(drop) {
    const box = this.els.dropBox;
    if (!drop) { box.style.display = 'none'; return; }
    const r = drop.ref.getBoundingClientRect();
    const z = this.zoom;
    box.classList.toggle('inside', drop.where === 'inside');
    let s;
    if (drop.where === 'inside') s = { left: r.left * z, top: r.top * z, width: r.width * z, height: r.height * z };
    else if (drop.horizontal) s = { left: (drop.where === 'before' ? r.left : r.right) * z - 2, top: r.top * z, width: 4, height: r.height * z };
    else s = { left: r.left * z, top: (drop.where === 'before' ? r.top : r.bottom) * z - 2, width: r.width * z, height: 4 };
    Object.assign(box.style, { display: 'block', left: s.left + 'px', top: s.top + 'px', width: s.width + 'px', height: s.height + 'px' });
  }

  /* ---------------- document events ---------------- */
  ensureEditorStyle() {
    if (this.doc.getElementById(EDITOR_STYLE_ID)) return;
    const s = this.doc.createElement('style');
    s.id = EDITOR_STYLE_ID;
    s.textContent = EDITOR_CSS;
    (this.doc.head || this.doc.documentElement).appendChild(s);
  }

  attachDocEvents() {
    const d = this.doc;
    this.ensureEditorStyle();
    d.addEventListener('mousemove', (e) => this.onMove(e), true);
    d.addEventListener('mousedown', (e) => this.onDown(e), true);
    d.addEventListener('mouseup', (e) => this.onUp(e), true);
    d.addEventListener('click', (e) => {
      if (!(this.editing && this.editing.contains(e.target))) e.preventDefault();
      e.stopPropagation();
    }, true);
    d.addEventListener('auxclick', (e) => e.preventDefault(), true);
    d.addEventListener('dblclick', (e) => this.onDbl(e), true);
    d.addEventListener('contextmenu', (e) => this.onContext(e), true);
    d.addEventListener('keydown', (e) => this.handleKey(e), true);
    d.addEventListener('submit', (e) => e.preventDefault(), true);
    d.addEventListener('dragstart', (e) => { if (!this.paletteDrag) e.preventDefault(); }, true);
    d.addEventListener('dragover', (e) => this.onPaletteOver(e), true);
    d.addEventListener('drop', (e) => this.onPaletteDrop(e), true);
    d.addEventListener('paste', (e) => {
      if (!this.editing) return;
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      d.execCommand('insertText', false, text);
    }, true);
    d.documentElement.addEventListener('mouseleave', () => { this.hovered = null; });
  }

  targetOf(t) {
    if (!t || t.nodeType !== 1) t = t && t.parentElement;
    if (!t) return null;
    if (t === this.doc.documentElement) return this.body;
    return t;
  }

  onMove(e) {
    if (this.drag) { this.dragMove(e.clientX, e.clientY); return; }
    if (this.pending && this.pending.el) {
      const dx = e.clientX - this.pending.x;
      const dy = e.clientY - this.pending.y;
      if (dx * dx + dy * dy > 25 && this.pending.el !== this.body) {
        this.startDrag(this.pending.el);
        this.pending = null;
        this.dragMove(e.clientX, e.clientY);
        return;
      }
    }
    if (!this.editing) this.hovered = this.targetOf(e.target);
  }

  onDown(e) {
    this.hideContextMenu();
    if (e.button !== 0) return;
    if (this.editing && this.editing.contains(e.target)) return;
    if (this.editing) this.stopEditing();
    e.preventDefault();
    const target = this.targetOf(e.target);
    if (!target) return;
    if (this.selected && this.selected !== this.body && this.selected.contains(target)) {
      this.pending = { x: e.clientX, y: e.clientY, el: this.selected, clickTarget: target };
    } else {
      this.select(target);
      this.pending = { x: e.clientX, y: e.clientY, el: target, clickTarget: target };
    }
  }

  onUp() {
    if (this.drag) { this.endDrag(true); return; }
    if (this.pending) {
      const t = this.pending.clickTarget;
      this.pending = null;
      if (t && t !== this.selected) this.select(t);
    }
  }

  onDbl(e) {
    const t = this.targetOf(e.target);
    if (!t || t === this.body) return;
    if (this.canEditText(t)) { this.select(t); this.startEditing(t, e); }
  }

  canEditText(el) {
    const tag = el.tagName.toLowerCase();
    if (VOID.has(tag) || el.closest('svg')) return false;
    return el.textContent.trim().length > 0 || INLINE_TEXT.test(tag);
  }

  /* ---------------- inline text editing ---------------- */
  startEditing(el, e) {
    if (!el) return;
    this.editing = el;
    this.editStart = el.innerHTML;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    el.focus();
    const sel = this.win.getSelection();
    sel.removeAllRanges();
    const r = e && this.doc.caretRangeFromPoint ? this.doc.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (r && el.contains(r.startContainer)) sel.addRange(r);
    else { const range = this.doc.createRange(); range.selectNodeContents(el); sel.addRange(range); }
    this.emit('editing', true);
  }

  stopEditing(commit = true) {
    const el = this.editing;
    if (!el) return;
    this.editing = null;
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
    try { this.win.getSelection().removeAllRanges(); } catch { /* ignore */ }
    if (commit && el.innerHTML !== this.editStart) this.commit();
    this.emit('editing', false);
    this.emit('select', this.selected);
  }

  /* ---------------- drag & drop (move) ---------------- */
  startDrag(el) {
    if (!el || el === this.body) return;
    this.drag = { el, drop: null, prev: [el.style.getPropertyValue('opacity'), el.style.getPropertyPriority('opacity')] };
    el.style.setProperty('opacity', '0.35', 'important');
    this.hovered = null;
  }

  dragMove(x, y) {
    if (!this.drag) return;
    this.autoScroll(y);
    const t = this.doc.elementFromPoint(x, y);
    this.drag.drop = this.computeDrop(t, x, y, this.drag.el);
    this.showDrop(this.drag.drop);
  }

  endDrag(apply) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const [v, p] = d.prev;
    if (v) d.el.style.setProperty('opacity', v, p); else d.el.style.removeProperty('opacity');
    if (!d.el.getAttribute('style')) d.el.removeAttribute('style');
    this.showDrop(null);
    if (apply && d.drop) {
      this.placeNode(d.el, d.drop);
      this.select(d.el);
      this.commit();
    }
  }

  autoScroll(y) {
    const se = this.doc.scrollingElement || this.doc.documentElement;
    if (y < 40) se.scrollTop -= 18;
    else if (y > this.frameH - 40) se.scrollTop += 18;
  }

  isContainer(el) {
    const tag = el.tagName.toLowerCase();
    if (VOID.has(tag) || INLINE_TEXT.test(tag) || el.closest('svg')) return false;
    return true;
  }

  computeDrop(t, x, y, dragged) {
    t = this.targetOf(t);
    if (!t) return null;
    if (dragged && (dragged === t || dragged.contains(t))) return null;
    if (t.closest('svg') && t.tagName.toLowerCase() !== 'svg') t = t.closest('svg');
    if (t === this.body) return { ref: t, where: 'inside' };
    const r = t.getBoundingClientRect();
    const parent = t.parentElement;
    const pcs = this.win.getComputedStyle(parent);
    const cs = this.win.getComputedStyle(t);
    const horizontal = (/flex/.test(pcs.display) && !/column/.test(pcs.flexDirection))
      || (/grid/.test(pcs.display) && r.width < parent.getBoundingClientRect().width * 0.7)
      || /^inline/.test(cs.display);
    const rel = horizontal ? (x - r.left) / (r.width || 1) : (y - r.top) / (r.height || 1);
    if (this.isContainer(t) && rel > 0.25 && rel < 0.75) return { ref: t, where: 'inside' };
    return { ref: t, where: rel < 0.5 ? 'before' : 'after', horizontal };
  }

  placeNode(node, drop) {
    if (drop.where === 'before') drop.ref.before(node);
    else if (drop.where === 'after') drop.ref.after(node);
    else drop.ref.append(node);
  }

  /* palette drag (blocks dragged from the Insert panel into the iframe) */
  onPaletteOver(e) {
    if (!this.paletteDrag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    this.autoScroll(e.clientY);
    this.paletteDrop = this.computeDrop(e.target, e.clientX, e.clientY, null);
    this.showDrop(this.paletteDrop);
  }
  onPaletteDrop(e) {
    if (!this.paletteDrag) return;
    e.preventDefault();
    const drop = this.paletteDrop || { ref: this.body, where: 'inside' };
    this.insertHTML(this.paletteDrag, drop);
    this.paletteDrag = null;
    this.showDrop(null);
  }
  endPaletteDrag() { this.paletteDrag = null; this.paletteDrop = null; this.showDrop(null); }

  /* ---------------- chrome (toolbar, handles, shield) ---------------- */
  bindChrome() {
    const { toolbar, selectBox, shield, frame } = this.els;
    toolbar.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.preventDefault();
      const act = btn.dataset.act;
      if (act === 'drag') {
        this.startDrag(this.selected);
        this.shieldMode = 'drag';
        shield.classList.remove('hidden');
        return;
      }
      this.action(act);
    });
    selectBox.querySelectorAll('.ov-handle').forEach((hd) => {
      hd.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const el = this.selected;
        if (!el) return;
        const r = el.getBoundingClientRect();
        this.resizing = { el, handle: hd.dataset.handle, x: e.clientX, y: e.clientY, w: r.width, h: r.height };
        this.shieldMode = 'resize';
        shield.style.cursor = getComputedStyle(hd).cursor;
        shield.classList.remove('hidden');
      });
    });
    shield.addEventListener('mousemove', (e) => {
      if (this.shieldMode === 'drag' && this.drag) {
        const fr = frame.getBoundingClientRect();
        this.dragMove((e.clientX - fr.left) / this.zoom, (e.clientY - fr.top) / this.zoom);
      } else if (this.shieldMode === 'resize' && this.resizing) {
        const R = this.resizing;
        const dx = (e.clientX - R.x) / this.zoom;
        const dy = (e.clientY - R.y) / this.zoom;
        if (R.handle.includes('e')) R.el.style.setProperty('width', Math.max(4, Math.round(R.w + dx)) + 'px', 'important');
        if (R.handle.includes('s')) R.el.style.setProperty('height', Math.max(2, Math.round(R.h + dy)) + 'px', 'important');
        if (R.handle === 'e' && R.el.tagName === 'IMG') R.el.style.setProperty('height', 'auto', 'important');
        R.el.style.setProperty('max-width', 'none', 'important');
        this.emit('select', R.el);
      }
    });
    const endShield = () => {
      if (shield.classList.contains('hidden')) return;
      shield.classList.add('hidden');
      shield.style.cursor = '';
      if (this.shieldMode === 'drag') this.endDrag(true);
      if (this.shieldMode === 'resize' && this.resizing) { this.resizing = null; this.commit(); }
      this.shieldMode = null;
    };
    shield.addEventListener('mouseup', endShield);
    window.addEventListener('mouseup', () => {
      endShield();
      if (this.drag) this.endDrag(false);
      this.pending = null;
    });
    window.addEventListener('mousedown', (e) => { if (!this.els.ctxMenu.contains(e.target)) this.hideContextMenu(); });
  }

  /* ---------------- context menu ---------------- */
  onContext(e) {
    e.preventDefault();
    const t = this.targetOf(e.target);
    if (!t) return;
    if (!(this.selected && this.selected.contains(t))) this.select(t);
    const fr = this.els.frame.getBoundingClientRect();
    this.showContextMenu(fr.left + e.clientX * this.zoom, fr.top + e.clientY * this.zoom);
  }

  showContextMenu(x, y) {
    const m = this.els.ctxMenu;
    const el = this.selected;
    const items = [
      ['edit-text', 'Sửa chữ', 'Dbl-click', el && this.canEditText(el)],
      ['parent', 'Chọn phần tử cha', 'Esc', el && el !== this.body],
      '-',
      ['duplicate', 'Nhân bản', 'Ctrl+D', el && el !== this.body],
      ['copy', 'Sao chép', 'Ctrl+C', el && el !== this.body],
      ['paste', 'Dán', 'Ctrl+V', !!this.clipboard],
      '-',
      ['copy-style', 'Sao chép style', 'Ctrl+Alt+C', !!el],
      ['paste-style', 'Dán style', 'Ctrl+Alt+V', el && !!this.styleClipboard],
      '-',
      ['component', 'Lưu thành component', '', el && el !== this.body],
      ['hide', 'Ẩn phần tử', '', el && el !== this.body],
      ['delete', 'Xoá', 'Del', el && el !== this.body],
    ];
    m.innerHTML = '';
    for (const it of items) {
      if (it === '-') { m.append(document.createElement('hr')); continue; }
      const [act, label, kbd, enabled] = it;
      if (!enabled) continue;
      const b = document.createElement('button');
      b.innerHTML = `<span>${label}</span><span class="kbd">${kbd}</span>`;
      b.onclick = () => { this.hideContextMenu(); this.action(act); };
      m.append(b);
    }
    m.classList.remove('hidden');
    const mw = m.offsetWidth;
    const mh = m.offsetHeight;
    m.style.left = Math.min(x, innerWidth - mw - 8) + 'px';
    m.style.top = Math.min(y, innerHeight - mh - 8) + 'px';
  }
  hideContextMenu() { this.els.ctxMenu.classList.add('hidden'); }

  /* ---------------- actions ---------------- */
  action(act) {
    const el = this.selected;
    switch (act) {
      case 'parent': return this.selectParent();
      case 'up': return this.moveSibling(-1);
      case 'down': return this.moveSibling(1);
      case 'duplicate': return this.duplicate();
      case 'delete': return this.remove();
      case 'copy': if (el && el !== this.body) this.clipboard = el.outerHTML; return;
      case 'paste': if (this.clipboard) this.insertHTML(this.clipboard); return;
      case 'copy-style': return this.copyStyle();
      case 'paste-style': return this.pasteStyle();
      case 'hide': if (el) { this.toggleHidden(el); } return;
      case 'edit-text': if (el) this.startEditing(el); return;
      case 'component': if (el) this.emit('save-component', el); return;
      default:
    }
  }

  selectParent() {
    const el = this.selected;
    if (!el) return;
    if (el === this.body) { this.select(null); return; }
    this.select(el.parentElement);
  }

  visibleSibling(el, dir) {
    let s = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    while (s && NON_VISUAL.has(s.tagName.toLowerCase())) s = dir < 0 ? s.previousElementSibling : s.nextElementSibling;
    return s;
  }

  moveSibling(dir) {
    const el = this.selected;
    if (!el || el === this.body) return;
    const s = this.visibleSibling(el, dir);
    if (!s) return;
    if (dir < 0) s.before(el); else s.after(el);
    this.commit();
    this.emit('select', el);
  }

  duplicate() {
    const el = this.selected;
    if (!el || el === this.body) return;
    const c = el.cloneNode(true);
    el.after(c);
    this.select(c);
    this.commit();
  }

  remove() {
    const el = this.selected;
    if (!el || el === this.body) return;
    const next = this.visibleSibling(el, 1) || this.visibleSibling(el, -1) || el.parentElement;
    el.remove();
    this.select(next);
    this.commit();
  }

  toggleHidden(el) {
    if (el.hasAttribute('data-fes-hidden')) {
      const prev = el.getAttribute('data-fes-hidden');
      el.removeAttribute('data-fes-hidden');
      if (prev) el.style.setProperty('display', prev.replace(/!important$/, ''), prev.endsWith('!important') ? 'important' : '');
      else el.style.removeProperty('display');
      if (!el.getAttribute('style')) el.removeAttribute('style');
    } else {
      const v = el.style.getPropertyValue('display');
      el.setAttribute('data-fes-hidden', v ? v + (el.style.getPropertyPriority('display') ? '!important' : '') : '');
      el.style.setProperty('display', 'none', 'important');
    }
    this.commit();
    this.emit('select', this.selected);
  }

  copyStyle() {
    const el = this.selected;
    if (!el) return;
    const cs = this.win.getComputedStyle(el);
    this.styleClipboard = Object.fromEntries(STYLE_COPY_PROPS.map((p) => [p, cs.getPropertyValue(p)]));
    this.emit('toast', 'Đã sao chép style');
  }
  pasteStyle() {
    const el = this.selected;
    if (!el || !this.styleClipboard) return;
    for (const [p, v] of Object.entries(this.styleClipboard)) el.style.setProperty(p, v, 'important');
    this.commit();
    this.emit('select', el);
  }

  /** Parse an HTML fragment into a node owned by the canvas document. */
  fragmentToNode(html) {
    const tpl = this.doc.createElement('template');
    tpl.innerHTML = html.trim();
    tpl.content.querySelectorAll('script').forEach((s) => s.remove());
    tpl.content.querySelectorAll('*').forEach((n) => {
      for (const a of Array.from(n.attributes)) if (/^on/i.test(a.name)) n.removeAttribute(a.name);
    });
    const els = tpl.content.children;
    if (els.length === 1) return els[0];
    const wrap = this.doc.createElement('div');
    wrap.append(tpl.content);
    return wrap;
  }

  insertHTML(html, drop) {
    if (!this.doc) return null;
    const node = this.fragmentToNode(html);
    if (!drop) {
      const sel = this.selected;
      if (sel && sel !== this.body) {
        const empty = this.isContainer(sel) && !sel.children.length && !sel.textContent.trim();
        drop = { ref: sel, where: empty ? 'inside' : 'after' };
      } else drop = { ref: this.body, where: 'inside' };
    }
    this.placeNode(node, drop);
    this.select(node, { scroll: true });
    this.commit();
    return node;
  }

  setStyle(el, prop, value, commit = false) {
    if (!el) return;
    if (value === '' || value == null) el.style.removeProperty(prop);
    else el.style.setProperty(prop, value, 'important');
    if (!el.getAttribute('style')) el.removeAttribute('style');
    if (commit) this.commit();
  }

  /* ---------------- keyboard ---------------- */
  handleKey(e) {
    if (!this.doc) return;
    if (this.editing) {
      if (e.key === 'Escape') { e.preventDefault(); this.stopEditing(); }
      return;
    }
    const t = e.target;
    const inField = t && t.ownerDocument === document && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
    if (inField) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const el = this.selected;
    let handled = true;
    if (mod && k === 'z') e.shiftKey ? this.redo() : this.undo();
    else if (mod && k === 'y') this.redo();
    else if (mod && k === 's') this.emit('save-request');
    else if (mod && e.altKey && k === 'c') this.copyStyle();
    else if (mod && e.altKey && k === 'v') this.pasteStyle();
    else if (mod && k === 'd') this.duplicate();
    else if (mod && k === 'c' && el) this.action('copy');
    else if (mod && k === 'v' && this.clipboard) this.action('paste');
    else if (k === 'delete' || k === 'backspace') this.remove();
    else if (k === 'escape') this.selectParent();
    else if (k === 'enter' && el) {
      const child = Array.from(el.children).find((c) => !NON_VISUAL.has(c.tagName.toLowerCase()));
      if (this.canEditText(el) && (!child || INLINE_TEXT.test(el.tagName.toLowerCase()))) this.startEditing(el);
      else if (child) this.select(child, { scroll: true });
    } else if (e.altKey && (k === 'arrowup' || k === 'arrowleft')) this.moveSibling(-1);
    else if (e.altKey && (k === 'arrowdown' || k === 'arrowright')) this.moveSibling(1);
    else if (k.startsWith('arrow') && el && el !== this.body) {
      const pos = this.win.getComputedStyle(el).position;
      if (pos === 'static') { handled = false; }
      else {
        const step = e.shiftKey ? 10 : 1;
        const cs = this.win.getComputedStyle(el);
        const top = parseFloat(cs.top) || 0;
        const left = parseFloat(cs.left) || 0;
        if (k === 'arrowup') this.setStyle(el, 'top', top - step + 'px');
        if (k === 'arrowdown') this.setStyle(el, 'top', top + step + 'px');
        if (k === 'arrowleft') this.setStyle(el, 'left', left - step + 'px');
        if (k === 'arrowright') this.setStyle(el, 'left', left + step + 'px');
        clearTimeout(this.nudgeT);
        this.nudgeT = setTimeout(() => this.commit(), 400);
        this.emit('select', el);
      }
    } else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }
}
