// Snapshot engine: loads a URL in headless Chromium, waits for it to render, then
// serialises the live DOM + all CSS into ONE self-contained, script-free HTML file
// (images/fonts inlined as data URIs) that can be edited offline and carried anywhere.
import { getBrowser } from './browser.js';
import { validateViewportWidth } from '../public/js/viewport.js';

const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;

const MIME_BY_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  css: 'text/css',
};

function guessMime(url, header) {
  const h = (header || '').split(';')[0].trim();
  if (h && h !== 'application/octet-stream' && h !== 'binary/octet-stream') return h;
  const m = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url);
  return (m && MIME_BY_EXT[m[1].toLowerCase()]) || h || 'application/octet-stream';
}

const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+?)\1\s*\)/g;

async function autoScroll(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let y = 0;
    for (let i = 0; i < 40 && y < document.documentElement.scrollHeight; i++) {
      y += Math.max(300, window.innerHeight * 0.8);
      window.scrollTo(0, y);
      await sleep(160);
    }
    window.scrollTo(0, 0);
    await sleep(350);
  });
}

/* ---------- Runs INSIDE the page (phase 1): clone DOM, collect CSS + asset urls ---------- */
function collectInPage() {
  const abs = (u, base) => { try { return new URL(u, base || document.baseURI).href; } catch { return u; } };
  const URL_RE = /url\(\s*(['"]?)([^'")]+?)\1\s*\)/g;
  const absCss = (css, base) => css.replace(URL_RE, (m, q, u) => {
    if (/^(data:|#|about:|blob:)/i.test(u.trim())) return m;
    return `url("${abs(u.trim(), base)}")`;
  });

  const ruleText = (sheet, depth) => {
    let out = '';
    for (const r of sheet.cssRules) {
      if (r.type === 3 /* IMPORT */) {
        try {
          if (r.styleSheet && depth < 6) {
            const inner = ruleText(r.styleSheet, depth + 1);
            const m = r.media && r.media.mediaText;
            out += m ? `@media ${m}{\n${inner}\n}\n` : inner + '\n';
            continue;
          }
        } catch { /* cross-origin import */ }
        out += absCss(r.cssText, sheet.href || document.baseURI) + '\n';
        continue;
      }
      out += absCss(r.cssText, sheet.href || document.baseURI) + '\n';
    }
    return out;
  };

  // 1. stylesheets (keep document order via ownerNode placeholders)
  const sheets = [];
  const sheetIdx = new Map();
  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode;
    if (!owner) continue;
    const idx = sheets.length;
    sheetIdx.set(owner, idx);
    if (sheet.disabled) { sheets.push({ css: '' }); continue; }
    const media = sheet.media && sheet.media.mediaText && sheet.media.mediaText !== 'all' ? sheet.media.mediaText : '';
    try {
      sheets.push({ css: ruleText(sheet, 0), media });
    } catch {
      sheets.push({ fetch: true, href: sheet.href, media });
    }
  }
  let adopted = '';
  try {
    for (const s of document.adoptedStyleSheets || []) adopted += ruleText(s, 0);
  } catch { /* ignore */ }

  // 2. clone & sanitise
  const live = [document.documentElement, ...document.documentElement.querySelectorAll('*')];
  const clone = document.documentElement.cloneNode(true);
  const cl = [clone, ...clone.querySelectorAll('*')];
  const refs = [];       // [el, attr, url] to inline later
  const styleRefs = [];  // elements whose style attr contains url()
  const urls = new Set();
  const addRef = (el, attr, url) => { if (url && !/^data:/i.test(url)) { refs.push([el, attr, url]); urls.add(url); } };

  for (let i = 0; i < live.length; i++) {
    const L = live[i];
    const C = cl[i];
    if (!C) continue;
    const tag = L.tagName.toLowerCase();

    if (sheetIdx.has(L)) {
      const s = document.createElement('style');
      s.setAttribute('data-fes-sheet', String(sheetIdx.get(L)));
      C.replaceWith(s);
      continue;
    }
    if (tag === 'script' || tag === 'noscript' || tag === 'base') { C.remove(); continue; }
    if (tag === 'link') {
      const rel = (L.getAttribute('rel') || '').toLowerCase();
      if (/icon/.test(rel)) { C.setAttribute('href', abs(L.getAttribute('href') || '')); }
      else { C.remove(); continue; }
    }
    if (tag === 'meta') {
      const he = (L.getAttribute('http-equiv') || '').toLowerCase();
      if (he === 'content-security-policy' || he === 'refresh' || L.hasAttribute('charset')) { C.remove(); continue; }
    }

    for (const a of Array.from(C.attributes)) {
      if (/^on/i.test(a.name)) C.removeAttribute(a.name);
    }

    if (tag === 'a' || tag === 'area') {
      const h = L.getAttribute('href');
      if (h != null) C.setAttribute('href', /^\s*javascript:/i.test(h) ? '#' : (h.startsWith('#') ? h : abs(h)));
    }
    if (tag === 'form') { C.removeAttribute('action'); }

    if (tag === 'img') {
      const src = L.currentSrc || L.src;
      ['srcset', 'sizes', 'loading', 'decoding', 'fetchpriority'].forEach((a) => C.removeAttribute(a));
      if (src) { C.setAttribute('src', src); addRef(C, 'src', src); }
    }
    if (tag === 'source') {
      if (L.parentElement && L.parentElement.tagName === 'PICTURE') { C.remove(); continue; }
      if (L.getAttribute('src')) C.setAttribute('src', abs(L.getAttribute('src')));
      if (L.getAttribute('srcset')) C.removeAttribute('srcset');
    }
    if (tag === 'video' || tag === 'audio' || tag === 'iframe' || tag === 'embed' || tag === 'track') {
      const s = L.getAttribute('src');
      if (s) C.setAttribute('src', abs(s));
      if (tag === 'video' && L.getAttribute('poster')) { const p = abs(L.getAttribute('poster')); C.setAttribute('poster', p); addRef(C, 'poster', p); }
    }
    if (tag === 'image' || tag === 'use' || tag === 'feimage') {
      for (const attr of ['href', 'xlink:href']) {
        const v = L.getAttribute(attr);
        if (v && !v.startsWith('#')) { const u = abs(v); C.setAttribute(attr, u); if (tag === 'image') addRef(C, attr, u); }
      }
    }
    if (tag === 'input') {
      const t = (L.type || '').toLowerCase();
      if (t === 'checkbox' || t === 'radio') { if (L.checked) C.setAttribute('checked', ''); else C.removeAttribute('checked'); }
      else if (t === 'password' || t === 'file') C.removeAttribute('value');
      else C.setAttribute('value', L.value);
    }
    if (tag === 'textarea') C.textContent = L.value;
    if (tag === 'select') {
      Array.from(C.options || []).forEach((o, k) => { if (L.options[k] && L.options[k].selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
    }
    if (tag === 'canvas') {
      try {
        const img = document.createElement('img');
        img.src = L.toDataURL('image/png');
        for (const a of ['id', 'class', 'style']) if (L.getAttribute(a)) img.setAttribute(a, L.getAttribute(a));
        const r = L.getBoundingClientRect();
        img.style.width = r.width + 'px';
        img.style.height = r.height + 'px';
        C.replaceWith(img);
        continue;
      } catch { /* tainted canvas */ }
    }
    const st = C.getAttribute && C.getAttribute('style');
    if (st && st.includes('url(')) {
      const fixed = absCss(st, document.baseURI);
      C.setAttribute('style', fixed);
      fixed.replace(URL_RE, (m, q, u) => { if (!/^data:/i.test(u)) urls.add(u); return m; });
      styleRefs.push(C);
    }
    if (L.shadowRoot) {
      try {
        const t = document.createElement('template');
        t.setAttribute('shadowrootmode', 'open');
        t.setAttribute('shadowrootserializable', '');
        let h = '';
        for (const s of L.shadowRoot.adoptedStyleSheets || []) h += '<style>' + Array.from(s.cssRules).map((r) => r.cssText).join('\n') + '</style>';
        h += L.shadowRoot.innerHTML.replace(/<script[\s\S]*?<\/script>/gi, '');
        t.innerHTML = h;
        C.prepend(t);
      } catch { /* ignore */ }
    }
  }

  window.__fes = { clone, refs, styleRefs, adopted };
  return { title: document.title, sheets, urls: Array.from(urls), baseUrl: document.baseURI };
}

/* ---------- Runs INSIDE the page (phase 2): apply inlined assets, return HTML ---------- */
function finalizeInPage({ sheetCss, map, sourceUrl }) {
  const { clone, refs, styleRefs, adopted } = window.__fes;
  const URL_RE = /url\(\s*(['"]?)([^'")]+?)\1\s*\)/g;
  for (const [el, attr, url] of refs) if (map[url]) el.setAttribute(attr, map[url]);
  for (const el of styleRefs) {
    el.setAttribute('style', el.getAttribute('style').replace(URL_RE, (m, q, u) => (map[u] ? `url("${map[u]}")` : m)));
  }
  for (const s of Array.from(clone.querySelectorAll('style[data-fes-sheet]'))) {
    const i = s.getAttribute('data-fes-sheet');
    s.removeAttribute('data-fes-sheet');
    s.textContent = sheetCss[i] || '';
  }
  let head = clone.querySelector('head');
  if (!head) { head = document.createElement('head'); clone.prepend(head); }
  if (adopted) { const s = document.createElement('style'); s.textContent = adopted; head.appendChild(s); }
  const meta = document.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  head.prepend(meta);
  const src = document.createElement('meta');
  src.setAttribute('name', 'fes-source');
  src.setAttribute('content', sourceUrl);
  head.appendChild(src);
  delete window.__fes;
  return '<!DOCTYPE html>\n' + clone.outerHTML;
}

// Cache only visual resources, never login requests or browser storage.
export function trackResources(page) {
  const cache = new Map();
  let bytes = 0;
  let active = true;
  const listener = async (res) => {
    try {
      if (!['stylesheet', 'image', 'font'].includes(res.request().resourceType()) || res.status() >= 400) return;
      const body = await res.body();
      if (!active || body.length > MAX_ASSET_BYTES) return;
      const previous = cache.get(res.url());
      if (bytes - (previous?.body.length || 0) + body.length > MAX_TOTAL_BYTES) return;
      bytes += body.length - (previous?.body.length || 0);
      cache.set(res.url(), { body, type: res.headers()['content-type'] || '' });
    } catch { /* redirects / aborted */ }
  };
  page.on('response', listener);
  return { cache, stop() { active = false; page.off('response', listener); cache.clear(); } };
}

export async function capture({ url, width = 1440, height = 900, wait = 1200, onProgress = () => {}, page: existingPage, resourceCache }) {
  width = validateViewportWidth(existingPage?.viewportSize()?.width || width);
  if (!existingPage && !/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) url = 'https://' + url;
  const context = existingPage ? existingPage.context() : await (await getBrowser()).newContext({ viewport: { width, height }, ignoreHTTPSErrors: true, deviceScaleFactor: 1 });
  const page = existingPage || await context.newPage();
  const tracker = resourceCache ? null : trackResources(page);
  const cache = resourceCache || tracker.cache;
  const scrollPosition = existingPage ? await page.evaluate(() => ({ x: scrollX, y: scrollY })) : null;
  if (existingPage) width = page.viewportSize()?.width || width;

  let total = 0;
  const dataUris = new Map();
  const toDataUri = async (u, { allowFetch }) => {
    if (dataUris.has(u)) return dataUris.get(u);
    const p = (async () => {
      let entry = cache.get(u);
      if (!entry && allowFetch) {
        try {
          const r = await context.request.get(u, { timeout: 15000 });
          if (r.ok()) {
            const body = await r.body();
            if (body.length <= MAX_ASSET_BYTES) entry = { body, type: r.headers()['content-type'] || '' };
          }
        } catch { /* ignore */ }
      }
      if (!entry || total + entry.body.length > MAX_TOTAL_BYTES) return null;
      total += entry.body.length;
      return `data:${guessMime(u, entry.type)};base64,${entry.body.toString('base64')}`;
    })();
    dataUris.set(u, p);
    return p;
  };

  const fetchText = async (u) => {
    const c = cache.get(u);
    if (c) return c.body.toString('utf8');
    try { const r = await context.request.get(u, { timeout: 15000 }); return r.ok() ? await r.text() : ''; } catch { return ''; }
  };

  const absCss = (css, base) => css.replace(CSS_URL_RE, (m, q, u) => {
    u = u.trim();
    if (/^(data:|#|about:|blob:)/i.test(u)) return m;
    try { return `url("${new URL(u, base).href}")`; } catch { return m; }
  });

  // For CORS-blocked sheets: fetch text + resolve @import recursively.
  const resolveRemoteCss = async (href, depth = 0) => {
    let css = await fetchText(href);
    if (!css) return '';
    const importRe = /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)['"]?\s*\)?\s*([^;]*);/g;
    const imports = [...css.matchAll(importRe)];
    for (const m of imports) {
      let rep = '';
      if (depth < 4) {
        try {
          const child = new URL(m[1], href).href;
          const inner = await resolveRemoteCss(child, depth + 1);
          rep = m[2].trim() ? `@media ${m[2].trim()}{\n${inner}\n}` : inner;
        } catch { /* ignore */ }
      }
      css = css.replace(m[0], rep);
    }
    return absCss(css, href);
  };

  const inlineCss = async (css) => {
    const found = new Set();
    css.replace(CSS_URL_RE, (m, q, u) => { if (/^https?:/i.test(u)) found.add(u); return m; });
    const map = {};
    await Promise.all([...found].map(async (u) => { const d = await toDataUri(u, { allowFetch: false }); if (d) map[u] = d; }));
    return css.replace(CSS_URL_RE, (m, q, u) => (map[u] ? `url("${map[u]}")` : m));
  };

  try {
    onProgress('Đang tải trang...');
    if (!existingPage) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    onProgress('Đang cuộn trang để tải nội dung...');
    await autoScroll(page);
    await page.waitForTimeout(wait);
    const thumb = await page.screenshot({ type: 'jpeg', quality: 50 }).catch(() => null);

    onProgress('Đang phân tích DOM & CSS...');
    const info = await page.evaluate(collectInPage);

    onProgress('Đang đóng gói tài nguyên (ảnh, font)...');
    const sheetCss = {};
    await Promise.all(info.sheets.map(async (s, i) => {
      let css = s.fetch ? (s.href ? await resolveRemoteCss(s.href) : '') : s.css;
      css = await inlineCss(css || '');
      sheetCss[i] = s.media ? `@media ${s.media}{\n${css}\n}` : css;
    }));
    const map = {};
    await Promise.all(info.urls.map(async (u) => { const d = await toDataUri(u, { allowFetch: true }); if (d) map[u] = d; }));

    const html = await page.evaluate(finalizeInPage, { sheetCss, map, sourceUrl: page.url() });
    return {
      html,
      title: info.title || page.url(),
      url: page.url(),
      width,
      thumbnail: thumb ? 'data:image/jpeg;base64,' + thumb.toString('base64') : null,
      sizeBytes: Buffer.byteLength(html),
    };
  } finally {
    tracker?.stop();
    if (existingPage) {
      await page.evaluate(({ x, y }) => { delete window.__fes; window.scrollTo(x, y); }, scrollPosition).catch(() => {});
    } else await context.close().catch(() => {});
  }
}

export async function renderPng({ html, width = 1440, height = 900, fullPage = true }) {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(300);
    return await page.screenshot({ type: 'png', fullPage });
  } finally {
    await context.close().catch(() => {});
  }
}
