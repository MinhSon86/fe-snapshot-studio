// Small UI helpers: element builder, icons, toast, modal, color utilities.
import { enhanceControls } from './workspace-ui.js';

const ICONS = {
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>',
  download: '<path d="M12 4v12M6 10l6 6 6-6"/><path d="M4 20h16"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1"/><path d="M2 19h20"/>',
  tablet: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  arrowUpLeft: '<path d="M7 17V7h10"/><path d="M7 7l10 10"/>',
  move: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
  text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  button: '<rect x="3" y="8" width="18" height="8" rx="4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  columns3: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  card: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 11h16M8 15h8"/>',
  hero: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 10h10M9 14h6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  input: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 12h1"/>',
  minus: '<path d="M4 12h16"/>',
  spacer: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
  badge: '<rect x="4" y="8" width="16" height="8" rx="4"/>',
  nav: '<rect x="2" y="5" width="20" height="5" rx="1"/><path d="M2 15h20"/>',
  footer: '<rect x="2" y="14" width="20" height="6" rx="1"/><path d="M2 9h20"/>',
  code: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>',
  form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  alignJustify: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/>',
  type: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
  moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  brush: '<path d="M14 4l6 6-8 8H6v-6z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};

export function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
}

export function hydrateIcons(root = document) {
  enhanceControls(root);
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.iconDone) return;
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
    el.dataset.iconDone = '1';
  });
}

/** h('div', {class:'x', onclick: fn}, child, 'text') */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value' && tag === 'textarea') el.textContent = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(msg, type = '') {
  const t = h('div', { class: 'toast ' + type }, msg);
  document.getElementById('toast-root').append(t);
  setTimeout(() => t.remove(), type === 'error' ? 5000 : 2600);
}

/** Opens a modal. Returns { el, body, close }. */
export function modal({ title, body, actions = [], width, onClose }) {
  const root = document.getElementById('modal-root');
  const bodyEl = h('div', { class: 'body' });
  if (body) bodyEl.append(body);
  const footer = h('footer');
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  for (const a of actions) {
    footer.append(h('button', { class: 'btn ' + (a.primary ? 'primary' : '') + (a.danger ? ' danger' : ''), onclick: () => a.onClick ? a.onClick(close) : close() }, a.label));
  }
  const m = h('div', { class: 'modal', style: width ? { width } : null },
    h('header', {}, h('span', {}, title), h('button', { class: 'icon-btn', title: 'Đóng hộp thoại này', 'aria-label': 'Đóng hộp thoại', html: icon('x'), onclick: close })),
    bodyEl,
    actions.length ? footer : null);
  const back = h('div', { class: 'modal-backdrop' }, m);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.append(back);
  hydrateIcons(m);
  return { el: m, body: bodyEl, footer, close };
}

export function prompt(title, value = '', label = '') {
  return new Promise((resolve) => {
    const input = h('input', { class: 'txt', value, style: { width: '100%' } });
    let done = false;
    const m = modal({
      title,
      body: h('div', { class: 'form-row' }, label ? h('label', {}, label) : null, input),
      actions: [
        { label: 'Huỷ' },
        { label: 'OK', primary: true, onClick: (close) => { done = true; close(); resolve(input.value); } },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { done = true; m.close(); resolve(input.value); } });
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}

export function confirmBox(title, text, okLabel = 'Đồng ý') {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title, body: h('p', { style: { margin: 0, lineHeight: 1.5 } }, text),
      actions: [{ label: 'Huỷ' }, { label: okLabel, primary: true, onClick: (c) => { done = true; c(); resolve(true); } }],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

export const debounce = (fn, ms) => {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
};

export function download(filename, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function pickFile(accept = 'image/*') {
  return new Promise((resolve) => {
    const i = h('input', { type: 'file', accept });
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
}

/* ---- colors ---- */
export function parseRgb(str) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i.exec(str || '');
  if (!m) return null;
  let a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a };
}
export function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
export function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
}
/** Any CSS color -> {r,g,b,a} using the browser to normalise. */
const _probe = document.createElement('span');
export function toRgb(color) {
  const direct = parseRgb(color);
  if (direct) return direct;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return hexToRgb(color);
  _probe.style.color = '';
  _probe.style.color = color;
  if (!_probe.style.color) return null;
  document.body.append(_probe);
  const c = getComputedStyle(_probe).color;
  _probe.remove();
  return parseRgb(c);
}
export function colorToHex(color) {
  const c = toRgb(color);
  return c ? rgbToHex(c) : '#000000';
}
export function rgbKey(c) { return c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${+c.a.toFixed(3)})` : `rgb(${c.r}, ${c.g}, ${c.b})`; }

export function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}
export function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return Math.floor(s / 60) + ' phút trước';
  if (s < 86400) return Math.floor(s / 3600) + ' giờ trước';
  return new Date(ts).toLocaleDateString('vi-VN');
}
