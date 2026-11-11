// Source-folder runner: detects the stack of a local project, installs the tools /
// dependencies it needs, starts it and reports the local URL so it can be snapshotted.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import express from 'express';

const IS_WIN = process.platform === 'win32';
const jobs = new Map();

const exists = (dir, f) => fs.existsSync(path.join(dir, f));
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

function hasCmd(cmd) {
  try { execSync(IS_WIN ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2500 }, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

const STATIC_DIRS = ['', 'dist', 'build', 'out', 'public', 'www', 'docs', 'site', 'src'];

export function detect(dir) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Thư mục không tồn tại: ' + dir);

  if (exists(dir, 'package.json')) {
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { /* ignore */ }
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const framework =
      deps.next ? 'next' : deps.nuxt ? 'nuxt' : deps['@angular/core'] ? 'angular' : deps['@sveltejs/kit'] ? 'sveltekit' :
      deps.astro ? 'astro' : deps.gatsby ? 'gatsby' : deps['react-scripts'] ? 'cra' : deps['@vue/cli-service'] ? 'vue-cli' :
      deps.vite ? 'vite' : deps['@remix-run/dev'] ? 'remix' : deps.parcel ? 'parcel' : 'node';
    const pm = exists(dir, 'pnpm-lock.yaml') ? 'pnpm' : exists(dir, 'yarn.lock') ? 'yarn'
      : (exists(dir, 'bun.lockb') || exists(dir, 'bun.lock')) ? 'bun' : 'npm';
    const scripts = pkg.scripts || {};
    const script = ['dev', 'start', 'serve', 'develop', 'preview'].find((s) => scripts[s]);
    if (script) return { type: 'node', framework, pm, script, label: `Node.js · ${framework} · ${pm} run ${script}` };
  }
  if (exists(dir, 'manage.py')) return { type: 'django', label: 'Python · Django' };
  if (exists(dir, 'artisan')) return { type: 'laravel', label: 'PHP · Laravel' };
  if (exists(dir, 'Gemfile') && exists(dir, 'config/routes.rb')) return { type: 'rails', label: 'Ruby · Rails' };
  for (const app of ['app.py', 'main.py', 'wsgi.py']) {
    if (exists(dir, app)) {
      const req = exists(dir, 'requirements.txt') ? fs.readFileSync(path.join(dir, 'requirements.txt'), 'utf8').toLowerCase() : '';
      const src = fs.readFileSync(path.join(dir, app), 'utf8');
      if (req.includes('flask') || /from flask import|import flask/i.test(src)) return { type: 'flask', app, label: 'Python · Flask' };
    }
  }
  for (const d of STATIC_DIRS) {
    if (exists(dir, path.join(d, 'index.html'))) return { type: 'static', root: path.join(dir, d), entry: 'index.html', label: `HTML tĩnh · ${d || '.'}/index.html` };
  }
  const files = fs.readdirSync(dir);
  if (files.some((f) => f.endsWith('.php'))) return { type: 'php', label: 'PHP thuần' };
  const html = files.find((f) => /\.html?$/i.test(f));
  if (html) return { type: 'static', root: dir, entry: html, label: `HTML tĩnh · ${html}` };
  return null;
}

function log(job, line) {
  const clean = stripAnsi(String(line)).replace(/\r/g, '');
  for (const l of clean.split('\n')) {
    if (!l.trim()) continue;
    job.logs.push(l);
    if (job.logs.length > 600) job.logs.shift();
  }
}

function sh(job, command, { cwd, env, onLine } = {}) {
  log(job, '$ ' + command);
  const p = spawn(command, {
    cwd: cwd || job.dir,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0', BROWSER: 'none', ...env },
    detached: !IS_WIN,
  });
  const handle = (d) => { const s = d.toString(); log(job, s); if (onLine) onLine(stripAnsi(s)); };
  p.stdout.on('data', handle);
  p.stderr.on('data', handle);
  const done = new Promise((resolve) => {
    p.on('exit', (code) => resolve(code));
    p.on('error', (e) => { log(job, 'Lỗi: ' + e.message); resolve(-1); });
  });
  return { proc: p, done };
}

function killTree(p) {
  if (!p || p.exitCode !== null) return;
  try {
    if (IS_WIN) spawn(`taskkill /pid ${p.pid} /T /F`, { shell: true, stdio: 'ignore' });
    else process.kill(-p.pid, 'SIGTERM');
  } catch { /* ignore */ }
}

function setStatus(job, status, extra = {}) { Object.assign(job, { status }, extra); log(job, `» ${status}${extra.error ? ': ' + extra.error : ''}`); }

async function waitReady(job, port, proc) {
  const deadline = Date.now() + 240000;
  const fallback = `http://localhost:${port}/`;
  while (Date.now() < deadline) {
    if (job.stopped) return null;
    if (proc && proc.exitCode !== null) throw new Error('Tiến trình đã dừng (exit ' + proc.exitCode + '). Xem log để biết chi tiết.');
    const candidates = [...new Set([job.detectedUrl, fallback].filter(Boolean))];
    for (const u of candidates) if (await ping(u)) return u;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Quá thời gian chờ server khởi động');
}

const URL_IN_LOG = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):\d+[^\s'"]*)/i;

async function runNode(job, info) {
  let pm = info.pm;
  if (pm !== 'npm' && !hasCmd(pm)) {
    log(job, `Không tìm thấy ${pm} – sẽ dùng tạm qua npx (tự tải về).`);
    pm = `npx --yes ${pm}`;
  }
  if (!exists(job.dir, 'node_modules')) {
    setStatus(job, 'installing');
    let code = await sh(job, `${pm} install`).done;
    if (code !== 0 && info.pm === 'npm') code = await sh(job, 'npm install --legacy-peer-deps').done;
    if (code !== 0) throw new Error('Cài dependencies thất bại');
  }
  setStatus(job, 'starting');
  const port = await freePort();
  const portFlag = {
    vite: `--port ${port}`, sveltekit: `--port ${port}`, astro: `--port ${port}`, 'vue-cli': `--port ${port}`,
    angular: `--port ${port}`, nuxt: `--port ${port}`, next: `--port ${port}`, remix: `--port ${port}`, gatsby: `-p ${port}`, parcel: `--port ${port}`,
  }[info.framework] || '';
  const sep = info.pm === 'npm' && portFlag ? ' --' : '';
  const r = sh(job, `${pm} run ${info.script}${sep} ${portFlag}`.trim(), {
    env: { PORT: String(port) },
    onLine: (s) => { const m = URL_IN_LOG.exec(s); if (m && !job.detectedUrl) job.detectedUrl = m[1].replace('0.0.0.0', 'localhost').replace(/[).,]+$/, ''); },
  });
  job.proc = r.proc;
  return waitReady(job, port, r.proc);
}

async function runPython(job, info) {
  const py = hasCmd('python') ? 'python' : hasCmd('python3') ? 'python3' : null;
  if (!py) throw new Error('Cần Python. Hãy cài Python từ https://www.python.org/downloads/');
  let bin = py;
  if (exists(job.dir, 'requirements.txt')) {
    const venvPy = IS_WIN ? path.join(job.dir, '.venv', 'Scripts', 'python.exe') : path.join(job.dir, '.venv', 'bin', 'python');
    if (!fs.existsSync(venvPy)) {
      setStatus(job, 'installing');
      if ((await sh(job, `${py} -m venv .venv`).done) !== 0) throw new Error('Không tạo được virtualenv');
      if ((await sh(job, `"${venvPy}" -m pip install -r requirements.txt`).done) !== 0) throw new Error('Cài requirements thất bại');
    }
    bin = `"${venvPy}"`;
  }
  setStatus(job, 'starting');
  const port = await freePort();
  const cmd = info.type === 'django'
    ? `${bin} manage.py runserver 127.0.0.1:${port} --noreload`
    : `${bin} -m flask --app ${info.app.replace(/\.py$/, '')} run --port ${port}`;
  const r = sh(job, cmd);
  job.proc = r.proc;
  return waitReady(job, port, r.proc);
}

async function runPhp(job, info) {
  if (!hasCmd('php')) throw new Error('Cần PHP để chạy dự án này. Cài PHP (https://windows.php.net/download) rồi thử lại.');
  setStatus(job, 'starting');
  const port = await freePort();
  if (info.type === 'laravel') {
    if (!exists(job.dir, 'vendor')) {
      setStatus(job, 'installing');
      if (!hasCmd('composer')) throw new Error('Cần Composer (https://getcomposer.org) để cài dependencies Laravel.');
      if ((await sh(job, 'composer install').done) !== 0) throw new Error('composer install thất bại');
    }
    const r = sh(job, `php artisan serve --port=${port}`);
    job.proc = r.proc;
    return waitReady(job, port, r.proc);
  }
  const r = sh(job, `php -S 127.0.0.1:${port}`);
  job.proc = r.proc;
  return waitReady(job, port, r.proc);
}

async function runRails(job) {
  if (!hasCmd('ruby')) throw new Error('Cần Ruby để chạy dự án Rails.');
  setStatus(job, 'installing');
  if ((await sh(job, 'bundle install').done) !== 0) throw new Error('bundle install thất bại');
  setStatus(job, 'starting');
  const port = await freePort();
  const r = sh(job, `bundle exec rails server -p ${port}`);
  job.proc = r.proc;
  return waitReady(job, port, r.proc);
}

async function runStatic(job, info) {
  setStatus(job, 'starting');
  const port = await freePort();
  const app = express();
  app.use(express.static(info.root, { extensions: ['html'] }));
  await new Promise((resolve) => { job.server = app.listen(port, '127.0.0.1', resolve); });
  log(job, `Phục vụ ${info.root} tại cổng ${port}`);
  return `http://127.0.0.1:${port}/${encodeURI(info.entry)}`;
}

export function startJob(dir) {
  dir = path.resolve(dir);
  const info = detect(dir);
  if (!info) throw new Error('Không nhận diện được loại dự án trong thư mục này (cần package.json, index.html, manage.py, *.php ...)');
  const id = Math.random().toString(36).slice(2, 10);
  const job = { id, dir, info, status: 'detected', logs: [], url: null, error: null };
  jobs.set(id, job);
  log(job, `Nhận diện: ${info.label}`);
  (async () => {
    try {
      const runner = { node: runNode, django: runPython, flask: runPython, laravel: runPhp, php: runPhp, rails: runRails, static: runStatic }[info.type];
      const url = await runner(job, info);
      if (url && !job.stopped) setStatus(job, 'ready', { url });
    } catch (e) {
      setStatus(job, 'error', { error: e.message });
      stopJob(id, true);
    }
  })();
  return publicJob(job);
}

export function getJob(id) {
  const j = jobs.get(id);
  return j ? publicJob(j) : null;
}

export function stopJob(id, keepStatus = false) {
  const j = jobs.get(id);
  if (!j) return false;
  j.stopped = true;
  killTree(j.proc);
  if (j.server) j.server.close();
  if (!keepStatus) setStatus(j, 'stopped');
  return true;
}

export function stopAll() { for (const id of jobs.keys()) stopJob(id); }

function publicJob(j) {
  return { id: j.id, dir: j.dir, info: j.info, status: j.status, url: j.url, error: j.error, logs: j.logs.slice(-200) };
}

export function listDir(p) {
  if (!p) {
    if (IS_WIN) {
      const drives = [];
      for (let c = 65; c <= 90; c++) { const d = String.fromCharCode(c) + ':\\'; try { if (fs.existsSync(d)) drives.push({ name: d, path: d }); } catch { /* ignore */ } }
      return { path: '', parent: null, dirs: drives };
    }
    p = '/';
  }
  const abs = path.resolve(p);
  const dirs = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') dirs.push({ name: e.name, path: path.join(abs, e.name) });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  const parent = path.dirname(abs) === abs ? (IS_WIN ? '' : null) : path.dirname(abs);
  let detected = null;
  try { detected = detect(abs); } catch { /* ignore */ }
  return { path: abs, parent, dirs, detected };
}
